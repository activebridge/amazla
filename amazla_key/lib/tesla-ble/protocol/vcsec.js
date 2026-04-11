
import { encodeBytes, encodeEnum, encodeVarintField, concat, decodeMessage } from './protobuf.js'
const DOMAIN_VEHICLE_SECURITY = 2
const SIGNATURE_TYPE_HMAC = 5         // Used for session commands
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6
const buildUnsignedMessage = ({ informationRequest, rkeAction }) => {
  const parts = []
  if (informationRequest) parts.push(encodeBytes(1, informationRequest))
  if (rkeAction !== undefined) parts.push(encodeEnum(2, rkeAction))
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
const buildSignedMessage = ({ payload, signatureType, counter, signature, epoch, expiresAt }) => {
  const parts = []
  if (payload) parts.push(encodeBytes(2, payload))
  if (signatureType !== undefined) parts.push(encodeEnum(3, signatureType))
  if (counter !== undefined) parts.push(encodeVarintField(4, counter))
  if (signature) parts.push(encodeBytes(5, signature))
  if (epoch) parts.push(encodeBytes(6, epoch))
  if (expiresAt !== undefined) parts.push(encodeVarintField(7, expiresAt))
  return concat(...parts)
}
const buildToVCSECMessage = (signedMessage) => encodeBytes(1, signedMessage)
const buildRoutableMessage = ({ toDomain, routingAddress, payload, sessionInfoRequest, uuid }) => {
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
  SIGNATURE_TYPE_HMAC,
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
  parseSessionInfo,
  parseRoutableMessage,
  parseWhitelistEntryInfo,
  generateUUID,
  generateRoutingAddress,
}
