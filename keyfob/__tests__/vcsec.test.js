import {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_OPEN_TRUNK,
  KEY_ROLE_OWNER,
  KEY_ROLE_DRIVER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  INFO_REQUEST_GET_STATUS,
  INFO_REQUEST_GET_WHITELIST_INFO,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildKeyToAdd,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,
  parseSessionInfo,
  parseRoutableMessage,
  parseCommandStatus,
  parsePairingResponse,
  generateUUID,
  generateRoutingAddress
} from '../lib/tesla-ble/protocol/vcsec.js'

import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'

describe('VCSEC Protocol', () => {
  describe('Constants', () => {
    test('domain constants are defined', () => {
      expect(DOMAIN_VEHICLE_SECURITY).toBe(2)
    })

    test('RKE action constants are defined', () => {
      expect(RKE_ACTION_UNLOCK).toBe(0)
      expect(RKE_ACTION_LOCK).toBe(1)
      expect(RKE_ACTION_OPEN_TRUNK).toBe(2)
    })

    test('key role constants are defined', () => {
      expect(KEY_ROLE_OWNER).toBe(2)   // keys.proto: ROLE_SERVICE=1, ROLE_OWNER=2 — DO NOT CHANGE
      expect(KEY_ROLE_DRIVER).toBe(3)  // keys.proto: ROLE_DRIVER=3 — DO NOT CHANGE
    })

    test('information request type constants are defined', () => {
      // vcsec.proto InformationRequestType enum — DO NOT CHANGE
      expect(INFO_REQUEST_GET_STATUS).toBe(0)
      expect(INFO_REQUEST_GET_WHITELIST_INFO).toBe(5)
      expect(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO).toBe(6)
    })

    test('key form factor constants are defined', () => {
      // vcsec.proto KeyFormFactor enum — DO NOT CHANGE
      expect(KEY_FORM_FACTOR_ANDROID_DEVICE).toBe(7)
    })
  })

  describe('generateUUID', () => {
    test('generates 16 bytes', () => {
      const uuid = generateUUID()
      expect(uuid).toBeInstanceOf(Uint8Array)
      expect(uuid.length).toBe(16)
    })

    test('generates different values', () => {
      const uuid1 = generateUUID()
      const uuid2 = generateUUID()
      expect(Array.from(uuid1)).not.toEqual(Array.from(uuid2))
    })
  })

  describe('generateRoutingAddress', () => {
    test('generates 16 bytes', () => {
      const addr = generateRoutingAddress()
      expect(addr).toBeInstanceOf(Uint8Array)
      expect(addr.length).toBe(16)
    })
  })

  describe('buildSessionInfoRequest', () => {
    test('builds request with public key', () => {
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04 // Uncompressed point marker
      const challenge = new Uint8Array(16)

      const request = buildSessionInfoRequest(publicKey, challenge)
      expect(request).toBeInstanceOf(Uint8Array)
      expect(request.length).toBeGreaterThan(0)

      // Decode and verify structure
      const decoded = decodeMessage(request)
      expect(decoded[1]).toBeDefined() // public key field
      expect(decoded[2]).toBeDefined() // challenge field
      expect(decoded[1].length).toBe(65)
      expect(decoded[2].length).toBe(16)
    })

    test('builds request with only public key', () => {
      const publicKey = new Uint8Array(65)
      const request = buildSessionInfoRequest(publicKey, null)

      const decoded = decodeMessage(request)
      expect(decoded[1]).toBeDefined()
      expect(decoded[2]).toBeUndefined()
    })
  })

  describe('buildInformationRequest', () => {
    test('builds request with type only', () => {
      const req = buildInformationRequest(INFO_REQUEST_GET_WHITELIST_INFO)
      const decoded = decodeMessage(req)

      expect(decoded[1]).toBe(INFO_REQUEST_GET_WHITELIST_INFO) // informationRequestType field 1
      expect(decoded[3]).toBeUndefined() // no publicKey
    })

    test('builds GET_WHITELIST_ENTRY_INFO request with publicKey', () => {
      const publicKey = new Uint8Array(65).fill(0xab)
      publicKey[0] = 0x04

      const req = buildInformationRequest(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO, null, publicKey)
      const decoded = decodeMessage(req)

      // vcsec.proto InformationRequest: informationRequestType=1, keyId=2, publicKey=3
      expect(decoded[1]).toBe(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO) // type = 6
      expect(decoded[2]).toBeUndefined() // no keyId
      expect(decoded[3].length).toBe(65) // publicKey at field 3
    })

    test('builds request with all fields', () => {
      const keyId = new Uint8Array(20).fill(0x11)
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const req = buildInformationRequest(INFO_REQUEST_GET_STATUS, keyId, publicKey)
      const decoded = decodeMessage(req)

      expect(decoded[1]).toBe(INFO_REQUEST_GET_STATUS)
      expect(decoded[2].length).toBe(20) // keyId at field 2
      expect(decoded[3].length).toBe(65) // publicKey at field 3
    })
  })

  describe('buildUnsignedMessage', () => {
    test('builds unlock message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_UNLOCK })
      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      // RKEAction is field 2 in UnsignedMessage — DO NOT CHANGE TO 1
      expect(decoded[2]).toBe(RKE_ACTION_UNLOCK)
    })

    test('builds lock message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_LOCK })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBe(RKE_ACTION_LOCK)
    })

    test('builds trunk message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_OPEN_TRUNK })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBe(RKE_ACTION_OPEN_TRUNK)
    })

    test('builds informationRequest message at field 1', () => {
      const infoReq = buildInformationRequest(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO)
      const message = buildUnsignedMessage({ informationRequest: infoReq })

      const decoded = decodeMessage(message)
      // InformationRequest is field 1 in UnsignedMessage — DO NOT CHANGE TO 4
      expect(decoded[1]).toBeDefined()
      expect(decoded[2]).toBeUndefined() // no rkeAction

      // Verify the informationRequest type is preserved inside
      const infoDecoded = decodeMessage(decoded[1])
      expect(infoDecoded[1]).toBe(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO)
    })
  })

  describe('buildSignedMessage', () => {
    test('builds signed message with all fields', () => {
      const payload = new Uint8Array([0x08, 0x01]) // RKE unlock
      const signature = new Uint8Array(32)
      const epoch = new Uint8Array(16)

      const message = buildSignedMessage({
        payload,
        signatureType: SIGNATURE_TYPE_HMAC,
        signature,
        counter: 1,
        epoch,
        expiresAt: 1234567890
      })

      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      // vcsec.proto: protobufMessageAsBytes=2, signatureType=3
      expect(decoded[2]).toBeDefined() // payload (field 2)
      expect(decoded[3]).toBe(SIGNATURE_TYPE_HMAC) // signatureType (field 3)
      expect(decoded[4]).toBe(1) // counter (field 4)
      expect(decoded[5]).toBeDefined() // signature (field 5)
      expect(decoded[6]).toBeDefined() // epoch (field 6)
      expect(decoded[7]).toBe(1234567890) // expiresAt (field 7)
    })

    test('builds message without optional fields', () => {
      const payload = new Uint8Array([0x08, 0x00])

      const message = buildSignedMessage({ payload })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBeDefined()  // payload at field 2
      expect(decoded[3]).toBeUndefined() // signatureType absent
      expect(decoded[5]).toBeUndefined() // signature absent
    })
  })

  describe('buildToVCSECMessage', () => {
    test('wraps signed message in field 1', () => {
      const signedMessage = new Uint8Array([0x01, 0x02, 0x03])
      const wrapped = buildToVCSECMessage(signedMessage)

      const decoded = decodeMessage(wrapped)
      expect(Array.from(decoded[1])).toEqual([0x01, 0x02, 0x03])
    })
  })

  describe('buildKeyToAdd', () => {
    test('builds PublicKey message with raw key bytes', () => {
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const keyToAdd = buildKeyToAdd(publicKey)

      // Now buildKeyToAdd creates a proper PublicKey message with just PublicKeyRaw (field 1)
      const decoded = decodeMessage(keyToAdd)
      expect(decoded[1].length).toBe(65) // PublicKeyRaw field
      // Role and formFactor are no longer included (they belong in PermissionChange message)
      expect(decoded[2]).toBeUndefined()
      expect(decoded[6]).toBeUndefined()
    })

    test('ignores role and formFactor parameters (deprecated)', () => {
      const publicKey = new Uint8Array(65)
      // These params are now ignored - buildKeyToAdd just creates PublicKey message
      const keyToAdd = buildKeyToAdd(publicKey, 1, KEY_FORM_FACTOR_ANDROID_DEVICE)

      const decoded = decodeMessage(keyToAdd)
      expect(decoded[1].length).toBe(65)
      // Role/formFactor not included
      expect(decoded[2]).toBeUndefined()
    })
  })

  describe('buildWhitelistOperation', () => {
    test('wraps key using addKeyToWhitelistAndAddPermissions with metadata', () => {
      const keyToAdd = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])
      const operation = buildWhitelistOperation(keyToAdd)

      const decoded = decodeMessage(operation)
      // vcsec.proto: addKeyToWhitelistAndAddPermissions = field 5, metadataForKey = field 6
      expect(decoded[5]).toBeDefined()   // addKeyToWhitelistAndAddPermissions (PermissionChange)
      expect(decoded[6]).toBeDefined()   // metadataForKey (field 6)
      expect(decoded[16]).toBeUndefined() // field 16 = removeAllImpermanentKeys (bool), must be absent
    })

    test('includes KeyMetadata with keyFormFactor', () => {
      const keyToAdd = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])
      const operation = buildWhitelistOperation(keyToAdd, KEY_FORM_FACTOR_ANDROID_DEVICE)

      const decoded = decodeMessage(operation)
      // metadataForKey is field 6
      const metadata = decodeMessage(decoded[6])
      expect(metadata[1]).toBe(KEY_FORM_FACTOR_ANDROID_DEVICE) // keyFormFactor is field 1
    })
  })

  describe('buildUnsignedMessageWithWhitelist', () => {
    test('wraps whitelist in field 16', () => {
      const whitelist = new Uint8Array([0x0a, 0x03, 0x01, 0x02, 0x03])
      const message = buildUnsignedMessageWithWhitelist(whitelist)

      const decoded = decodeMessage(message)
      expect(decoded[16]).toBeDefined()
    })
  })

  describe('buildRoutableMessage', () => {
    test('builds message with domain destination', () => {
      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        uuid: new Uint8Array(16)
      })

      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      // Correct field numbers from universal_message.proto
      expect(decoded[6]).toBeDefined() // to_destination (field 6)
      expect(decoded[50]).toBeDefined() // request_uuid (field 50)
    })

    test('builds message with routing address', () => {
      const routingAddress = new Uint8Array(16).fill(0xab)

      const message = buildRoutableMessage({
        routingAddress,
        payload: new Uint8Array([0x01, 0x02])
      })

      const decoded = decodeMessage(message)
      expect(decoded[7]).toBeDefined() // from_destination (field 7)
      expect(decoded[10]).toBeDefined() // protobuf_message_as_bytes (field 10)
    })

    test('builds message with session info request', () => {
      const sessionInfoRequest = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])

      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        sessionInfoRequest
      })

      const decoded = decodeMessage(message)
      expect(decoded[14]).toBeDefined() // session_info_request (field 14)
    })

    test('builds complete pairing message structure', () => {
      // Simulate building a complete pairing message
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const keyToAdd = buildKeyToAdd(publicKey, KEY_ROLE_OWNER, KEY_FORM_FACTOR_ANDROID_DEVICE)
      const whitelistOp = buildWhitelistOperation(keyToAdd)
      const unsignedMessage = buildUnsignedMessageWithWhitelist(whitelistOp)

      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        routingAddress: generateRoutingAddress(),
        payload: unsignedMessage,
        uuid: generateUUID()
      })

      expect(message).toBeInstanceOf(Uint8Array)
      expect(message.length).toBeGreaterThan(80) // Should be substantial
    })
  })

  describe('parseSessionInfo', () => {
    test('parses session info response', async () => {
      // Build a mock session info message
      const { concat, encodeBytes, encodeVarintField } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const publicKey = new Uint8Array(65)
      const epoch = new Uint8Array(16)

      const sessionInfo = concat(
        encodeBytes(1, publicKey),
        encodeBytes(2, epoch),
        encodeVarintField(3, 1234567890),
        encodeVarintField(4, 42)
      )

      const parsed = parseSessionInfo(sessionInfo)
      expect(parsed.publicKey.length).toBe(65)
      expect(parsed.epoch.length).toBe(16)
      expect(parsed.clockTime).toBe(1234567890)
      expect(parsed.counter).toBe(42)
    })
  })

  describe('parseRoutableMessage', () => {
    test('parses routable message response', async () => {
      const { concat, encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const payload = new Uint8Array([0x01, 0x02, 0x03])
      const uuid = new Uint8Array(16)

      // Use correct field numbers: payload=10, uuid=50
      const message = concat(
        encodeBytes(10, payload),
        encodeBytes(50, uuid)
      )

      const parsed = parseRoutableMessage(message)
      expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03])
      expect(parsed.uuid.length).toBe(16)
    })
  })

  describe('parseCommandStatus', () => {
    test('parses OPERATIONSTATUS_WAIT', async () => {
      const { concat, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // CommandStatus { operationStatus (field 1) = WAIT (1) }
      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)

      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_WAIT)
    })

    test('parses OPERATIONSTATUS_OK', async () => {
      const { encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_OK)
      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_OK)
    })

    test('parses OPERATIONSTATUS_ERROR with fault', async () => {
      const { concat, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // CommandStatus with error and whitelist fault
      const commandStatus = concat(
        encodeEnum(1, OPERATIONSTATUS_ERROR),
        encodeEnum(3, 5) // whitelistOperationFault
      )

      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_ERROR)
      expect(parsed.whitelistOperationFault).toBe(5)
    })
  })

  describe('parsePairingResponse', () => {
    // Tesla responds with FromVCSECMessage directly — no RoutableMessage wrapper

    test('parses wait response', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // FromVCSECMessage { commandStatus (field 4) = { operationStatus (field 1) = WAIT } }
      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('wait')
      expect(parsed.message).toBe('Tap key card on car')
    })

    test('parses ok response after keycard tap (field 3 = whitelistOperationStatus sub-message)', async () => {
      const { encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // Real Tesla response: commandStatus has field 3 (bytes) = whitelistOperationStatus
      // operationStatus (field 1) is absent — OK=0 is protobuf default, not encoded
      // Example: 22 0a 1a 08 12 06 0a 04 5f 0d 64 b3
      const whitelistOpStatus = new Uint8Array([0x12, 0x02, 0x08, 0x00])
      const commandStatus = encodeBytes(3, whitelistOpStatus) // field 3 = bytes sub-message
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('ok')
      expect(parsed.message).toBe('Key added successfully')
    })

    test('parses error response', async () => {
      const { concat, encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = concat(
        encodeEnum(1, OPERATIONSTATUS_ERROR),
        encodeEnum(3, 10) // whitelistOperationFault (varint, not bytes)
      )
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
    })

    test('f3B with signerOfOperation (field 2 bytes) is a valid success — signerOfOperation is per vcsec.proto', async () => {
      const { encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // WhitelistOperation_status.signerOfOperation is field 2 (KeyIdentifier = bytes).
      // Per vcsec.proto this is a real field. field 1 absent = NONE = success.
      // This matches the actual response seen on device after auto-approval by an existing key.
      const sha1 = new Uint8Array(20).fill(0xab)
      const keyIdentifier = encodeBytes(1, sha1)         // KeyIdentifier { publicKeySHA1 }
      const wlOpStatus = encodeBytes(2, keyIdentifier)   // WhitelistOperation_status { signerOfOperation }
      const msg = encodeBytes(3, wlOpStatus)             // CommandStatus { whitelistOperationStatus }

      const parsed = parsePairingResponse(msg)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('ok')
      expect(parsed.dbg.path).toBe('f3B')
      expect(parsed.dbg.wlFault).toBe(0)
      expect(parsed.dbg.signer).toBeInstanceOf(Uint8Array)
    })

    test('handles empty response', () => {
      const parsed = parsePairingResponse(new Uint8Array(0))
      expect(parsed.success).toBe(false)
      expect(parsed.error).toContain('command status')
    })

    // Real Tesla format: FromVCSECMessage wrapped in RoutableMessage (field 10)
    test('parses wait response wrapped in RoutableMessage', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)
      const fromVcsec = encodeBytes(4, commandStatus)
      const routable = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routable)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('wait')
      expect(parsed.dbg.wrapped).toBe(true)
    })

    test('parses ok response wrapped in RoutableMessage', async () => {
      const { encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const whitelistOpStatus = new Uint8Array([0x12, 0x02, 0x08, 0x00])
      const commandStatus = encodeBytes(3, whitelistOpStatus)
      const fromVcsec = encodeBytes(4, commandStatus)
      const routable = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routable)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('ok')
      expect(parsed.dbg.wrapped).toBe(true)
    })

    test('parses error response wrapped in RoutableMessage', async () => {
      const { concat, encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = concat(
        encodeEnum(1, OPERATIONSTATUS_ERROR),
        encodeEnum(3, 10)
      )
      const fromVcsec = encodeBytes(4, commandStatus)
      const routable = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routable)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
      expect(parsed.dbg.wrapped).toBe(true)
    })

    test('returns error on f12 signedMessageStatus fault (MESSAGEFAULT_ERROR_DECODING=10)', async () => {
      const { concat, encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // RoutableMessage field 12 = signedMessageStatus { field 2 = signed_message_fault = 10 }
      const signedMessageStatus = concat(
        encodeEnum(1, 0),   // operation_status = OK
        encodeEnum(2, 10)   // signed_message_fault = DECODING error
      )
      const routable = encodeBytes(12, signedMessageStatus)

      const parsed = parsePairingResponse(routable)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
      expect(parsed.dbg.f12fault).toBe(10)
    })

    test('dbg object is always populated', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.dbg).toBeDefined()
      expect(typeof parsed.dbg.rxLen).toBe('number')
      expect(typeof parsed.dbg.wrapped).toBe('boolean')
      expect(parsed.dbg.outerKeys).toBeDefined()
    })

    test('dbg.rxLen is 0 for empty response', () => {
      const parsed = parsePairingResponse(new Uint8Array(0))
      expect(parsed.dbg).toBeDefined()
      expect(parsed.dbg.rxLen).toBe(0)
    })

    test('dbg.wrapped is false for unwrapped FromVCSECMessage', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.dbg.wrapped).toBe(false)
    })

    test('wlInfo=25 (tap timeout) returns error', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // CommandStatus { field 3 (bytes) = WhitelistOperation_status { field 1 = 25 } }
      // 25 = NOT_ALLOWED_TO_ADD_UNLESS_RECENTLY_BEEN_ON_READER (tap timeout)
      const wlStatus = encodeEnum(1, 25)
      const commandStatus = encodeBytes(3, wlStatus)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
      expect(parsed.dbg.wlFault).toBe(25)
    })

    test('wlInfo=5 (no permission) returns error', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const wlStatus = encodeEnum(1, 5)
      const commandStatus = encodeBytes(3, wlStatus)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
      expect(parsed.dbg.wlFault).toBe(5)
    })

    test('wlInfo=14 in f4 path returns wait (tap required)', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // 14 = NOT_ALLOWED_TO_ADD_UNLESS_ON_READER
      const wlStatus = encodeEnum(1, 14)
      const commandStatus = encodeBytes(3, wlStatus)
      const fromVcsec = encodeBytes(4, commandStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('wait')
    })

    test('f1N path: direct varint operationStatus=WAIT without outer wrapper', async () => {
      const { encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // Some firmware sends CommandStatus directly (not in field 4 of FromVCSECMessage)
      // field 1 (varint) = OPERATIONSTATUS_WAIT
      const direct = encodeEnum(1, OPERATIONSTATUS_WAIT)

      const parsed = parsePairingResponse(direct)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('wait')
      expect(parsed.dbg.path).toBe('f1N')
    })

    test('f1B path: field 1 as bytes = vehicleStatus push returns pending', async () => {
      const { encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // FromVCSECMessage { vehicleStatus (field 1 bytes) } — unsolicited push
      const vehicleStatus = new Uint8Array([0x08, 0x01]) // some status payload
      const fromVcsec = encodeBytes(1, vehicleStatus)

      const parsed = parsePairingResponse(fromVcsec)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('pending')
      expect(parsed.dbg.path).toBe('f1B')
    })
  })
})
