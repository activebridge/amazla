
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
  if (closureMoveRequest) parts.push(encodeBytes(3, closureMoveRequest))
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

// ClosureMoveRequest { closure_id(1 enum), move_type(2 enum) }
const buildClosureMoveRequest = (closureId, moveType) => {
  const parts = []
  if (closureId !== undefined) parts.push(encodeEnum(1, closureId))
  if (moveType !== undefined) parts.push(encodeEnum(2, moveType))
  return concat(...parts)
}
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
const parseRoutableMessage = (data) => {
  const fields = decodeMessage(data)
  let sessionInfo = null
  // A valid SessionInfo has either epoch bytes or a public key blob
  const isValidSessionInfo = (si) => si && (si.epoch || si.publicKey)
  if (fields[3]) {
    try {
      sessionInfo = parseSessionInfo(fields[3])
      if (isValidSessionInfo(sessionInfo)) {
        console.log('[SESSION] Found SessionInfo in field 3')
      } else {
        sessionInfo = null
      }
    } catch (e) {
    }
  }
  if (!sessionInfo && fields[6]) {
    try {
      sessionInfo = parseSessionInfo(fields[6])
      if (isValidSessionInfo(sessionInfo)) {
        console.log('[SESSION] Found SessionInfo in field 6')
      } else {
        sessionInfo = null
      }
    } catch (e) {
    }
  }
  if (!sessionInfo && fields[10]) {
    try {
      const fromVcsecFields = decodeMessage(fields[10])
      if (fromVcsecFields[3]) {
        try {
          const candidate = parseSessionInfo(fromVcsecFields[3])
          if (isValidSessionInfo(candidate)) {
            sessionInfo = candidate
            console.log('[SESSION] Found SessionInfo in field 10.field[3]')
          }
        } catch (e) {
        }
      }
      if (!sessionInfo) {
        for (const fieldNum in fromVcsecFields) {
          const fieldData = fromVcsecFields[fieldNum]
          if (!fieldData || fieldData.length < 10) continue

          try {
            const candidate = parseSessionInfo(fieldData)
            if (isValidSessionInfo(candidate)) {
              sessionInfo = candidate
              console.log('[SESSION] Found SessionInfo in field 10.field[' + fieldNum + ']')
              break
            }
          } catch (e) {
          }
        }
      }
    } catch (e) {
      console.log('[SESSION] Could not parse field 10 as FromVCSECMessage: ' + e.message)
    }
  }
  if (!sessionInfo && fields[15]) {
    try {
      const candidate = parseSessionInfo(fields[15])
      if (isValidSessionInfo(candidate)) {
        sessionInfo = candidate
        console.log('[SESSION] Found SessionInfo in field 15')
      }
    } catch (e) {
    }
  }
  
  return {
    actionStatus:        fields[1] ?? null,
    sessionInfo:         sessionInfo,
    payload:             fields[10] ?? null,
    signedMessageStatus: fields[12] ?? null,
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
  buildKeyIdentity,
  buildHMACPersonalizedData,
  buildClosureMoveRequest,
  buildSignatureData,
  parseSessionInfo,
  parseRoutableMessage,
  parseWhitelistEntryInfo,
  generateUUID,
  generateRoutingAddress,
}
