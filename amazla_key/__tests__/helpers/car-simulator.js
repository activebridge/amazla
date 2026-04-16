/**
 * CarSimulator — VCR-style Tesla vehicle simulator.
 *
 * Attached to BLEHarness, receives raw inbound payload bytes (after the 2-byte
 * length prefix is stripped), parses VCSEC protobuf messages, and pushes framed
 * response notifications back through the harness.  ble-native.js, session.js,
 * framing, chunking and reassembly all run completely unmodified.
 *
 * Uses Node.js `crypto` for P-256 ECDH and HMAC-SHA256 — same math as the
 * watch-side but without the QuickJS constraints.
 */

import { createECDH, createHash, createHmac } from 'crypto'
import { decodeMessage, encodeVarintField, encodeBytes, concat } from '../../lib/tesla-ble/protocol/protobuf.js'

// "authenticated command" — matches CMD_LABEL in lib/tesla-ble/crypto/hmac.js
const CMD_LABEL = Buffer.from('authenticated command')

// InformationRequestType enum values (vcsec.proto)
const INFO_REQUEST_GET_STATUS               = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6

export class CarSimulator {
  constructor(options = {}) {
    // Generate a fresh P-256 vehicle keypair per instance
    const ecdh = createECDH('prime256v1')
    ecdh.generateKeys()
    this._ecdh = ecdh
    // Uncompressed public key: 0x04 || x (32 bytes) || y (32 bytes) = 65 bytes
    this.vehiclePubKey  = new Uint8Array(ecdh.getPublicKey())
    this.vehiclePrivKey = ecdh.getPrivateKey()  // Buffer, 32 bytes
    this.vin = options.vin || new Uint8Array(17).fill(0x58)  // 'XXXXXXXXXXXXXXXXX'

    // Mutable vehicle state — tests set this freely
    this.state = {
      locked:            options.locked !== undefined ? options.locked : true,
      frontDriverDoor:   0,
      frontPassengerDoor:0,
      rearDriverDoor:    0,
      rearPassengerDoor: 0,
      rearTrunk:         0,
      frontTrunk:        0,
      chargePort:        0,
      sleepStatus:       0,
      userPresence:      0,
    }

    // Derived after first SessionInfoRequest
    this._session = null

    // Behavior injection flags (reset between tests)
    this._nextCommandError        = false  // next command returns actionStatus=2 (error)
    this._skipSecondResponse      = false  // don't send actionStatus (triggers 10 s timeout)
    this._sendTwoResponses        = false  // send SessionInfo push then actionStatus (covers clearTimeout path)
    this._sendIntermediateAck     = false  // send bare intermediate ack before real SessionInfo
    this._responseDelay           = 0      // ms delay before sending responses

    // Pairing state
    this._enrolledPublicKey  = null   // watch public key extracted from pair message
    this._pairingAutoTap     = false  // immediately send OK (UNKNOWN_KEY) without WAIT
    this._pairingError       = null   // fault code to inject on next whitelist add (null = none)
    this._pairingPending     = false  // WAIT sent, waiting for triggerNFCTap()
    this._pairingHarness     = null   // harness saved for async NFC tap delivery
    this._ambientCount       = 0      // ambient responses to send before verify WEI
  }

  // ── Called by BLEHarness when a full inbound message payload is assembled ──

  onReceive(payload, harness) {
    const fields = decodeMessage(payload)

    // SessionInfoRequest lives at RoutableMessage field 14
    if (fields[14] instanceof Uint8Array) {
      this._handleSessionInfo(fields[14], harness)
      return
    }

    // Authenticated command: field 10 = ToVCSECMessage, field 13 = SignatureData
    if (fields[10] instanceof Uint8Array) {
      this._handleCommand(fields[10], harness)
      return
    }

    // Pairing message: ToVCSECMessage { field 1 = SignedMessage }
    if (fields[1] instanceof Uint8Array) {
      this._handlePairingMessage(fields[1], harness)
      return
    }
  }

  // ── Session establishment ─────────────────────────────────────────────────

