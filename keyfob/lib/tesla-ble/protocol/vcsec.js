// Tesla VCSEC (Vehicle Security) message structures
// Based on tesla-motors/vehicle-command protobuf definitions

import { encodeBytes, encodeEnum, encodeVarintField, concat, decodeMessage } from './protobuf.js'

// Domain types
const DOMAIN_BROADCAST = 0
const DOMAIN_VEHICLE_SECURITY = 2  // VCSEC
const DOMAIN_INFOTAINMENT = 3

// Signature types
const SIGNATURE_TYPE_NONE = 0
const SIGNATURE_TYPE_PRESENT_KEY = 2
const SIGNATURE_TYPE_HMAC = 5
const SIGNATURE_TYPE_AES_GCM = 6

// RKE (Remote Keyless Entry) actions
const RKE_ACTION_UNLOCK = 0
const RKE_ACTION_LOCK = 1
const RKE_ACTION_OPEN_TRUNK = 2
const RKE_ACTION_OPEN_FRUNK = 3
const RKE_ACTION_OPEN_CHARGE_PORT = 4
const RKE_ACTION_CLOSE_CHARGE_PORT = 5

// Information request types (from vcsec.proto InformationRequestType enum)
// DO NOT CHANGE — verified from vcsec.proto
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_INFO = 5
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6

// Key roles for whitelist (from keys.proto Keys.Role enum)
// ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3 — DO NOT CHANGE, verified from keys.proto
const KEY_ROLE_OWNER = 2
const KEY_ROLE_DRIVER = 3

// Key form factors
const KEY_FORM_FACTOR_UNKNOWN = 0
const KEY_FORM_FACTOR_NFC_CARD = 1
const KEY_FORM_FACTOR_IOS_DEVICE = 6
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7
const KEY_FORM_FACTOR_CLOUD_KEY = 9

// Operation status from vcsec.proto OperationStatus_E
const OPERATIONSTATUS_OK = 0
const OPERATIONSTATUS_WAIT = 1
const OPERATIONSTATUS_ERROR = 2

// Build RoutableMessage
// Fields from universal_message.proto:
//   6: to_destination (Destination)
//   7: from_destination (Destination)
//   10: protobuf_message_as_bytes (bytes)
//   14: session_info_request (SessionInfoRequest)
//   15: session_info (bytes)
//   50: request_uuid (bytes)
//   51: uuid (bytes)
//   52: flags (uint32)
function buildRoutableMessage(options) {
  const parts = []

  // to_destination (field 6) - Destination message with domain
  if (options.toDomain !== undefined) {
    const destination = encodeEnum(1, options.toDomain) // Destination.domain is field 1
    parts.push(encodeBytes(6, destination))
  }

  // from_destination (field 7) - Destination message with routing address
  if (options.routingAddress) {
    const destination = encodeBytes(2, options.routingAddress) // Destination.routing_address is field 2
    parts.push(encodeBytes(7, destination))
  }

  // protobuf_message_as_bytes (field 10)
  if (options.payload) {
    parts.push(encodeBytes(10, options.payload))
  }

  // session_info_request (field 14)
  if (options.sessionInfoRequest) {
    parts.push(encodeBytes(14, options.sessionInfoRequest))
  }

  // request_uuid (field 50)
  if (options.uuid) {
    parts.push(encodeBytes(50, options.uuid))
  }

  // flags (field 52)
  if (options.flags !== undefined) {
    parts.push(encodeVarintField(52, options.flags))
  }

  return concat(...parts)
}

// Build SessionInfoRequest
// Fields:
//   1: public_key (bytes) - client's ephemeral public key
//   2: challenge (bytes) - random challenge
function buildSessionInfoRequest(publicKey, challenge) {
  const parts = []

  if (publicKey) {
    parts.push(encodeBytes(1, publicKey))
  }

  if (challenge) {
    parts.push(encodeBytes(2, challenge))
  }

  return concat(...parts)
}

// Build UnsignedMessage (for VCSEC)
// Fields from vcsec.proto (DO NOT CHANGE — verified from vcsec.proto):
//   1: InformationRequest
//   2: RKEAction (enum)
//   4: closureMoveRequest
//   16: WhitelistOperation
function buildUnsignedMessage(options) {
  const parts = []

  // RKE action (field 2) — DO NOT CHANGE TO 1
  if (options.rkeAction !== undefined) {
    parts.push(encodeEnum(2, options.rkeAction))
  }

  // Information request (field 1) — DO NOT CHANGE TO 4
  if (options.informationRequest) {
    parts.push(encodeBytes(1, options.informationRequest))
  }

  return concat(...parts)
}

