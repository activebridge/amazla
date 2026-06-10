
import { encodeBytes, encodeEnum, encodeVarintField, encodeFixed32, concat, decodeMessage, decodeVarint } from './protobuf.js'
const DOMAIN_VEHICLE_SECURITY = 2
// Infotainment / "car server" domain — climate, charging, charge-port, vehicle data.
// Authenticated with AES-GCM (see aes-gcm.js) instead of HMAC.
const DOMAIN_INFOTAINMENT = 3
// HMAC_PERSONALIZED (=8) per signatures.proto SignatureType enum.
// Auth data goes in RoutableMessage.signature_data (field 13), NOT in vcsec.proto SignedMessage.
const SIGNATURE_TYPE_HMAC_PERSONALIZED = 8
const SIGNATURE_TYPE_AES_GCM_PERSONALIZED = 5
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3
const RKE_ACTION_REMOTE_DRIVE = 20 // vcsec.proto RKEAction_E. Tesla SDK "drive"/"Remote start vehicle" — authorizes keyless drive over BLE without a passively-present phone key.
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6
const buildUnsignedMessage = ({ informationRequest, rkeAction, closureMoveRequest, authenticationResponse, appDeviceInfo }) => {
  const parts = []
  if (informationRequest) parts.push(encodeBytes(1, informationRequest))
  if (rkeAction !== undefined) parts.push(encodeEnum(2, rkeAction))
  if (authenticationResponse) parts.push(encodeBytes(3, authenticationResponse))
  if (closureMoveRequest) parts.push(encodeBytes(4, closureMoveRequest))
  if (appDeviceInfo) parts.push(encodeBytes(40, appDeviceInfo)) // UnsignedMessage.appDeviceInfo
  return concat(...parts)
}
// AppOperatingSystem: UNKNOWN=0, ANDROID=1, IOS=2. The watch enrolled via the Android
// companion app, so it presents as ANDROID.
const APP_OS_ANDROID = 1
// UWBAvailability: ...UNAVAILABLE_UNSUPPORTED_DEVICE=2 (the watch has no UWB radio).
const UWB_UNSUPPORTED = 2
// AppDeviceInfo { hardware_model_sha256(1 bytes), os(2 AppOperatingSystem),
// UWBAvailable(3 UWBAvailability), phoneVersion(4 PhoneVersionInfo) }. Sent as
// UnsignedMessage.appDeviceInfo (field 40) in reply to FromVCSECMessage.appDeviceInfoRequest
// (field 44 = APP_DEVICE_INFO_REQUEST_GET_MODEL_NUMBER). Informational — the car stores
// it for the key's device-type display; only the model hash is actually requested.
const buildAppDeviceInfo = ({ hardwareModelSha256, os, uwb }) => {
  const parts = []
  if (hardwareModelSha256) parts.push(encodeBytes(1, hardwareModelSha256))
  if (os !== undefined) parts.push(encodeEnum(2, os))
  if (uwb !== undefined) parts.push(encodeEnum(3, uwb))
  return concat(...parts)
}
// AuthenticationLevel_E: NONE=0, UNLOCK=1, DRIVE=2.
const AUTH_LEVEL_UNLOCK = 1
// AuthenticationReason_E values the vehicle puts in AuthenticationRequest.reasonsForAuth.
// 1=IDENTIFICATION is the idle ~1Hz beacon; 5/9 mean the driver acted (respond to those).
const AUTH_REASON_EXTERIOR_HANDLE_PULL = 5
const AUTH_REASON_WALK_UP_UNLOCK = 9
// AuthenticationResponse { authenticationLevel(1), estimatedDistance(2 uint32), authenticationRejection(3) }
// The key's passive-entry reply. Wrapped as UnsignedMessage.authenticationResponse (field 3)
// and signed on the session exactly like an RKE action — no extra crypto, no token echo.
const buildAuthenticationResponse = ({ authenticationLevel, estimatedDistance, rejection }) => {
  const parts = [encodeEnum(1, authenticationLevel)]
  parts.push(encodeVarintField(2, estimatedDistance || 0))
  if (rejection) parts.push(encodeEnum(3, rejection))
  return concat(...parts)
}
// AuthenticationRequest { sessionInfo(2 AuthenticationRequestToken{token=1}), requestedLevel(3),
// reasonsForAuth(4 repeated) }. Carried at FromVCSECMessage.authenticationRequest (field 3). The
// 20-byte token is an ephemeral nonce (rotates); it is NOT echoed in the response.
const parseAuthenticationRequest = (data) => {
  const fields = decodeMessage(data)
  let token = null
  if (fields[2] instanceof Uint8Array) {
    try {
      const tok = decodeMessage(fields[2])
      if (tok[1] instanceof Uint8Array) token = tok[1]
    } catch (_e) {}
  }
  return {
    token: token,
    requestedLevel: typeof fields[3] === 'number' ? fields[3] : 0,
    // reasonsForAuth (field 4) is a repeated enum: the vehicle PACKS it (wire type 2,
    // e.g. 22 01 05), so the decoder hands back the raw bytes — unpack them as varints.
    // Tolerate the unpacked forms too (scalar or array of numbers).
    reasonsForAuth: decodeReasons(fields[4]),
  }
}
// Normalize a repeated-varint field that may arrive packed (Uint8Array of varints),
// as a single number, or as an array of numbers.
const decodeReasons = (v) => {
  if (v === undefined) return []
  if (typeof v === 'number') return [v]
  if (Array.isArray(v)) return v.filter((r) => typeof r === 'number')
  if (v instanceof Uint8Array) {
    const out = []
    let off = 0
    while (off < v.length) {
      try {
        const { value, bytesRead } = decodeVarint(v, off)
        out.push(value)
        off += bytesRead
      } catch (_e) {
        break
      }
    }
    return out
  }
  return []
}
const buildInformationRequest = (requestType, keyId, publicKey, slot) => {
  const parts = [encodeEnum(1, requestType)]
  if (keyId) parts.push(encodeBytes(2, keyId))
  else if (publicKey) parts.push(encodeBytes(3, publicKey))
  else if (slot !== undefined && slot !== null) parts.push(encodeVarintField(4, slot))
  return concat(...parts)
}
const parseVehicleStatus = (data) => {
  const fields = decodeMessage(data)
  const closures = fields[1] ? decodeMessage(fields[1]) : {}
  
  return {
    closureStatuses: {
      frontDriverDoor: closures[1] ?? 0,
      frontPassengerDoor: closures[2] ?? 0,
      rearDriverDoor: closures[3] ?? 0,
      rearPassengerDoor: closures[4] ?? 0,
      rearTrunk: closures[5] ?? 0,
      frontTrunk: closures[6] ?? 0,
      chargePort: closures[7] ?? 0,
    },
    vehicleLockState: fields[2] ?? 0, // 0: UNLOCKED, 1: LOCKED
    vehicleSleepStatus: fields[3] ?? 0,
    userPresence: fields[4] ?? 0,
  }
}
// vcsec.proto SignedMessage has ONLY field 2 (payload bytes) and field 3 (SignatureType enum).
// SignatureType enum has NONE=0 and PRESENT_KEY=2 only — no HMAC.
// For HMAC-authenticated commands, auth data goes in RoutableMessage.signature_data (field 13).
const buildSignedMessage = ({ payload, signatureType }) => {
  const parts = []
  if (payload) parts.push(encodeBytes(2, payload))
  if (signatureType !== undefined) parts.push(encodeEnum(3, signatureType))
  return concat(...parts)
}
// KeyIdentity { public_key (field 1) }
const buildKeyIdentity = (publicKey) => encodeBytes(1, publicKey)
// HMAC_Personalized_Signature_Data { epoch(1), counter(2 uint32), expires_at(3 fixed32 LE), tag(4) }
const buildHMACPersonalizedData = (epoch, counter, expiresAt, tag) => {
  const parts = []
  if (epoch) parts.push(encodeBytes(1, epoch))
  parts.push(encodeVarintField(2, counter))
  parts.push(encodeFixed32(3, expiresAt))     // fixed32 = 4-byte little-endian
  if (tag) parts.push(encodeBytes(4, tag))
  return concat(...parts)
}

