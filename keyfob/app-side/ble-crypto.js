// Tesla BLE Crypto Handler for App-Side
// Builds VCSEC protobuf messages for pairing (key enrollment) only.
// No session, no commands — those go via REST API.

// ============================================
// Protobuf encoding helpers
// ============================================

function encodeVarint(value) {
  const bytes = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return new Uint8Array(bytes)
}

function encodeBytes(fieldNumber, data) {
  const key = encodeVarint((fieldNumber << 3) | 2)
  const length = encodeVarint(data.length)
  const result = new Uint8Array(key.length + length.length + data.length)
  result.set(key)
  result.set(length, key.length)
  result.set(data, key.length + length.length)
  return result
}

function encodeEnum(fieldNumber, value) {
  const key = encodeVarint((fieldNumber << 3) | 0)
  const val = encodeVarint(value)
  const result = new Uint8Array(key.length + val.length)
  result.set(key)
  result.set(val, key.length)
  return result
}

function concat(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

// ============================================
// Utilities
// ============================================

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

// ============================================
// Tesla VCSEC Protocol Constants
// ============================================

const DOMAIN_VEHICLE_SECURITY = 2
const SIGNATURE_TYPE_PRESENT_KEY = 2  // No HMAC needed for pairing

// Key form factors (vcsec.proto KeyFormFactor enum — DO NOT CHANGE)
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // Triggers NFC keycard tap UI on car touchscreen

// Key roles (keys.proto Role enum — DO NOT CHANGE)
const ROLE_OWNER = 2  // ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3

// ============================================
// Tesla VCSEC Message Builders
// ============================================

function buildPublicKey(publicKeyBytes) {
  // PublicKey { PublicKeyRaw (field 1) = bytes }
  return encodeBytes(1, publicKeyBytes)
}

function buildKeyMetadata(keyFormFactor) {
  // KeyMetadata { keyFormFactor (field 1) = enum }
  return encodeEnum(1, keyFormFactor)
}

// SignedMessage has ONLY fields 2 and 3 per vcsec.proto (verified from Tesla Go SDK).
// For pairing (PRESENT_KEY) we only use these two fields anyway.
function buildSignedMessage(options) {
  const parts = []
  if (options.payload) parts.push(encodeBytes(2, options.payload))
  if (options.signatureType !== undefined) parts.push(encodeEnum(3, options.signatureType))
  return concat(...parts)
}

function buildToVCSECMessage(signedMessage) {
  // ToVCSECMessage { signedMessage (field 1) }
  return encodeBytes(1, signedMessage)
}

// ============================================
// Pairing Message Builders
// ============================================

class BLECryptoSession {
  // Build pairing message: enrolls our public key into the Tesla whitelist.
  // Wire format: ToVCSECMessage > SignedMessage(PRESENT_KEY) > UnsignedMessage > WhitelistOperation
  buildPairMessage(publicKeyHex) {
    const publicKeyBytes = hexToBytes(publicKeyHex)

    // PublicKey { PublicKeyRaw (field 1) = 65 bytes }
    const publicKeyMsg = buildPublicKey(publicKeyBytes)

    // PermissionChange { key (field 1), keyRole (field 4) = ROLE_OWNER }
    // keys.proto: ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3 — DO NOT CHANGE
    const permissionChange = concat(
      encodeBytes(1, publicKeyMsg),
      encodeEnum(4, ROLE_OWNER)
    )

    // WhitelistOperation:
    //   addKeyToWhitelistAndAddPermissions (field 5) = PermissionChange — DO NOT CHANGE TO FIELD 1
    //   metadataForKey (field 6) = KeyMetadata — DO NOT CHANGE TO FIELD 16
    const metadata = buildKeyMetadata(KEY_FORM_FACTOR_ANDROID_DEVICE)
    const whitelistOp = concat(
      encodeBytes(5, permissionChange),
      encodeBytes(6, metadata)
    )

    // UnsignedMessage { WhitelistOperation (field 16) }
    const unsignedMessage = encodeBytes(16, whitelistOp)

    // SignedMessage { payload (field 2), signatureType (field 3) = PRESENT_KEY }
    const signedMsg = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_PRESENT_KEY
    })

    return {
      success: true,
      messageHex: bytesToHex(buildToVCSECMessage(signedMsg))
    }
  }

  // Build whitelist query: asks car if our public key is enrolled.
  // Wire format: ToVCSECMessage > SignedMessage(PRESENT_KEY) > UnsignedMessage(InformationRequest)
  // Car responds: FromVCSECMessage { whitelistEntryInfo (field 17) } if enrolled,
  //               FromVCSECMessage { commandStatus (field 4) } if not enrolled.
  buildWhitelistQueryMessage(publicKeyHex) {
    const publicKeyBytes = hexToBytes(publicKeyHex)

    // InformationRequest { type (field 1) = GET_WHITELIST_ENTRY_INFO(6), publicKey (field 3) = raw bytes }
    // GET_WHITELIST_ENTRY_INFO = 6 — DO NOT CHANGE, verified from vcsec.proto InformationRequestType enum
    // publicKey in InformationRequest is raw bytes, not a PublicKey sub-message
    const infoReq = concat(
      encodeEnum(1, 6),               // GET_WHITELIST_ENTRY_INFO = 6
      encodeBytes(3, publicKeyBytes)  // raw public key bytes (not wrapped in PublicKey message)
    )

    // UnsignedMessage { InformationRequest (field 1) }
    // field 1 = InformationRequest — DO NOT CHANGE TO 4
    const unsignedMessage = encodeBytes(1, infoReq)

    const signedMsg = buildSignedMessage({
      payload: unsignedMessage,
      signatureType: SIGNATURE_TYPE_PRESENT_KEY
    })

    return {
      success: true,
      messageHex: bytesToHex(buildToVCSECMessage(signedMsg))
    }
  }
}

const bleCryptoSession = new BLECryptoSession()

export default bleCryptoSession
export { hexToBytes, bytesToHex }