// Build InformationRequest
// Fields:
//   1: informationRequestType (enum)
//   2: keyId (bytes)
//   3: publicKey (bytes)
function buildInformationRequest(requestType, keyId, publicKey) {
  const parts = []

  parts.push(encodeEnum(1, requestType))

  if (keyId) {
    parts.push(encodeBytes(2, keyId))
  }

  if (publicKey) {
    parts.push(encodeBytes(3, publicKey))
  }

  return concat(...parts)
}

// Build SignedMessage wrapper
// Fields (from vcsec.proto):
//   2: protobuf_message_as_bytes (bytes) - the unsigned message
//   3: signature_type (enum)
//   4: counter (uint32)
//   5: signature (bytes)
//   6: epoch (bytes)
//   7: expires_at (uint32)
function buildSignedMessage(options) {
  const parts = []

  // protobuf_message_as_bytes (field 2)
  if (options.payload) {
    parts.push(encodeBytes(2, options.payload))
  }

  // signature_type (field 3)
  if (options.signatureType !== undefined) {
    parts.push(encodeEnum(3, options.signatureType))
  }

  // signature (field 5)
  if (options.signature) {
    parts.push(encodeBytes(5, options.signature))
  }

  // counter (field 4)
  if (options.counter !== undefined) {
    parts.push(encodeVarintField(4, options.counter))
  }

  // epoch (field 6)
  if (options.epoch) {
    parts.push(encodeBytes(6, options.epoch))
  }

  // expires_at (field 7)
  if (options.expiresAt !== undefined) {
    parts.push(encodeVarintField(7, options.expiresAt))
  }

  return concat(...parts)
}

// Build ToVCSECMessage wrapper
// Fields:
//   1: SignedMessage
function buildToVCSECMessage(signedMessage) {
  return encodeBytes(1, signedMessage)
}

// Parse SessionInfo response
// Fields:
//   1: publicKey (bytes)
//   2: epoch (bytes)
//   3: clockTime (uint32)
//   4: counter (uint32)
function parseSessionInfo(data) {
  const fields = decodeMessage(data)

  return {
    publicKey: fields[1] || null,
    epoch: fields[2] || null,
    clockTime: fields[3] || 0,
    counter: fields[4] || 0
  }
}

// Parse RoutableMessage response
// Fields: 6=to_dest, 7=from_dest, 10=payload, 12=signedMessageStatus, 15=session_info, 50=request_uuid
function parseRoutableMessage(data) {
  const fields = decodeMessage(data)

  return {
    toDestination: fields[6] ? decodeMessage(fields[6]) : null,
    fromDestination: fields[7] ? decodeMessage(fields[7]) : null,
    payload: fields[10] || null,
    signedMessageStatus: fields[12] || null,
    sessionInfo: fields[15] ? parseSessionInfo(fields[15]) : null,
    uuid: fields[50] || null
  }
}

// Generate random UUID (16 bytes)
function generateUUID() {
  const uuid = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    uuid[i] = Math.floor(Math.random() * 256)
  }
  return uuid
}

// Generate random routing address (16 bytes)
function generateRoutingAddress() {
  return generateUUID()
}

// Build PermissionChange for key permissions
// Fields based on VCSEC.proto KeyPermissions
function buildKeyPermissions(options = {}) {
  // For a basic key, we don't need to set any special permissions
  // The key will get default permissions based on its role
  return new Uint8Array(0)
}

// Build PublicKey message
// Fields from vcsec.proto:
//   1: PublicKeyRaw (bytes) - 65 bytes uncompressed public key
function buildPublicKey(publicKeyBytes) {
  return encodeBytes(1, publicKeyBytes)
}

// Build KeyToAdd message (deprecated - use buildPublicKey for simple whitelist add)
// For compatibility, this now just wraps buildPublicKey
function buildKeyToAdd(publicKey, role = KEY_ROLE_OWNER, formFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) {
  // Note: role and formFactor are ignored - PublicKey message only has PublicKeyRaw
  // For adding keys with specific roles, use PermissionChange message instead
  return buildPublicKey(publicKey)
}