  _handleSessionInfo(sessionInfoRequestBytes, harness) {
    const siReqFields = decodeMessage(sessionInfoRequestBytes)
    const ephemeralPubKey = siReqFields[1]  // Uint8Array, 65 bytes

    // ECDH from vehicle side: vehiclePrivKey × ephemeralPubKey
    // This equals ephemeralPrivKey × vehiclePubKey (ECDH symmetry)
    this._ecdh.setPrivateKey(this.vehiclePrivKey)
    const shared    = this._ecdh.computeSecret(Buffer.from(ephemeralPubKey))
    const keyMat    = createHash('sha1').update(shared).digest()
    const sessionKey = keyMat.subarray(0, 16)
    const cmdKey    = createHmac('sha256', sessionKey).update(CMD_LABEL).digest()

    // Fixed epoch and realistic clock for tests
    const epoch     = new Uint8Array(16).fill(0xab)
    const counter   = 1
    const clockTime = Math.floor(Date.now() / 1000)

    this._session = { sessionKey, cmdKey, epoch, counter, clockTime }

    // Optionally send a bare intermediate ack first (covers session.js lines 153-156).
    // Two fields (5 + 7) so Object.keys() has ≥2 entries — exercises the sort comparator
    // on line 147 of session.js that is otherwise never reached.
    if (this._sendIntermediateAck) {
      this._sendIntermediateAck = false
      harness.notify(this._frame(concat(encodeVarintField(5, 0), encodeVarintField(7, 0))))
    }

    // Build SessionInfo response: RoutableMessage { field 3: SessionInfo }
    // parseSessionInfo expects: field1=counter, field2=pubKey(65b), field3=epoch(16b), field4=clockTime
    const si = concat(
      encodeVarintField(1, counter),
      encodeBytes(2, this.vehiclePubKey),
      encodeBytes(3, epoch),
      encodeVarintField(4, clockTime),
    )
    const response = encodeBytes(3, si)
    harness.notify(this._frame(response))
  }

  // ── Authenticated command dispatch ────────────────────────────────────────

  _handleCommand(toVCSECBytes, harness) {
    // Decode: ToVCSECMessage → field 1 → SignedMessage → field 2 → UnsignedMessage
    const toVcsecFields  = decodeMessage(toVCSECBytes)
    const signedMsgBytes = toVcsecFields[1]
    if (!(signedMsgBytes instanceof Uint8Array)) return

    const signedFields   = decodeMessage(signedMsgBytes)
    const unsignedBytes  = signedFields[2]
    if (!(unsignedBytes instanceof Uint8Array)) return

    const unsigned = decodeMessage(unsignedBytes)

    // Error injection
    if (this._nextCommandError) {
      this._nextCommandError = false
      const errResp = encodeVarintField(1, 2)  // actionStatus = 2 (error)
      this._deliver(harness, errResp)
      return
    }

    // RKE action (field 2 = RKEAction_E enum)
    if (unsigned[2] !== undefined) {
      this._applyRKE(unsigned[2])
      this._sendCommandResponse(harness)
      return
    }

    // ClosureMoveRequest (field 3 = bytes)
    if (unsigned[3] instanceof Uint8Array) {
      const closureFields = decodeMessage(unsigned[3])
      this._applyClosure(closureFields[1], closureFields[2])
      this._sendCommandResponse(harness)
      return
    }

    // InformationRequest (field 1 = bytes)
    if (unsigned[1] instanceof Uint8Array) {
      const infoFields = decodeMessage(unsigned[1])
      if (infoFields[1] === INFO_REQUEST_GET_STATUS) {
        this._deliver(harness, this._buildStatusResponse())
      } else if (infoFields[1] === INFO_REQUEST_GET_WHITELIST_ENTRY_INFO) {
        this._deliver(harness, this._buildWhitelistEntryInfoResponse())
      }
    }
  }

  // ── State mutations ───────────────────────────────────────────────────────

  _applyRKE(action) {
    if (action === 0) this.state.locked = false        // RKE_ACTION_UNLOCK
    if (action === 1) this.state.locked = true          // RKE_ACTION_LOCK
    if (action === 2) this.state.rearTrunk  = 1         // RKE_ACTION_OPEN_TRUNK
    if (action === 3) this.state.frontTrunk = 1         // RKE_ACTION_OPEN_FRUNK
  }

