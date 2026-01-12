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

// Information request types
const INFO_REQUEST_GET_STATUS = 0
const INFO_REQUEST_GET_WHITELIST_INFO = 1
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 2
const INFO_REQUEST_SESSION_INFO = 3

// Key roles for whitelist
const KEY_ROLE_OWNER = 0
const KEY_ROLE_DRIVER = 1
const KEY_ROLE_SERVICE_TECH = 4
const KEY_ROLE_CHARGING_MANAGER = 5

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
// Fields from vcsec.proto:
//   1: InformationRequest
//   2: RKEAction (enum)
//   4: closureMoveRequest
//   16: WhitelistOperation
function buildUnsignedMessage(options) {
  const parts = []

  // RKE action (field 2)
  if (options.rkeAction !== undefined) {
    parts.push(encodeEnum(2, options.rkeAction))
  }

  // Information request (field 1)
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
// Fields:
//   1: protobuf_message_as_bytes (bytes) - the unsigned message
//   2: signature_type (enum)
//   5: signature (bytes)
//   8: counter (uint32)
//   9: epoch (bytes)
//   10: expires_at (uint32)
//   11: destination (Destination)
function buildSignedMessage(options) {
  const parts = []

  // protobuf_message_as_bytes (field 1)
  if (options.payload) {
    parts.push(encodeBytes(1, options.payload))
  }

  // signature_type (field 2)
  if (options.signatureType !== undefined) {
    parts.push(encodeEnum(2, options.signatureType))
  }

  // signature (field 5)
  if (options.signature) {
    parts.push(encodeBytes(5, options.signature))
  }

  // counter (field 8)
  if (options.counter !== undefined) {
    parts.push(encodeVarintField(8, options.counter))
  }

  // epoch (field 9)
  if (options.epoch) {
    parts.push(encodeBytes(9, options.epoch))
  }

  // expires_at (field 10)
  if (options.expiresAt !== undefined) {
    parts.push(encodeVarintField(10, options.expiresAt))
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

// Build WhitelistOperation message
// This is the main message for adding/removing keys from the vehicle
// Fields:
//   1: addPublicKeyToWhitelist (PublicKey message)
//   16: metadataForKey (KeyMetadata)
function buildWhitelistOperation(keyToAdd, keyFormFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) {
  const parts = []

  // addPublicKeyToWhitelist (field 1)
  parts.push(encodeBytes(1, keyToAdd))

  // metadataForKey (field 16) - required for Tesla to process pairing
  const metadata = buildKeyMetadata(keyFormFactor)
  parts.push(encodeBytes(16, metadata))

  return concat(...parts)
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

// Parse complete pairing response from RoutableMessage
// Extracts the FromVCSECMessage from the payload
function parsePairingResponse(data) {
  try {
    const routable = parseRoutableMessage(data)

    if (!routable.payload) {
      return { success: false, error: 'No payload in response' }
    }

    const fromVcsec = parseFromVCSECMessage(routable.payload)

    if (fromVcsec.type === 'commandStatus' && fromVcsec.commandStatus) {
      const status = fromVcsec.commandStatus.operationStatus

      if (status === OPERATIONSTATUS_OK) {
        return { success: true, status: 'ok', message: 'Key added successfully' }
      } else if (status === OPERATIONSTATUS_WAIT) {
        return { success: true, status: 'wait', message: 'Tap key card on car' }
      } else if (status === OPERATIONSTATUS_ERROR) {
        const fault = fromVcsec.commandStatus.whitelistOperationFault
        return { success: false, status: 'error', error: `Whitelist error: ${fault}` }
      }
    }

    return { success: false, error: 'Unknown response format', rawFields: fromVcsec.rawFields }
  } catch (e) {
    return { success: false, error: e.message }
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
  INFO_REQUEST_SESSION_INFO,
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