// Build KeyMetadata message
// Fields:
//   1: keyFormFactor (enum)
function buildKeyMetadata(keyFormFactor) {
  return encodeEnum(1, keyFormFactor)
}

// Build PermissionChange message (for addKeyToWhitelistAndAddPermissions)
// Fields:
//   1: key (PublicKey)
//   4: keyRole (Role enum)
function buildPermissionChange(publicKeyMsg, role) {
  return concat(
    encodeBytes(1, publicKeyMsg),
    encodeEnum(4, role)
  )
}

// Build WhitelistOperation message
// Fields (from vcsec.proto):
//   5: addKeyToWhitelistAndAddPermissions (PermissionChange) - oneof sub_message
//   6: metadataForKey (KeyMetadata)
// NOTE: field 16 = removeAllImpermanentKeys (bool), NOT metadataForKey
function buildWhitelistOperation(keyToAdd, keyFormFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) {
  // Build PermissionChange: { key: PublicKey, keyRole: ROLE_OWNER }
  const permissionChange = buildPermissionChange(keyToAdd, KEY_ROLE_OWNER)

  const metadata = buildKeyMetadata(keyFormFactor)

  return concat(
    encodeBytes(5, permissionChange),  // addKeyToWhitelistAndAddPermissions (field 5)
    encodeBytes(6, metadata)           // metadataForKey = field 6 (VERIFIED from vcsec.proto, DO NOT CHANGE TO 16)
  )
}

// Build UnsignedMessage with WhitelistOperation
// Fields:
//   16: WhitelistOperation
function buildUnsignedMessageWithWhitelist(whitelistOperation) {
  return encodeBytes(16, whitelistOperation)
}

// Parse CommandStatus from FromVCSECMessage
// Fields from vcsec.proto:
//   1: operationStatus (OperationStatus_E enum)
//   2: signedMessageFault (SignedMessage_information_E)
//   3: whitelistOperationFault (WhitelistOperation_information_E)
function parseCommandStatus(data) {
  const fields = decodeMessage(data)

  return {
    operationStatus: fields[1] !== undefined ? fields[1] : null,
    signedMessageFault: fields[2] !== undefined ? fields[2] : null,
    whitelistOperationFault: fields[3] !== undefined ? fields[3] : null
  }
}

// Parse FromVCSECMessage response
// Fields from vcsec.proto:
//   1: vehicleStatus
//   4: commandStatus (CommandStatus)
//   16: whitelistInfo
//   17: whitelistEntryInfo
function parseFromVCSECMessage(data) {
  const fields = decodeMessage(data)

  const result = {
    type: null,
    commandStatus: null,
    vehicleStatus: null,
    rawFields: fields
  }

  if (fields[4]) {
    result.type = 'commandStatus'
    result.commandStatus = parseCommandStatus(fields[4])
  } else if (fields[1]) {
    result.type = 'vehicleStatus'
    result.vehicleStatus = fields[1]
  } else if (fields[16]) {
    result.type = 'whitelistInfo'
  } else if (fields[17]) {
    result.type = 'whitelistEntryInfo'
  }

  return result
}

