
import { encodeBytes, encodeEnum, encodeVarintField, encodeFixed32, concat, decodeMessage } from './protobuf.js'
const DOMAIN_VEHICLE_SECURITY = 2
// HMAC_PERSONALIZED (=8) per signatures.proto SignatureType enum.
// Auth data goes in RoutableMessage.signature_data (field 13), NOT in vcsec.proto SignedMessage.
const SIGNATURE_TYPE_HMAC_PERSONALIZED = 8
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6
const buildUnsignedMessage = ({ informationRequest, rkeAction, closureMoveRequest }) => {
  const parts = []
  if (informationRequest) parts.push(encodeBytes(1, informationRequest))
  if (rkeAction !== undefined) parts.push(encodeEnum(2, rkeAction))
  if (closureMoveRequest) parts.push(encodeBytes(4, closureMoveRequest))
  return concat(...parts)
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
  if (uuid) parts.push(encodeBytes(50, uuid))
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
  // clockTime is a varint; if the vehicle sends it as bytes, default to 0
  const clockTime = typeof fields[4] === 'number' ? fields[4] : 0
  return {
    counter:    fields[1] ?? 0,
    publicKey:  publicKey,
    epoch:      epoch,
    clockTime:  clockTime,
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
    commandStatus: fields[4] instanceof Uint8Array ? parseCommandStatus(fields[4]) : null,
  }
}
const parseRoutableMessage = (data) => {
  const fields = decodeMessage(data)
  // SessionInfo lives in RoutableMessage field 15 (bytes session_info) per spec.
  let sessionInfo = null
  const sessionInfoBytes = fields[15] instanceof Uint8Array ? fields[15] : null
  if (sessionInfoBytes) {
    try {
      const candidate = parseSessionInfo(sessionInfoBytes)
      if (candidate && (candidate.epoch || candidate.publicKey)) sessionInfo = candidate
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
  if (payload) {
    try {
      const vcsec = parseFromVCSECMessage(payload)
      vehicleStatus = vcsec.vehicleStatus
      commandStatus = vcsec.commandStatus
    } catch (_e) {}
  }
  let signedMessageStatus = null
  if (fields[12] instanceof Uint8Array) {
    try { signedMessageStatus = parseMessageStatus(fields[12]) } catch (_e) {}
  }
  return {
    sessionInfo:         sessionInfo,
    sessionInfoBytes:    sessionInfoBytes,
    sessionInfoTag:      sessionInfoTag,
    payload:             payload,
    vehicleStatus:       vehicleStatus,
    commandStatus:       commandStatus,
    signedMessageStatus: signedMessageStatus,
  }
}
const generateUUID = () => {
  const uuid = new Uint8Array(16)
  for (let i = 0; i < 16; i++) uuid[i] = Math.floor(Math.random() * 256)
  return uuid
}
const parseWhitelistEntryInfo = (data) => {
  const fields = decodeMessage(data)
  return {
    publicKey: fields[1] ?? null,  // 65-byte P-256 EC public key
  }
}
export {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC_PERSONALIZED,
  INFO_REQUEST_GET_STATUS,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  parseVehicleStatus,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildHMACTagInput,
  buildSessionInfoHmacInput,
  buildKeyIdentity,
  buildHMACPersonalizedData,
  buildClosureMoveRequest,
  buildSignatureData,
  parseSessionInfo,
  parseRoutableMessage,
  parseFromVCSECMessage,
  parseCommandStatus,
  parseMessageStatus,
  parseWhitelistEntryInfo,
  generateUUID,
  generateRoutingAddress,
}
