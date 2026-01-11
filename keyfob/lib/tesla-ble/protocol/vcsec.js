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

// Build RoutableMessage
// Fields:
//   1: to_destination (Destination)
//   2: from_destination (Destination)
//   3: protobuf_message_as_bytes (bytes)
//   6: session_info_request (SessionInfoRequest)
//   7: session_info (SessionInfo)
//   8: signedMessageStatus
//   12: uuid (bytes)
//   50: flags (uint32)
function buildRoutableMessage(options) {
  const parts = []

  // to_destination (field 1) - Destination message
  if (options.toDomain !== undefined) {
    const destination = encodeEnum(1, options.toDomain) // domain field
    parts.push(encodeBytes(1, destination))
  }

  // from_destination (field 2) - routing address
  if (options.routingAddress) {
    const destination = encodeBytes(2, options.routingAddress) // routing_address field
    parts.push(encodeBytes(2, destination))
  }

  // protobuf_message_as_bytes (field 3)
  if (options.payload) {
    parts.push(encodeBytes(3, options.payload))
  }

  // session_info_request (field 6)
  if (options.sessionInfoRequest) {
    parts.push(encodeBytes(6, options.sessionInfoRequest))
  }

  // uuid (field 12)
  if (options.uuid) {
    parts.push(encodeBytes(12, options.uuid))
  }

  // flags (field 50)
  if (options.flags !== undefined) {
    parts.push(encodeVarintField(50, options.flags))
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
// Fields:
//   1: RKEAction (enum)
//   16: closures (ClosuresState)
//   17: InformationRequest (message)
function buildUnsignedMessage(options) {
  const parts = []

  // RKE action (field 1)
  if (options.rkeAction !== undefined) {
    parts.push(encodeEnum(1, options.rkeAction))
  }

  // Information request (field 17)
  if (options.informationRequest) {
    parts.push(encodeBytes(17, options.informationRequest))
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
function parseRoutableMessage(data) {
  const fields = decodeMessage(data)

  return {
    fromDestination: fields[2] ? decodeMessage(fields[2]) : null,
    payload: fields[3] || null,
    sessionInfo: fields[7] ? parseSessionInfo(fields[7]) : null,
    signedMessageStatus: fields[8] || null,
    uuid: fields[12] || null
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

// Build KeyToAdd message
// Fields:
//   1: publicKey (bytes) - 65 bytes uncompressed public key
//   2: role (enum) - KEY_ROLE_OWNER, KEY_ROLE_DRIVER, etc.
//   6: formFactor (enum) - what type of device this key is
function buildKeyToAdd(publicKey, role = KEY_ROLE_OWNER, formFactor = KEY_FORM_FACTOR_ANDROID_DEVICE) {
  const parts = []

  // publicKey (field 1)
  parts.push(encodeBytes(1, publicKey))

  // role (field 2)
  parts.push(encodeEnum(2, role))

  // formFactor (field 6)
  parts.push(encodeEnum(6, formFactor))

  return concat(...parts)
}

// Build WhitelistOperation message
// This is the main message for adding/removing keys from the vehicle
// Fields:
//   1: addKeyToWhitelistRequest (KeyToAdd message)
//   16: metadataForKey (KeyMetadata)
function buildWhitelistOperation(keyToAdd) {
  const parts = []

  // addKeyToWhitelistRequest (field 1)
  parts.push(encodeBytes(1, keyToAdd))

  return concat(...parts)
}

// Build UnsignedMessage with WhitelistOperation
// Fields:
//   16: WhitelistOperation
function buildUnsignedMessageWithWhitelist(whitelistOperation) {
  return encodeBytes(16, whitelistOperation)
}

// Parse WhitelistOperation response
// Returns operation status
function parseWhitelistOperationStatus(data) {
  const fields = decodeMessage(data)

  // Field 17 contains the whitelist operation status
  // Field 1 of that is signedMessageStatus or operationStatus
  return {
    success: true, // If we got here without error, likely success
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

  // Builders
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildKeyToAdd,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,

  // Parsers
  parseSessionInfo,
  parseRoutableMessage,
  parseWhitelistOperationStatus,

  // Utilities
  generateUUID,
  generateRoutingAddress
}