// Parse pairing response — Tesla wraps response in RoutableMessage.
//
// RoutableMessage { protobuf_message_as_bytes (field 10): FromVCSECMessage }
// FromVCSECMessage { commandStatus (field 4): CommandStatus }
//
// WAIT: commandStatus { operationStatus=1 }
// OK:   commandStatus { whitelistOperationStatus sub-msg present, operationStatus absent (default=0) }
//
function parsePairingResponse(data) {
  // dbg is always populated so callers can log exact wire details
  const dbg = {
    rxLen: data ? data.length : 0,
    rawData: data || null,  // full raw bytes for hex dump in UI
    outerKeys: '',
    wrapped: false,
    innerKeys: '',
    f12opStatus: null,  // RoutableMessage signedMessageStatus.operation_status
    f12fault: null,     // RoutableMessage signedMessageStatus.signed_message_fault
    opStatus: null,     // FromVCSECMessage commandStatus.operationStatus
    wlFault: null,      // WhitelistOperation fault code
    f1type: '-',        // field 1 type: 'V=N' (varint N) | 'B(N)' (bytes len N) | '-'
    f3type: '-',        // field 3 type: 'V=N' (varint N) | 'B(N)' (bytes len N) | '-'
    f4type: '-',        // field 4: 'B(N)' | '-'
    path: '?',          // which parse branch was taken
  }

  try {
    const outerFields = decodeMessage(data)
    dbg.outerKeys = Object.keys(outerFields).join(',')

    // Unwrap RoutableMessage — payload is in field 10 (protobuf_message_as_bytes)
    let fields = outerFields
    if (outerFields[10] instanceof Uint8Array) {
      dbg.wrapped = true
      fields = decodeMessage(outerFields[10])
      dbg.innerKeys = Object.keys(fields).join(',')
    }

    // Capture raw field types so UI can show exactly what the car sent
    if (fields[1] !== undefined) {
      dbg.f1type = (typeof fields[1] === 'number') ? ('V=' + fields[1]) : ('B(' + fields[1].length + ')')
    }
    if (fields[3] !== undefined) {
      dbg.f3type = (typeof fields[3] === 'number') ? ('V=' + fields[3]) : ('B(' + fields[3].length + ')')
    }
    if (fields[4] !== undefined) {
      dbg.f4type = (fields[4] instanceof Uint8Array) ? ('B(' + fields[4].length + ')') : ('V=' + fields[4])
    }

    // Check for protocol-level error in RoutableMessage (field 12 = signedMessageStatus)
    if (outerFields[12] instanceof Uint8Array) {
      const statusFields = decodeMessage(outerFields[12])
      dbg.f12opStatus = statusFields[1] !== undefined ? statusFields[1] : 0
      dbg.f12fault = statusFields[2] !== undefined ? statusFields[2] : 0
      if (dbg.f12fault && dbg.f12fault !== 0) {
        dbg.path = 'f12err'
        return { success: false, status: 'error', error: 'Proto fault:' + dbg.f12fault, dbg }
      }
    }

    // Car sends CommandStatus directly (no FromVCSECMessage wrapper):
    //   field 1 (varint) = operationStatus, field 3 (bytes) = whitelistOperationStatus
    // WhitelistOperation_status { field 1 = whitelistOperationInformation (enum) }
    //   0 = NONE (success), 14 = NOT_ALLOWED_TO_ADD_UNLESS_ON_READER (tap required), other = error
    if (!fields[4] && fields[3] instanceof Uint8Array) {
      dbg.path = 'f3B'
      dbg.f3len = fields[3].length
      dbg.f3bytes = fields[3]

      const outerOpStatus = fields[1] !== undefined ? fields[1] : 0
      dbg.opStatus = outerOpStatus

      if (outerOpStatus === OPERATIONSTATUS_WAIT) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      if (outerOpStatus === OPERATIONSTATUS_ERROR) {
        return { success: false, status: 'error', error: 'WL op error', dbg }
      }

      // outerOpStatus = OK (0 or absent): decode WhitelistOperation_status to get real result
      // WhitelistOperation_status fields (from vcsec.proto):
      //   1: whitelistOperationInformation (enum) — 0=NONE=success, 14=tap required, etc.
      //   2: signerOfOperation (KeyIdentifier bytes) — which authorized key approved this
      //   3: operationStatus (enum)
      const wlStatus = decodeMessage(fields[3])
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : 0
      dbg.wlFault = wlInfo
      if (wlStatus[2] instanceof Uint8Array) {
        const signer = decodeMessage(wlStatus[2])
        dbg.signer = signer[1] instanceof Uint8Array ? signer[1] : null
      }

      // NONE (0) = key successfully added
      if (wlInfo === 0) {
        return { success: true, status: 'ok', message: 'Key added', dbg }
      }
      // NOT_ALLOWED_TO_ADD_UNLESS_ON_READER (14) = car waiting for NFC keycard tap
      if (wlInfo === 14) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      // Any other code = error (e.g. 25 = tap timeout, 5 = no permission, etc.)
      return { success: false, status: 'error', error: 'WL info:' + wlInfo, dbg }
    }

    // Car sends CommandStatus directly with only operationStatus (no sub-message field)
    if (!fields[4] && typeof fields[1] === 'number') {
      dbg.path = 'f1N'
      dbg.opStatus = fields[1]
      if (fields[1] === OPERATIONSTATUS_WAIT) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      if (fields[1] === OPERATIONSTATUS_ERROR) {
        return { success: false, status: 'error', error: 'OpStatus error', dbg }
      }
      return { success: true, status: 'ok', message: 'Key added', dbg }
    }

    // field 1 = FromVCSECMessage.vehicleStatus (bytes) — unsolicited status push from car,
    // not related to the pairing operation. Return 'pending' so callers keep waiting
    // without incorrectly treating this as a tap-required or success signal.
    if (!fields[4] && fields[1] instanceof Uint8Array) {
      dbg.path = 'f1B'
      dbg.f1len = fields[1].length
      return { success: true, status: 'pending', message: 'Vehicle status push (ignore)', dbg }
    }

    // field 4 = commandStatus (bytes)
    const commandStatusBytes = fields[4]
    if (!commandStatusBytes) {
      dbg.path = 'noF4'
      return { success: false, error: 'No command status (field 4)', dbg }
    }

    dbg.path = 'f4'
    const csFields = decodeMessage(commandStatusBytes)

    // field 1 = operationStatus (varint) — absent means OK (default=0)
    const operationStatus = csFields[1] !== undefined ? csFields[1] : null
    dbg.opStatus = operationStatus

    // field 3: Uint8Array = whitelistOperationStatus bytes, number = fault code
    const field3 = csFields[3]
    if (typeof field3 === 'number') dbg.wlFault = field3

    if (field3 instanceof Uint8Array) {
      // Decode WhitelistOperation_status to get the actual info code:
      //   field 1 = whitelistOperationInformation (enum): 0=NONE=success, 14=tap required
      //   field 2 = signerOfOperation (KeyIdentifier bytes)
      const wlStatus = decodeMessage(field3)
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : 0
      dbg.wlFault = wlInfo
      if (wlStatus[2] instanceof Uint8Array) {
        const signer = decodeMessage(wlStatus[2])
        dbg.signer = signer[1] instanceof Uint8Array ? signer[1] : null
      }
      if (wlInfo === 0) {
        return { success: true, status: 'ok', message: 'Key added successfully', dbg }
      }
      if (wlInfo === 14) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      return { success: false, status: 'error', error: 'WL info:' + wlInfo, dbg }
    } else if (operationStatus === OPERATIONSTATUS_OK) {
      return { success: true, status: 'ok', message: 'Key added successfully', dbg }
    } else if (operationStatus === OPERATIONSTATUS_WAIT) {
      return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
    } else if (operationStatus === OPERATIONSTATUS_ERROR) {
      const faultCode = typeof field3 === 'number' ? field3 : 0
      dbg.wlFault = faultCode
      return { success: false, status: 'error', error: 'WL fault:' + faultCode, dbg }
    }

    dbg.path = 'unk'
    return { success: false, error: 'Unknown fmt', dbg }
  } catch (e) {
    dbg.exception = e.message
    return { success: false, error: e.message, dbg }
  }
}