  _applyClosure(closureId, moveType) {
    // closureId: 5 = rearTrunk, 6 = frontTrunk (vcsec.proto ClosureId_E)
    // moveType:  0 = MOVE (toggle open), 1 = CLOSE
    if (closureId === 5) this.state.rearTrunk  = moveType === 1 ? 0 : 1
    if (closureId === 6) this.state.frontTrunk = moveType === 1 ? 0 : 1
  }

  // ── Response building ─────────────────────────────────────────────────────

  // Normal command response: single notification with actionStatus = 1 (success).
  // session.js detects actionStatus present → success path → no two-response dance needed.
  // skipSecondResponse mode: send SessionInfo only (no actionStatus) → triggers 10 s timeout.
  // sendTwoResponses mode: send SessionInfo push then actionStatus → covers clearTimeout path.
  _sendCommandResponse(harness) {
    if (this._skipSecondResponse) {
      // Deliver intermediate ack (SessionInfo only) — session.js will wait for actionStatus
      // which never arrives, triggering the 10 s timeout in sendCommand.
      const push = this._buildSessionInfoPush()
      this._deliver(harness, push)
    } else if (this._sendTwoResponses) {
      this._sendTwoResponses = false
      // Two-response pattern: SessionInfo push first, then actionStatus (success).
      // session.js lines 304-306: clearTimeout fires when second response arrives.
      const push = this._buildSessionInfoPush()
      this._deliver(harness, push)
      this._deliver(harness, encodeVarintField(1, 1))  // actionStatus = 1
    } else {
      const actionResp = encodeVarintField(1, 1)  // actionStatus = 1 (success)
      this._deliver(harness, actionResp)
    }
  }

  _buildSessionInfoPush() {
    if (!this._session) return new Uint8Array(0)
    this._session.counter++
    // Session info push: no publicKey, just counter + epoch + clockTime
    const si = concat(
      encodeVarintField(1, this._session.counter),
      encodeBytes(3, this._session.epoch),
      encodeVarintField(4, this._session.clockTime),
    )
    return encodeBytes(3, si)  // RoutableMessage field 3
  }

  _buildStatusResponse() {
    const s = this.state
    // VehicleStatus: field 1 = closures (bytes), field 2 = lockState, 3 = sleep, 4 = presence
    const closures = concat(
      encodeVarintField(1, s.frontDriverDoor),
      encodeVarintField(2, s.frontPassengerDoor),
      encodeVarintField(3, s.rearDriverDoor),
      encodeVarintField(4, s.rearPassengerDoor),
      encodeVarintField(5, s.rearTrunk),
      encodeVarintField(6, s.frontTrunk),
      encodeVarintField(7, s.chargePort),
    )
    const vehicleStatus = concat(
      encodeBytes(1, closures),
      encodeVarintField(2, s.locked ? 1 : 0),
      encodeVarintField(3, s.sleepStatus),
      encodeVarintField(4, s.userPresence),
    )
    // RoutableMessage field 10 = FromVCSECMessage payload (parseVehicleStatus reads from payload)
    return encodeBytes(10, vehicleStatus)
  }

  _buildWhitelistEntryInfoResponse() {
    // session.js parses: decodeMessage(r.data) → if fields[10] re-parse → fields[17] → parseWhitelistEntryInfo
    // parseWhitelistEntryInfo expects: fields[1] = 65-byte public key
    const wlEntry = encodeBytes(1, this.vehiclePubKey)              // WhitelistEntryInfo { publicKey }
    return encodeBytes(10, encodeBytes(17, wlEntry))                // RoutableMessage field 10 → field 17
  }

  // ── Wire helpers ──────────────────────────────────────────────────────────

  // Wrap payload in the same 2-byte length-prefixed frame that ble-native uses
  _frame(data) {
    const msg = new Uint8Array(2 + data.length)
    msg[0] = (data.length >> 8) & 0xff
    msg[1] = data.length & 0xff
    msg.set(data, 2)
    return msg
  }

  _deliver(harness, responseBytes) {
    if (this._responseDelay > 0) {
      setTimeout(() => harness.notify(this._frame(responseBytes)), this._responseDelay)
    } else {
      harness.notify(this._frame(responseBytes))
    }
  }

  // ── Pairing message handling ──────────────────────────────────────────────

