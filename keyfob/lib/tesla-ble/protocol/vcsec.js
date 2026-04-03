// Tesla VCSEC (Vehicle Security) message structures
// Based on tesla-motors/vehicle-command protobuf definitions
// Scope: pairing (key enrollment) only. BLE commands are sent via REST API.

import { encodeBytes, encodeEnum, encodeVarintField, concat, decodeMessage } from './protobuf.js'

// Domain types (universal_message.proto)
const DOMAIN_VEHICLE_SECURITY = 2

// Signature types (vcsec.proto SignatureType enum — DO NOT CHANGE)
const SIGNATURE_TYPE_PRESENT_KEY = 2  // Used for pairing (no HMAC needed)
const SIGNATURE_TYPE_HMAC = 5         // Used for session commands

// RKE actions (vcsec.proto RKEAction_E enum — DO NOT CHANGE)
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3

// Information request types (vcsec.proto InformationRequestType enum — DO NOT CHANGE)
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6

// Key roles (keys.proto Role enum — DO NOT CHANGE)
const KEY_ROLE_OWNER = 2  // ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3

// Key form factors (vcsec.proto KeyFormFactor enum — DO NOT CHANGE)
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // Triggers NFC keycard tap UI on car touchscreen

// Operation status (vcsec.proto OperationStatus_E — DO NOT CHANGE)
const OPERATIONSTATUS_OK = 0
const OPERATIONSTATUS_WAIT = 1
const OPERATIONSTATUS_ERROR = 2

const WL_ERRORS = {
  5:  'No permission (wl:5) - owner must approve',
  6:  'Invalid keycard (wl:6) - wrong card?',
  25: 'Keycard tap timeout (wl:25) - tap faster',
}
const wlErrorMessage = (code) => WL_ERRORS[code] ?? `WL info:${code}`

// UnsignedMessage fields (vcsec.proto):
//   1: InformationRequest
//   2: RKEAction_E (enum) — DO NOT use field 1 for RKE
//   16: WhitelistOperation
const buildUnsignedMessage = ({ informationRequest, rkeAction }) => {
  const parts = []
  if (informationRequest) parts.push(encodeBytes(1, informationRequest))
  if (rkeAction !== undefined) parts.push(encodeEnum(2, rkeAction))
  return concat(...parts)
}

// InformationRequest fields:
//   1: informationRequestType (enum)
//   2: keyId (bytes)
//   3: publicKey (bytes)
const buildInformationRequest = (requestType, keyId, publicKey, slot) => {
  const parts = [encodeEnum(1, requestType)]
  // oneof key: keyId (2), publicKey (3), or slot (4)
  if (keyId) parts.push(encodeBytes(2, keyId))
  else if (publicKey) parts.push(encodeBytes(3, publicKey))
  else if (slot !== undefined && slot !== null) parts.push(encodeVarintField(4, slot))
  return concat(...parts)
}