// ClosureMoveRequest { frontDriverDoor(1), frontPassengerDoor(2), rearDriverDoor(3),
// rearPassengerDoor(4), rearTrunk(5), frontTrunk(6), chargePort(7), tonneau(8) }
// Each field carries a ClosureMoveType_E value (NONE=0, MOVE=1, STOP=2, OPEN=3, CLOSE=4).
const CLOSURE_REAR_TRUNK = 5
const CLOSURE_FRUNK = 6
const CLOSURE_CHARGE_PORT = 7 // ClosureMoveRequest.chargePort field (matches ClosureStatuses[7])
const CLOSURE_MOVE_OPEN = 3 // ClosureMoveType_E.OPEN
const buildClosureMoveRequest = (closureId, moveType) => encodeEnum(closureId, moveType)
// SignatureData { signer_identity(1 KeyIdentity), HMAC_Personalized_data(8) }
// Placed in RoutableMessage.signature_data (field 13) for authenticated commands.
const buildSignatureData = (signerPublicKey, epoch, counter, expiresAt, tag) => {
  const keyIdentity = buildKeyIdentity(signerPublicKey)
  const hmacData = buildHMACPersonalizedData(epoch, counter, expiresAt, tag)
  return concat(
    encodeBytes(1, keyIdentity),
    encodeBytes(8, hmacData)
  )
}
const buildToVCSECMessage = (signedMessage) => encodeBytes(1, signedMessage)