  _handlePairingMessage(signedMsgBytes, harness) {
    const signedFields  = decodeMessage(signedMsgBytes)
    const unsignedBytes = signedFields[2]   // SignedMessage.payload
    if (!(unsignedBytes instanceof Uint8Array)) return
    const unsigned = decodeMessage(unsignedBytes)

    // UnsignedMessage.field 16 = WhitelistOperation → enroll key
    if (unsigned[16] instanceof Uint8Array) {
      this._handleWhitelistAdd(unsigned[16], harness)
      return
    }

    // UnsignedMessage.field 1 = InformationRequest → whitelist query (verify step)
    if (unsigned[1] instanceof Uint8Array) {
      const infoFields = decodeMessage(unsigned[1])
      if (infoFields[1] === INFO_REQUEST_GET_WHITELIST_ENTRY_INFO) {
        this._handleWhitelistQuery(harness)
      }
    }
  }

  _handleWhitelistAdd(whitelistOpBytes, harness) {
    // Extract and remember the watch's enrolled public key
    const wlOp = decodeMessage(whitelistOpBytes)
    const permChange = wlOp[5]             // PermissionChange at field 5
    if (permChange instanceof Uint8Array) {
      const pc = decodeMessage(permChange)
      const pubKeyMsg = pc[1]              // PublicKey at field 1
      if (pubKeyMsg instanceof Uint8Array) {
        const pk = decodeMessage(pubKeyMsg)
        if (pk[1] instanceof Uint8Array) this._enrolledPublicKey = pk[1]
      }
    }

    // Error injection: CommandStatus { field 1 = ERROR, field 3 = wlFault }
    if (this._pairingError !== null) {
      const code = this._pairingError
      this._pairingError = null
      const errResp = encodeBytes(4, concat(
        encodeVarintField(1, 2),                      // operationStatus = ERROR (2)
        encodeBytes(3, encodeVarintField(1, code)),   // whitelistOperationFault
      ))
      this._deliver(harness, errResp)
      return
    }

    if (this._pairingAutoTap) {
      // Skip WAIT: UNKNOWN_KEY (7) → parsePairingResponse returns { status:'ok', hasSigner:true }
      // which drives directly to doVerify without entering waitForNFC().
      this._deliver(harness, encodeVarintField(1, 7))
      return
    }

    // Normal flow: WAIT → client registers waitForNFC() → triggerNFCTap() delivers OK
    this._deliver(harness, encodeVarintField(1, 1))  // operationStatus = WAIT (1)
    this._pairingPending = true
    this._pairingHarness = harness
  }

  _handleWhitelistQuery(harness) {
    // Deliver N ambient notifications first, then the real WEI.
    // Each synchronous deliver fires handleResponse(ambient, attempt) which
    // calls BLE.waitForNextResponse(), registering the callback for the next delivery.
    const n = this._ambientCount
    this._ambientCount = 0
    for (let i = 0; i < n; i++) {
      // Vary payload length so ble-native's frame-sig dedup doesn't drop identical chunks.
      // Any response with ONLY field 3 is treated as ambient by pairing.js doVerify.
      this._deliver(harness, encodeBytes(3, new Uint8Array(i + 1)))
    }
    this._deliver(harness, this._buildWhitelistEntryInfoResponse())
  }

  // ── Test control API ──────────────────────────────────────────────────────

  setState(patch)         { Object.assign(this.state, patch) }
  injectCommandError()    { this._nextCommandError = true }
  skipSecondResponse()    { this._skipSecondResponse = true }
  setDelay(ms)            { this._responseDelay = ms }

  // Pairing control
  setPairingAutoTap(enabled) { this._pairingAutoTap = !!enabled }
  injectPairingError(code)   { this._pairingError = code !== undefined ? code : 5 }
  setAmbientCount(n)         { this._ambientCount = n }

  triggerNFCTap() {
    if (!this._pairingPending || !this._pairingHarness) return
    this._pairingPending = false
    const h = this._pairingHarness
    this._pairingHarness = null
    // CommandStatus { field 3 = WhitelistOperationStatus { field 1 = 0 (success) } }
    this._deliver(h, encodeBytes(4, encodeBytes(3, encodeVarintField(1, 0))))
  }
}