// VehicleStatus parsing
const parseVehicleStatus = (data) => {
  const fields = decodeMessage(data)
  
  // closureStatuses (field 1)
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

// SignedMessage fields (vcsec.proto — verified from Tesla Go SDK):
//   2: protobuf_message_as_bytes
//   3: signature_type
//   4: counter (varint)
//   5: signature (bytes, HMAC tag)
//   6: epoch (bytes, 16 bytes from SessionInfo)
//   7: expires_at (varint, clockTime + 60)
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

// ToVCSECMessage { SignedMessage (field 1) }
const buildToVCSECMessage = (signedMessage) => encodeBytes(1, signedMessage)

// KeyMetadata { keyFormFactor (field 1) }
const buildKeyMetadata = (keyFormFactor) => encodeEnum(1, keyFormFactor)

// PermissionChange { key (field 1), keyRole (field 4) }
const buildPermissionChange = (publicKeyMsg, role) => concat(
  encodeBytes(1, publicKeyMsg),
  encodeEnum(4, role)
)

// WhitelistOperation fields (vcsec.proto — DO NOT CHANGE):
//   5: addKeyToWhitelistAndAddPermissions (PermissionChange)
//   6: metadataForKey (KeyMetadata)
const buildWhitelistOperation = (publicKeyMsg, keyFormFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) => {
  const permissionChange = buildPermissionChange(publicKeyMsg, KEY_ROLE_OWNER)
  const metadata = buildKeyMetadata(keyFormFactor)
  return concat(
    encodeBytes(5, permissionChange),
    encodeBytes(6, metadata)
  )
}

// UnsignedMessage { WhitelistOperation (field 16) }
const buildUnsignedMessageWithWhitelist = (whitelistOperation) =>
  encodeBytes(16, whitelistOperation)

// CommandStatus fields (vcsec.proto):
//   1: operationStatus (OperationStatus_E)
//   2: signedMessageFault
//   3: whitelistOperationFault
const parseCommandStatus = (data) => {
  const fields = decodeMessage(data)
  return {
    operationStatus: fields[1] ?? null,
    signedMessageFault: fields[2] ?? null,
    whitelistOperationFault: fields[3] ?? null,
  }
}

// RoutableMessage fields (universal_message.proto):
//   6:  to_destination   { 1: domain (enum) }
//   7:  from_destination { 2: routing_address (bytes) }
//   10: protobuf_message_as_bytes (payload)
//   14: session_info_request
//   50: request_uuid
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

// SessionInfoRequest { public_key (field 1), challenge (field 2) }
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

// Parse SessionInfo (Signatures.SessionInfo from car_server.proto Response.field3):
//   1: counter (varint)
//   2: publicKey (bytes, 65 bytes vehicle ephemeral key) OR epoch (16 bytes) - varies by vehicle
//   3: epoch (bytes, 16 bytes) OR empty
//   4: clock_time (fixed32)
//   5: status (enum)
//   6: handle (varint)
// Note: Some vehicles send epoch in field 2 instead of field 3
const parseSessionInfo = (data) => {
  const fields = decodeMessage(data)
  
  // Determine if field 2 is publicKey (65 bytes) or epoch (16 bytes)
  let publicKey = null
  let epoch = null
  
  if (fields[2]) {
    if (fields[2].length === 65) {
      publicKey = fields[2]
      epoch = fields[3] ?? null
    } else if (fields[2].length === 16) {
      // Vehicle sent epoch in field 2 instead
      epoch = fields[2]
      publicKey = null
    } else {
      publicKey = fields[2]
      epoch = fields[3] ?? null
    }
  } else {
    epoch = fields[3] ?? null
  }
  
  return {
    counter:    fields[1] ?? 0,
    publicKey:  publicKey,
    epoch:      epoch,
    clockTime:  fields[4] ?? 0,
    status:     fields[5] ?? 0,
    handle:     fields[6] ?? 0,
  }
}

// Parse RoutableMessage / Response from car
// Car sends Response (car_server.proto) where:
//   1: ActionStatus
//   3: SessionInfo (Signatures.SessionInfo in oneof response_msg)
//   10: protobuf_message_as_bytes (FromVCSECMessage / payload) — for VCSEC responses
//   12: signedMessageStatus (error indicator)
// 
// SessionInfo in field 3 is direct (not wrapped in field 15)
const parseRoutableMessage = (data) => {
  const fields = decodeMessage(data)
  let sessionInfo = null
  
  // Try field 3 first (direct SessionInfo at top level)
  if (fields[3]) {
    try {
      sessionInfo = parseSessionInfo(fields[3])
      if (sessionInfo && sessionInfo.epoch) {
        console.log('[SESSION] Found SessionInfo in field 3')
      } else {
        sessionInfo = null // Invalid - no epoch
      }
    } catch (e) {
      // Not valid SessionInfo
    }
  }
  
  // Try field 6 (some vehicles send SessionInfo here)
  if (!sessionInfo && fields[6]) {
    try {
      sessionInfo = parseSessionInfo(fields[6])
      if (sessionInfo && sessionInfo.epoch) {
        console.log('[SESSION] Found SessionInfo in field 6')
      } else {
        sessionInfo = null
      }
    } catch (e) {
      // Not valid SessionInfo
    }
  }
  
  // If not found at field 3/6, check field 10 (payload) which contains FromVCSECMessage
  // The FromVCSECMessage often has SessionInfo at field 3 within it
  if (!sessionInfo && fields[10]) {
    try {
      const fromVcsecFields = decodeMessage(fields[10])
      
      // Look for field 3 inside the payload (most common location for SessionInfo)
      if (fromVcsecFields[3]) {
        try {
          const candidate = parseSessionInfo(fromVcsecFields[3])
          if (candidate && candidate.epoch) {
            sessionInfo = candidate
            console.log('[SESSION] Found SessionInfo in field 10.field[3]')
          }
        } catch (e) {
          // Not valid SessionInfo, try other fields
        }
      }
      
      // If still not found, search all fields in the payload
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
            // Not SessionInfo, try next field
          }
        }
      }
    } catch (e) {
      console.log('[SESSION] Could not parse field 10 as FromVCSECMessage: ' + e.message)
    }
  }
  
  // If still not found, try field 15 (alternative location)
  if (!sessionInfo && fields[15]) {
    try {
      const candidate = parseSessionInfo(fields[15])
      if (candidate && candidate.epoch) {
        sessionInfo = candidate
        console.log('[SESSION] Found SessionInfo in field 15')
      }
    } catch (e) {
      // Not valid
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

// Parse pairing or status response — Tesla wraps response in RoutableMessage.
//
// RoutableMessage { protobuf_message_as_bytes (field 10): FromVCSECMessage }
// FromVCSECMessage { 
//   vehicleStatus (field 1): VehicleStatus,
//   commandStatus (field 4): CommandStatus,
//   whitelistEntryInfo (field 17): WhitelistEntryInfo containing vehicle EC public key
// }
//
// WhitelistEntryInfo contains:
//   field 1: publicKey (65 bytes, vehicle EC public key for this session)
//   field 2+: other metadata
const parseWhitelistEntryInfo = (data) => {
  const fields = decodeMessage(data)
  return {
    publicKey: fields[1] ?? null,  // 65-byte P-256 EC public key
    // Other fields (2+) contain metadata we don't use yet
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
      fields = decodeMessage(outerFields[10])
      dbg.innerKeys = Object.keys(fields).join(',')
    }

    // Check for vehicle's EC public key in field 17 (WhitelistEntryInfo)
    // Note: Field 17 is typically obtained via GetWhitelistEntryInfo request, not sent automatically during pairing.
    // Some vehicles may send it as part of the pairing completion, but it's not guaranteed.
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
      console.log('[VCSEC] Field 17 (WhitelistEntryInfo) NOT found in response - will request via GetWhitelistEntryInfo')
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

    // Check for protocol-level error in RoutableMessage (field 12 = signedMessageStatus)
    if (outerFields[12] instanceof Uint8Array) {
      const statusFields = decodeMessage(outerFields[12])
      dbg.f12opStatus = statusFields[1] ?? 0
      dbg.f12fault = statusFields[2] ?? 0
      if (dbg.f12fault && dbg.f12fault !== 0) {
        dbg.path = 'f12err'
        return { success: false, status: 'error', error: `Proto fault:${dbg.f12fault}`, dbg }
      }
    }

    // field 1 as bytes = FromVCSECMessage.vehicleStatus (unsolicited push or response to GET_STATUS)
    if (fields[1] instanceof Uint8Array) {
      dbg.path = 'f1B'
      dbg.f1len = fields[1].length
      const vehicleStatus = parseVehicleStatus(fields[1])
      return { success: true, status: 'pending', type: 'vehicleStatus', vehicleStatus, dbg }
    }

    // Per Tesla SDK: only commandStatus (field 4) is terminal for pairing.
    // Outer field 3 (keychainStatus/ambient push) is never a pairing result.
    if (!fields[4] && fields[3] instanceof Uint8Array) {
      dbg.path = 'f3B'
      dbg.f3len = fields[3].length
      const wlStatus = decodeMessage(fields[3])
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo < 0 ? 0 : wlInfo
      if (wlStatus[2] instanceof Uint8Array) dbg.signer = wlStatus[2]
      return { success: true, status: 'pending', message: 'Outer field 3 (not terminal)', dbg }
    }

    // Direct CommandStatus with only operationStatus (no sub-message field)
    if (!fields[4] && typeof fields[1] === 'number') {
      dbg.path = 'f1N'
      dbg.opStatus = fields[1]
      if (fields[1] === OPERATIONSTATUS_WAIT) return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      if (fields[1] === OPERATIONSTATUS_ERROR) return { success: false, status: 'error', error: 'OpStatus error', dbg }
      return { success: true, status: 'pending', message: 'Op status ok (awaiting result)', dbg }
    }

    const commandStatusBytes = fields[4]
    if (!commandStatusBytes) {
      dbg.path = 'noF4'
      return { success: false, error: 'No command status (field 4)', dbg }
    }

    dbg.path = 'f4'
    const csFields = decodeMessage(commandStatusBytes)

    const operationStatus = csFields[1] !== undefined ? csFields[1] : null
    dbg.opStatus = operationStatus

    const field3 = csFields[3]
    if (typeof field3 === 'number') dbg.wlFault = field3

    if (field3 instanceof Uint8Array) {
      // field 1 = whitelistOperationInformation: 0=NONE=success, 14=tap required
      // field 2 = signerOfOperation (KeyIdentifier bytes)
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
      // commandStatus present but whitelistOperationStatus absent — keep waiting.
      // Per Tesla SDK: only terminal when whitelistOperationStatus is explicitly present.
      return { success: true, status: 'pending', message: 'Op status ok (awaiting wl result)', dbg }
    } else if (operationStatus === OPERATIONSTATUS_WAIT) {
      return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
    } else if (operationStatus === OPERATIONSTATUS_ERROR) {
      const faultCode = typeof field3 === 'number' ? field3 : 0
      dbg.wlFault = faultCode
      return { success: false, status: 'error', error: `WL fault:${faultCode}`, dbg }
    }

    dbg.path = 'unk'
    return { success: false, error: 'Unknown fmt', dbg }
  } catch (e) {
    dbg.exception = e.message
    return { success: false, error: e.message, dbg }
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