// Builds the HMAC input buffer for an authenticated command per Tesla SDK metadata scheme.
// Layout: TLV metadata fields || 0xFF || payloadBytes
//   TAG_SIGNATURE_TYPE(0): HMAC_PERSONALIZED=8
//   TAG_DOMAIN(1): VEHICLE_SECURITY=2
//   TAG_PERSONALIZATION(2): VIN bytes (empty if not set)
//   TAG_EPOCH(3): 16-byte epoch
//   TAG_EXPIRES_AT(4): uint32 big-endian
//   TAG_COUNTER(5): uint32 big-endian
//   TAG_END(0xFF)
//   payload bytes (ToVCSECMessage)
const buildHMACTagInput = (vin, epoch, counter, expiresAt, payloadBytes) => {
  const vinBytes = vin instanceof Uint8Array ? vin : new Uint8Array(0)
  const epochBytes = epoch instanceof Uint8Array ? epoch : new Uint8Array(0)
  const u32be = (v) => new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff])
  const expiresAtBytes = u32be(expiresAt)
  const counterBytes = u32be(counter)
  const totalLen = 3 + 3 + 2 + vinBytes.length + 2 + epochBytes.length + 6 + 6 + 1 + payloadBytes.length
  const buf = new Uint8Array(totalLen)
  let off = 0
  const wb = (byte) => { buf[off++] = byte }
  const wBytes = (bytes) => { buf.set(bytes, off); off += bytes.length }
  wb(0x00); wb(0x01); wb(0x08)           // TAG_SIGNATURE_TYPE: HMAC_PERSONALIZED=8
  wb(0x01); wb(0x01); wb(0x02)           // TAG_DOMAIN: VEHICLE_SECURITY=2
  wb(0x02); wb(vinBytes.length); wBytes(vinBytes)    // TAG_PERSONALIZATION: VIN
  wb(0x03); wb(epochBytes.length); wBytes(epochBytes) // TAG_EPOCH
  wb(0x04); wb(0x04); wBytes(expiresAtBytes)          // TAG_EXPIRES_AT
  wb(0x05); wb(0x04); wBytes(counterBytes)            // TAG_COUNTER
  wb(0xff); wBytes(payloadBytes)                      // TAG_END + payload
  return buf
}

// AES-GCM associated-data input (infotainment domain). Same TLV scheme as the HMAC
// metadata, but the result is SHA-256'd by the caller and used as the GCM AAD — the
// payload is ENCRYPTED, not appended here (Tesla SDK: aad = sha256(TLV || TAG_END)).
// Tesla `extractMetadata` order: SIGNATURE_TYPE(0)=AES_GCM_PERSONALIZED, DOMAIN(1),
// PERSONALIZATION(2)=VIN, EPOCH(3), EXPIRES_AT(4) uint32 BE, COUNTER(5) uint32 BE, END.
// (TAG_FLAGS(7) is only added when message flags are set; our commands send none.)
const buildAesGcmMetadataInput = (vin, domain, epoch, counter, expiresAt) => {
  const vinBytes = vin instanceof Uint8Array ? vin : new Uint8Array(0)
  const epochBytes = epoch instanceof Uint8Array ? epoch : new Uint8Array(0)
  const u32be = (v) => new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff])
  const totalLen = 3 + 3 + 2 + vinBytes.length + 2 + epochBytes.length + 6 + 6 + 1
  const buf = new Uint8Array(totalLen)
  let off = 0
  const wb = (byte) => { buf[off++] = byte }
  const wBytes = (bytes) => { buf.set(bytes, off); off += bytes.length }
  wb(0x00); wb(0x01); wb(SIGNATURE_TYPE_AES_GCM_PERSONALIZED) // TAG_SIGNATURE_TYPE=5
  wb(0x01); wb(0x01); wb(domain & 0xff)                       // TAG_DOMAIN
  wb(0x02); wb(vinBytes.length); wBytes(vinBytes)             // TAG_PERSONALIZATION: VIN
  wb(0x03); wb(epochBytes.length); wBytes(epochBytes)         // TAG_EPOCH
  wb(0x04); wb(0x04); wBytes(u32be(expiresAt))               // TAG_EXPIRES_AT (BE)
  wb(0x05); wb(0x04); wBytes(u32be(counter))                 // TAG_COUNTER (BE)
  wb(0xff)                                                     // TAG_END (no payload — it's encrypted)
  return buf
}