// Parse WhitelistOperation response (deprecated - use parsePairingResponse)
function parseWhitelistOperationStatus(data) {
  const fields = decodeMessage(data)

  return {
    success: true,
    rawFields: fields
  }
}

export {
  // Constants
  DOMAIN_BROADCAST,
  DOMAIN_VEHICLE_SECURITY,
  DOMAIN_INFOTAINMENT,
  SIGNATURE_TYPE_NONE,
  SIGNATURE_TYPE_PRESENT_KEY,
  SIGNATURE_TYPE_HMAC,
  SIGNATURE_TYPE_AES_GCM,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_OPEN_TRUNK,
  RKE_ACTION_OPEN_FRUNK,
  RKE_ACTION_OPEN_CHARGE_PORT,
  RKE_ACTION_CLOSE_CHARGE_PORT,
  INFO_REQUEST_GET_STATUS,
  INFO_REQUEST_GET_WHITELIST_INFO,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  KEY_ROLE_OWNER,
  KEY_ROLE_DRIVER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  KEY_FORM_FACTOR_CLOUD_KEY,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,

  // Builders
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildPublicKey,
  buildKeyToAdd,
  buildKeyMetadata,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,

  // Parsers
  parseSessionInfo,
  parseRoutableMessage,
  parseCommandStatus,
  parseFromVCSECMessage,
  parsePairingResponse,
  parseWhitelistOperationStatus,

  // Utilities
  generateUUID,
  generateRoutingAddress
}
