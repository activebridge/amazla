
import { encodeBytes, encodeEnum, encodeVarintField, concat, decodeMessage } from './protobuf.js'
const DOMAIN_VEHICLE_SECURITY = 2
const SIGNATURE_TYPE_PRESENT_KEY = 2  // Used for pairing (no HMAC needed)
const SIGNATURE_TYPE_HMAC = 5         // Used for session commands
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6
const KEY_ROLE_OWNER = 2  // ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // Triggers NFC keycard tap UI on car touchscreen
const OPERATIONSTATUS_OK = 0
const OPERATIONSTATUS_WAIT = 1
const OPERATIONSTATUS_ERROR = 2
const OPERATIONSTATUS_UNKNOWN_KEY = 7  // Key not in whitelist or pairing mismatch
const OPERATION_STATUS_NAMES = {
  0: 'OK',
  1: 'WAIT (tap keycard)',
  2: 'ERROR',
  3: 'INVALID_REQUEST',
  4: 'INVALID_SIGNATURE',
  5: 'INVALID_TOKEN',
  6: 'INVALID_NONCE',
  7: 'UNKNOWN_KEY (not in whitelist - re-pair required)',
}
const WL_ERRORS = {
  5:  'No permission (wl:5) - owner must approve',
  6:  'Invalid keycard (wl:6) - wrong card?',
  25: 'Keycard tap timeout (wl:25) - tap faster',
}
const wlErrorMessage = (code) => WL_ERRORS[code] ?? `WL info:${code}`
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
const buildKeyMetadata = (keyFormFactor) => encodeEnum(1, keyFormFactor)
const buildPermissionChange = (publicKeyMsg, role) => concat(
  encodeBytes(1, publicKeyMsg),
  encodeEnum(4, role)
)
const buildWhitelistOperation = (publicKeyMsg, keyFormFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) => {
  const permissionChange = buildPermissionChange(publicKeyMsg, KEY_ROLE_OWNER)
  const metadata = buildKeyMetadata(keyFormFactor)
  return concat(
    encodeBytes(5, permissionChange),
    encodeBytes(6, metadata)
  )
}
const buildUnsignedMessageWithWhitelist = (whitelistOperation) =>
  encodeBytes(16, whitelistOperation)