// AES_GCM_Personalized_Signature_Data { epoch(1), nonce(2), counter(3 uint32),
// expires_at(4 fixed32 LE), tag(5) } wrapped in SignatureData { signer_identity(1),
// AES_GCM_Personalized_data(5) }.
const buildAesGcmPersonalizedData = (epoch, nonce, counter, expiresAt, tag) => {
  const parts = []
  if (epoch) parts.push(encodeBytes(1, epoch))
  if (nonce) parts.push(encodeBytes(2, nonce))
  parts.push(encodeVarintField(3, counter))
  parts.push(encodeFixed32(4, expiresAt))
  if (tag) parts.push(encodeBytes(5, tag))
  return concat(...parts)
}
const buildAesGcmSignatureData = (signerPublicKey, epoch, nonce, counter, expiresAt, tag) => {
  const keyIdentity = buildKeyIdentity(signerPublicKey)
  const gcmData = buildAesGcmPersonalizedData(epoch, nonce, counter, expiresAt, tag)
  return concat(encodeBytes(1, keyIdentity), encodeBytes(5, gcmData))
}
// Builds the HMAC input buffer for SessionInfo tag verification per Tesla SDK.
// Layout: TLV metadata fields || 0xFF || encodedSessionInfoBytes
//   TAG_SIGNATURE_TYPE(0): SIGNATURE_TYPE_HMAC=6
//   TAG_PERSONALIZATION(2): VIN bytes
//   TAG_CHALLENGE(6): request uuid bytes
//   TAG_END(0xFF)
const buildSessionInfoHmacInput = (vin, challenge, encodedInfo) => {
  const vinBytes = vin instanceof Uint8Array ? vin : new Uint8Array(0)
  const challengeBytes = challenge instanceof Uint8Array ? challenge : new Uint8Array(0)
  const totalLen = 3 + 2 + vinBytes.length + 2 + challengeBytes.length + 1 + encodedInfo.length
  const buf = new Uint8Array(totalLen)
  let off = 0
  const wb = (byte) => { buf[off++] = byte }
  const wBytes = (bytes) => { buf.set(bytes, off); off += bytes.length }
  wb(0x00); wb(0x01); wb(0x06)                               // TAG_SIGNATURE_TYPE: HMAC=6
  wb(0x02); wb(vinBytes.length); wBytes(vinBytes)            // TAG_PERSONALIZATION
  wb(0x06); wb(challengeBytes.length); wBytes(challengeBytes)// TAG_CHALLENGE
  wb(0xff); wBytes(encodedInfo)                              // TAG_END + info
  return buf
}
const buildRoutableMessage = ({ toDomain, routingAddress, payload, sessionInfoRequest, signatureData, uuid }) => {
  const parts = []
  if (toDomain !== undefined) {
    const dest = encodeEnum(1, toDomain)
    parts.push(encodeBytes(6, dest))
  }
  if (routingAddress) {
    const dest = encodeBytes(2, routingAddress)
    parts.push(encodeBytes(7, dest))
  }
  if (payload) parts.push(encodeBytes(10, payload))
  if (sessionInfoRequest) parts.push(encodeBytes(14, sessionInfoRequest))
  if (signatureData) parts.push(encodeBytes(13, signatureData))
  // RoutableMessage.uuid is field 51 (current proto: request_uuid=50, uuid=51).
  // Vehicle uses incoming `uuid` (51) as the SessionInfo HMAC challenge — putting
  // the value in field 50 made vehicle see challenge=empty and our tag verification
  // failed with HMAC mismatch despite correct ECDH/sessionKey.
  if (uuid) parts.push(encodeBytes(51, uuid))
  return concat(...parts)
}
const buildSessionInfoRequest = (publicKey, challenge) => {
  const parts = []
  if (publicKey) parts.push(encodeBytes(1, publicKey))
  if (challenge) parts.push(encodeBytes(2, challenge))
  return concat(...parts)
}
const generateRoutingAddress = () => {
  const addr = new Uint8Array(16)
  for (let i = 0; i < 16; i++) addr[i] = Math.floor(Math.random() * 256)
  return addr
}
const parseSessionInfo = (data) => {
  const fields = decodeMessage(data)
  // epoch must be a Uint8Array; if field is a varint (number), treat as absent
  const asEpoch = (v) => (v instanceof Uint8Array ? v : null)
  const [publicKey, epoch] = !fields[2]
    ? [null, asEpoch(fields[3])]
    : fields[2].length === 65
    ? [fields[2], asEpoch(fields[3])]
    : fields[2].length === 16
    ? [null, fields[2]]
    : [fields[2], asEpoch(fields[3])]
  // clock_time / counter are uint32. The vehicle encodes them as fixed32
  // (wire type 5) → our decoder hands back a 4-byte little-endian Uint8Array,
  // NOT a number. Treating that as "not a number → 0" left clockTime=0, so
  // expires_at = 0 + 60 was always in the past → the vehicle rejected every
  // command with MESSAGEFAULT_ERROR_TIME_EXPIRED (17). Decode LE fixed32.
  const u32 = (v) =>
    typeof v === 'number'
      ? v
      : v instanceof Uint8Array && v.length === 4
      ? (v[0] | (v[1] << 8) | (v[2] << 16) | (v[3] << 24)) >>> 0
      : 0
  return {
    counter:    u32(fields[1]),
    publicKey:  publicKey,
    epoch:      epoch,
    clockTime:  u32(fields[4]),
    status:     fields[5] ?? 0,
    handle:     fields[6] ?? 0,
  }
}
// MessageStatus { operation_status(1 OperationStatus_E), signed_message_fault(2 MessageFault_E) }
// Carried at RoutableMessage.signed_message_status (field 12).
const parseMessageStatus = (data) => {
  const fields = decodeMessage(data)
  return {
    operationStatus:    typeof fields[1] === 'number' ? fields[1] : 0,
    signedMessageFault: typeof fields[2] === 'number' ? fields[2] : 0,
  }
}
// CommandStatus { operationStatus(1 OperationStatus_E), signedMessageStatus(2), whitelistOperationStatus(3) }
// Carried at FromVCSECMessage.commandStatus (field 4). OperationStatus_E: OK=0, WAIT=1, ERROR=2.
const parseCommandStatus = (data) => {
  const fields = decodeMessage(data)
  return {
    operationStatus: typeof fields[1] === 'number' ? fields[1] : 0,
  }
}
// FromVCSECMessage { vehicleStatus(1), commandStatus(4), whitelistInfo(16), whitelistEntryInfo(17), nominalError(46) }
// Carried at RoutableMessage.protobuf_message_as_bytes (field 10).
const parseFromVCSECMessage = (data) => {
  const fields = decodeMessage(data)
  return {
    vehicleStatus: fields[1] instanceof Uint8Array ? fields[1] : null,
    authenticationRequest: fields[3] instanceof Uint8Array ? parseAuthenticationRequest(fields[3]) : null,
    commandStatus: fields[4] instanceof Uint8Array ? parseCommandStatus(fields[4]) : null,
    // appDeviceInfoRequest (field 44) is a varint AppDeviceInfoRequest_E (1=GET_MODEL_NUMBER).
    appDeviceInfoRequest: typeof fields[44] === 'number' ? fields[44] : null,
  }
}
const parseRoutableMessage = (data) => {
  const fields = decodeMessage(data)
  // to_destination (field 6) is a Destination { domain(1) | routing_address(2) }.
  // Command responses carry our 16-byte routing_address here; unsolicited vehicle
  // pushes (periodic VehicleStatus etc.) are addressed to a domain instead.
  let toRoutingAddress = null
  if (fields[6] instanceof Uint8Array) {
    try {
      const dest = decodeMessage(fields[6])
      if (dest[2] instanceof Uint8Array) toRoutingAddress = dest[2]
    } catch (_e) {}
  }
  // SessionInfo lives in RoutableMessage field 15 (bytes session_info) per spec.
  let sessionInfo = null
  let sessionInfoStatus = 0 // SessionInfoStatus enum: OK=0, KEY_NOT_ON_WHITELIST=1
  const sessionInfoBytes = fields[15] instanceof Uint8Array ? fields[15] : null
  if (sessionInfoBytes) {
    try {
      const candidate = parseSessionInfo(sessionInfoBytes)
      if (candidate) {
        if (candidate.epoch || candidate.publicKey) sessionInfo = candidate
        // Surface status separately so callers can distinguish OK from
        // KEY_NOT_ON_WHITELIST (vehicle's response to an unknown identity
        // key — no session material returned).
        if (candidate.status) sessionInfoStatus = candidate.status
      }
    } catch (_e) {}
  }
  // SignatureData in field 13. For SessionInfo responses, the tag lives at
  // SignatureData.session_info_tag (field 6) → HMAC_Signature_Data.tag (field 1).
  let sessionInfoTag = null
  if (fields[13] instanceof Uint8Array) {
    try {
      const sig = decodeMessage(fields[13])
      if (sig[6] instanceof Uint8Array) {
        const hmacSig = decodeMessage(sig[6])
        if (hmacSig[1] instanceof Uint8Array) sessionInfoTag = hmacSig[1]
      }
    } catch (_e) {}
  }
  // Unwrap FromVCSECMessage carried at field 10.
  const payload = fields[10] instanceof Uint8Array ? fields[10] : null
  let vehicleStatus = null
  let commandStatus = null
  let authenticationRequest = null
  let appDeviceInfoRequest = null
  if (payload) {
    try {
      const vcsec = parseFromVCSECMessage(payload)
      vehicleStatus = vcsec.vehicleStatus
      commandStatus = vcsec.commandStatus
      authenticationRequest = vcsec.authenticationRequest
      appDeviceInfoRequest = vcsec.appDeviceInfoRequest
    } catch (_e) {}
  }
  let signedMessageStatus = null
  if (fields[12] instanceof Uint8Array) {
    try { signedMessageStatus = parseMessageStatus(fields[12]) } catch (_e) {}
  }
  return {
    toRoutingAddress:    toRoutingAddress,
    sessionInfo:         sessionInfo,
    sessionInfoBytes:    sessionInfoBytes,
    sessionInfoTag:      sessionInfoTag,
    sessionInfoStatus:   sessionInfoStatus,
    payload:             payload,
    vehicleStatus:       vehicleStatus,
    commandStatus:       commandStatus,
    authenticationRequest: authenticationRequest,
    appDeviceInfoRequest:  appDeviceInfoRequest,
    signedMessageStatus: signedMessageStatus,
  }
}
const generateUUID = () => {
  const uuid = new Uint8Array(16)
  for (let i = 0; i < 16; i++) uuid[i] = Math.floor(Math.random() * 256)
  return uuid
}
export {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC_PERSONALIZED,
  INFO_REQUEST_GET_STATUS,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  parseVehicleStatus,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_REMOTE_DRIVE,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildAuthenticationResponse,
  buildAppDeviceInfo,
  parseAuthenticationRequest,
  AUTH_LEVEL_UNLOCK,
  AUTH_REASON_EXTERIOR_HANDLE_PULL,
  AUTH_REASON_WALK_UP_UNLOCK,
  APP_OS_ANDROID,
  UWB_UNSUPPORTED,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildHMACTagInput,
  buildAesGcmMetadataInput,
  buildAesGcmSignatureData,
  DOMAIN_INFOTAINMENT,
  SIGNATURE_TYPE_AES_GCM_PERSONALIZED,
  buildSessionInfoHmacInput,
  buildKeyIdentity,
  buildHMACPersonalizedData,
  buildClosureMoveRequest,
  CLOSURE_REAR_TRUNK,
  CLOSURE_FRUNK,
  CLOSURE_CHARGE_PORT,
  CLOSURE_MOVE_OPEN,
  buildSignatureData,
  parseSessionInfo,
  parseRoutableMessage,
  parseFromVCSECMessage,
  parseCommandStatus,
  parseMessageStatus,
  generateUUID,
  generateRoutingAddress,
}
