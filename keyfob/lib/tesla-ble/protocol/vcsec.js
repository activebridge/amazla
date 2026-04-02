// Tesla VCSEC (Vehicle Security) message structures
// Based on tesla-motors/vehicle-command protobuf definitions
// Scope: pairing (key enrollment) only. BLE commands are sent via REST API.

import { encodeBytes, encodeEnum, encodeVarintField, concat, decodeMessage } from './protobuf.js'

// Domain types (universal_message.proto)
const DOMAIN_VEHICLE_SECURITY = 2

// Signature types (vcsec.proto SignatureType enum — DO NOT CHANGE)
const SIGNATURE_TYPE_PRESENT_KEY = 2  // Used for pairing (no HMAC needed)

// Information request types (vcsec.proto InformationRequestType enum — DO NOT CHANGE)
const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6  // Query if specific key is enrolled

// Key roles (keys.proto Role enum — DO NOT CHANGE)
// ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3
const KEY_ROLE_OWNER = 2

// Key form factors (vcsec.proto KeyFormFactor enum — DO NOT CHANGE)
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // Triggers NFC keycard tap UI on car touchscreen

// Operation status (vcsec.proto OperationStatus_E — DO NOT CHANGE)
const OPERATIONSTATUS_OK = 0
const OPERATIONSTATUS_WAIT = 1
const OPERATIONSTATUS_ERROR = 2

// WhitelistOperation error descriptions (vcsec.proto WhitelistOperation_information_E)
function wlErrorMessage(code) {
  switch (code) {
    case 5:  return 'No permission (wl:5) - owner must approve'
    case 6:  return 'Invalid keycard (wl:6) - wrong card?'
    case 25: return 'Keycard tap timeout (wl:25) - tap faster'
    default: return 'WL info:' + code
  }
}

// Build UnsignedMessage (for VCSEC)
// Fields from vcsec.proto (DO NOT CHANGE — verified from vcsec.proto):
//   1: InformationRequest
//   2: RKEAction (enum)  — not used (commands via REST API)
//   4: closureMoveRequest — not used
//   16: WhitelistOperation
function buildUnsignedMessage(options) {
  const parts = []

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
// vcsec.proto SignedMessage has ONLY fields 2 and 3 (verified from Tesla Go SDK).
// Auth data for authenticated commands belongs in RoutableMessage.signature_data,
// NOT here — but commands are sent via REST API so this is not relevant currently.
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

  return concat(...parts)
}

// Build ToVCSECMessage wrapper
// Fields:
//   1: SignedMessage
function buildToVCSECMessage(signedMessage) {
  return encodeBytes(1, signedMessage)
}

// Build PublicKey message
// Fields from vcsec.proto:
//   1: PublicKeyRaw (bytes) - 65 bytes uncompressed public key
function buildPublicKey(publicKeyBytes) {
  return encodeBytes(1, publicKeyBytes)
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
// Fields (from vcsec.proto — DO NOT CHANGE):
//   5: addKeyToWhitelistAndAddPermissions (PermissionChange) - oneof sub_message
//   6: metadataForKey (KeyMetadata)
// NOTE: field 16 = removeAllImpermanentKeys (bool), NOT metadataForKey
function buildWhitelistOperation(publicKeyMsg, keyFormFactor) {
  keyFormFactor = keyFormFactor !== undefined ? keyFormFactor : KEY_FORM_FACTOR_ANDROID_DEVICE
  const permissionChange = buildPermissionChange(publicKeyMsg, KEY_ROLE_OWNER)
  const metadata = buildKeyMetadata(keyFormFactor)

  return concat(
    encodeBytes(5, permissionChange),  // addKeyToWhitelistAndAddPermissions (field 5) — DO NOT CHANGE TO 1
    encodeBytes(6, metadata)           // metadataForKey (field 6) — DO NOT CHANGE TO 16
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

// Generate random UUID (16 bytes)
function generateUUID() {
  const uuid = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    uuid[i] = Math.floor(Math.random() * 256)
  }
  return uuid
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
      // Use -1 sentinel (not 0) when field 1 is absent — field 3 with no inner field 1
      // is an ambient push (e.g. keychainStatus), NOT a WhitelistOperation_status result.
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo
      if (wlStatus[2] instanceof Uint8Array) {
        dbg.signer = wlStatus[2]  // raw KeyIdentifier bytes — presence means an enrolled key approved
      }

      // Field 1 absent — check for signer before treating as ambient
      if (wlInfo === -1) {
        if (dbg.signer) {
          // signerOfOperation present without wlInfo = auto-approval by already-enrolled key
          dbg.wlFault = 0
          dbg.hasSigner = true
          return { success: true, status: 'ok', message: 'Key added (auto-approved)', dbg }
        }
        dbg.path = 'f3B-ambient'
        return { success: true, status: 'pending', message: 'Ambient push (not pairing result)', dbg }
      }
      // NONE (0) = key successfully added
      if (wlInfo === 0) {
        return { success: true, status: 'ok', message: 'Key added', dbg }
      }
      // NOT_ALLOWED_TO_ADD_UNLESS_ON_READER (14) = car waiting for NFC keycard tap
      if (wlInfo === 14) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      return { success: false, status: 'error', error: wlErrorMessage(wlInfo), dbg }
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
      return { success: true, status: 'pending', message: 'Op status ok (awaiting result)', dbg }
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
      // Use -1 sentinel when field 1 absent — ambient push, not a real result
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo
      if (wlStatus[2] instanceof Uint8Array) {
        dbg.signer = wlStatus[2]  // raw KeyIdentifier bytes — presence means an enrolled key approved
      }
      if (wlInfo === -1) {
        if (dbg.signer) {
          // signerOfOperation present without wlInfo = auto-approval by already-enrolled key
          dbg.wlFault = 0
          dbg.hasSigner = true
          return { success: true, status: 'ok', message: 'Key added (auto-approved)', dbg }
        }
        return { success: true, status: 'pending', message: 'Ambient push (not pairing result)', dbg }
      }
      if (wlInfo === 0) {
        return { success: true, status: 'ok', message: 'Key added successfully', dbg }
      }
      if (wlInfo === 14) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      return { success: false, status: 'error', error: wlErrorMessage(wlInfo), dbg }
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

export {
  // Constants
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_PRESENT_KEY,
  INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,

  // Builders
  buildUnsignedMessage,
  buildInformationRequest,
  buildSignedMessage,
  buildToVCSECMessage,
  buildPublicKey,
  buildKeyMetadata,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,

  // Parsers
  parseCommandStatus,
  parsePairingResponse,

  // Utilities
  generateUUID,
}