const parseCommandStatus = (data) => {
  const fields = decodeMessage(data)
  return {
    operationStatus: fields[1] ?? null,
    signedMessageFault: fields[2] ?? null,
    whitelistOperationFault: fields[3] ?? null,
  }
}
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
  const [publicKey, epoch] = !fields[2] 
    ? [null, fields[3] ?? null]
    : fields[2].length === 65
    ? [fields[2], fields[3] ?? null]
    : fields[2].length === 16
    ? [null, fields[2]]
    : [fields[2], fields[3] ?? null]
  
  return {
    counter:    fields[1] ?? 0,
    publicKey:  publicKey,
    epoch:      epoch,
    clockTime:  fields[4] ?? 0,
    status:     fields[5] ?? 0,
    handle:     fields[6] ?? 0,
  }
}
const parseRoutableMessage = (data) => {
  const fields = decodeMessage(data)
  let sessionInfo = null
  if (fields[3]) {
    try {
      sessionInfo = parseSessionInfo(fields[3])
      if (sessionInfo && sessionInfo.epoch) {
        console.log('[SESSION] Found SessionInfo in field 3')
      } else {
        sessionInfo = null // Invalid - no epoch
      }
    } catch (e) {
    }
  }
  if (!sessionInfo && fields[6]) {
    try {
      sessionInfo = parseSessionInfo(fields[6])
      if (sessionInfo && sessionInfo.epoch) {
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
          if (candidate && candidate.epoch) {
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
            if (candidate && candidate.epoch) {
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
      if (candidate && candidate.epoch) {
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
const parsePairingResponse = (data) => {
  const dbg = {
    rxLen: data ? data.length : 0,
    rawData: data || null,
    outerKeys: '',
    wrapped: false,
    innerKeys: '',
    f12opStatus: null,
    f12fault: null,
    opStatus: null,
    wlFault: null,
    f1type: '-',
    f3type: '-',
    f4type: '-',
    path: '?',
  }
  try {
    const outerFields = decodeMessage(data)
    dbg.outerKeys = Object.keys(outerFields).join(',')
    let fields = outerFields
    if (outerFields[10] instanceof Uint8Array) {
      dbg.wrapped = true
      dbg.path = 'f10wrap'
      fields = decodeMessage(outerFields[10])
      dbg.innerKeys = Object.keys(fields).join(',')
    }
    else if (outerFields[16] instanceof Uint8Array) {
      dbg.wrapped = true
      dbg.path = 'f16wrap'
      fields = decodeMessage(outerFields[16])
      dbg.innerKeys = Object.keys(fields).join(',')
      console.log('[VCSEC] ✓ Unwrapped field 16 (UnsignedMessage), inner fields: ' + dbg.innerKeys)
    }
    let vehiclePublicKey = null
    if (fields[17] instanceof Uint8Array) {
      const wlEntryInfo = parseWhitelistEntryInfo(fields[17])
      if (wlEntryInfo.publicKey && wlEntryInfo.publicKey.length === 65) {
        vehiclePublicKey = wlEntryInfo.publicKey
        dbg.vehiclePublicKeyFound = true
        const pubKeyHex = Array.from(vehiclePublicKey.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('')
        dbg.vehiclePublicKeyStart = pubKeyHex
        console.log('[VCSEC] ✓ Extracted vehicle EC key from field 17: ' + pubKeyHex + '... (65 bytes)')
      } else {
        dbg.vehiclePublicKeyFound = false
        if (fields[17]) {
          console.log('[VCSEC] Field 17 present but invalid: length=' + (wlEntryInfo.publicKey ? wlEntryInfo.publicKey.length : 'undefined'))
        }
      }
    } else {
      dbg.field17Present = false
    }
    if (fields[1] !== undefined) {
      dbg.f1type = (typeof fields[1] === 'number') ? `V=${fields[1]}` : `B(${fields[1].length})`
    }
    if (fields[3] !== undefined) {
      dbg.f3type = (typeof fields[3] === 'number') ? `V=${fields[3]}` : `B(${fields[3].length})`
    }
    if (fields[4] !== undefined) {
      dbg.f4type = (fields[4] instanceof Uint8Array) ? `B(${fields[4].length})` : `V=${fields[4]}`
    }
    if (outerFields[12] instanceof Uint8Array) {
      const statusFields = decodeMessage(outerFields[12])
      dbg.f12opStatus = statusFields[1] ?? 0
      dbg.f12fault = statusFields[2] ?? 0
      if (dbg.f12fault && dbg.f12fault !== 0) {
        dbg.path = 'f12err'
        return { success: false, status: 'error', error: `Proto fault:${dbg.f12fault}`, vehiclePublicKey, dbg }
      }
    }
    if (fields[1] instanceof Uint8Array) {
      dbg.path = 'f1B'
      dbg.f1len = fields[1].length
      const vehicleStatus = parseVehicleStatus(fields[1])
      return { success: true, status: 'pending', type: 'vehicleStatus', vehicleStatus, vehiclePublicKey, dbg }
    }
    if (!fields[4] && fields[3] instanceof Uint8Array) {
      dbg.path = 'f3B'
      dbg.f3len = fields[3].length
      const wlStatus = decodeMessage(fields[3])
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo < 0 ? 0 : wlInfo
      if (wlStatus[2] instanceof Uint8Array) dbg.signer = wlStatus[2]
      return { success: true, status: 'pending', message: 'Outer field 3 (not terminal)', vehiclePublicKey, dbg }
    }
    if (!fields[4] && typeof fields[1] === 'number') {
      dbg.path = 'f1N'
      dbg.opStatus = fields[1]
      const statusName = OPERATION_STATUS_NAMES[fields[1]] || `Status ${fields[1]}`
      console.log('[VCSEC] ✓ Got operationStatus: ' + statusName)
      
      if (fields[1] === OPERATIONSTATUS_WAIT) {
        return { success: true, status: 'wait', message: 'Tap key card on car', vehiclePublicKey, dbg }
      }
      if (fields[1] === OPERATIONSTATUS_UNKNOWN_KEY) {
        console.log('[VCSEC] ✓ Vehicle returned UNKNOWN_KEY status during pairing - this means key was added!')
        dbg.hasSigner = true  // Signal that pairing is complete and key was enrolled
        return { success: true, status: 'ok', message: 'Key enrolled (UNKNOWN_KEY transition)', vehiclePublicKey, dbg }
      }
      if (fields[1] >= 3 && fields[1] !== OPERATIONSTATUS_UNKNOWN_KEY) {
        return { success: false, status: 'error', error: statusName, vehiclePublicKey, dbg }
      }
      return { success: true, status: 'pending', message: statusName, vehiclePublicKey, dbg }
    }
    const commandStatusBytes = fields[4]
    if (!commandStatusBytes) {
      dbg.path = 'noF4'
      const availableFields = Object.keys(fields).join(',')
      console.log('[VCSEC] ⚠ No field 4 (CommandStatus). Available fields: ' + availableFields + '. Vehicle EC key found: ' + (vehiclePublicKey ? 'YES' : 'NO'))
      return { success: false, status: 'error', error: 'No command status (field 4)', availableFields, vehiclePublicKey, dbg }
    }
    dbg.path = 'f4'
    const csFields = decodeMessage(commandStatusBytes)
    const operationStatus = csFields[1] !== undefined ? csFields[1] : null
    dbg.opStatus = operationStatus
    const field3 = csFields[3]
    if (typeof field3 === 'number') dbg.wlFault = field3
    if (field3 instanceof Uint8Array) {
      const wlStatus = decodeMessage(field3)
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo
      if (wlStatus[2] instanceof Uint8Array) dbg.signer = wlStatus[2]
      if (wlInfo === -1) {
        if (dbg.signer) {
          dbg.wlFault = 0
          dbg.hasSigner = true
          console.log('[VCSEC] Pairing completed (auto-approved), vehiclePublicKey=' + (vehiclePublicKey ? 'yes' : 'NO'))
          return { success: true, status: 'ok', message: 'Key added (auto-approved)', vehiclePublicKey, dbg }
        }
        return { success: true, status: 'pending', message: 'Ambient push (not pairing result)', dbg }
      }
      if (wlInfo === 0) {
        console.log('[VCSEC] Pairing completed (manual), vehiclePublicKey=' + (vehiclePublicKey ? 'yes' : 'NO'))
        return { success: true, status: 'ok', message: 'Key added successfully', vehiclePublicKey, dbg }
      }
      if (wlInfo === 14) return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      return { success: false, status: 'error', error: wlErrorMessage(wlInfo), dbg }
    } else if (operationStatus === OPERATIONSTATUS_OK) {
      return { success: true, status: 'pending', message: 'Op status ok (awaiting wl result)', dbg }
    } else if (operationStatus === OPERATIONSTATUS_WAIT) {
      return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
    } else if (operationStatus === OPERATIONSTATUS_ERROR) {
      const faultCode = typeof field3 === 'number' ? field3 : 0
      dbg.wlFault = faultCode
      return { success: false, status: 'error', error: `WL fault:${faultCode}`, vehiclePublicKey, dbg }
    }
    dbg.path = 'unk'
    return { success: false, error: 'Unknown fmt', vehiclePublicKey, dbg }
  } catch (e) {
    dbg.exception = e.message
    return { success: false, error: e.message, vehiclePublicKey: null, dbg }
  }
}
export {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_PRESENT_KEY,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,
  OPERATIONSTATUS_UNKNOWN_KEY,
  OPERATION_STATUS_NAMES,
  SIGNATURE_TYPE_HMAC,
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
  buildKeyMetadata,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,
  parseSessionInfo,
  parseRoutableMessage,
  parseCommandStatus,
  parsePairingResponse,
  parseWhitelistEntryInfo,
  generateUUID,
  generateRoutingAddress,
}
