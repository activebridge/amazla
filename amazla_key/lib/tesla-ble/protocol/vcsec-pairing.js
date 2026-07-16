
import { encodeBytes, encodeEnum, concat, decodeMessage } from './protobuf.js'
import { parseVehicleStatus } from './vcsec.js'

const SIGNATURE_TYPE_PRESENT_KEY = 2  // Used for pairing (no HMAC needed)
const KEY_ROLE_OWNER = 2  // ROLE_SERVICE=1, ROLE_OWNER=2, ROLE_DRIVER=3
const KEY_FORM_FACTOR_ANDROID_DEVICE = 7  // vcsec.proto KeyFormFactor (sparse enum): NFC_CARD=1, IOS_DEVICE=6, ANDROID_DEVICE=7, CLOUD_KEY=9. Verified against tesla/vehicle-command SDK.
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
// WhitelistOperation_information_E (teslamotors/vehicle-command vcsec.proto).
// Only the codes a watch pairing can realistically hit get friendly text.
const WL_ERRORS = {
  3:  'Key slots full (wl:3) - remove a key in the car',
  4:  'Whitelist full (wl:4) - remove a key in the car',
  5:  'No permission to add (wl:5) - owner must approve',
  6:  'Invalid public key (wl:6)',
  24: 'Denied on car screen (wl:24)',
  25: 'Keycard tap timeout (wl:25) - tap faster',
  27: 'Valet mode active (wl:27)',
  28: 'Cancelled on car (wl:28)',
}
const wlErrorMessage = (code) => WL_ERRORS[code] ?? `WL info:${code}`
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
        return { success: false, status: 'error', error: `Proto fault:${dbg.f12fault}`, dbg }
      }
    }
    if (fields[1] instanceof Uint8Array) {
      dbg.path = 'f1B'
      dbg.f1len = fields[1].length
      const vehicleStatus = parseVehicleStatus(fields[1])
      return { success: true, status: 'pending', type: 'vehicleStatus', vehicleStatus, dbg }
    }
    if (!fields[4] && fields[3] instanceof Uint8Array) {
      dbg.path = 'f3B'
      dbg.f3len = fields[3].length
      const wlStatus = decodeMessage(fields[3])
      const wlInfo = wlStatus[1] !== undefined ? wlStatus[1] : -1
      dbg.wlFault = wlInfo < 0 ? 0 : wlInfo
      if (wlStatus[2] instanceof Uint8Array) dbg.signer = wlStatus[2]
      return { success: true, status: 'pending', message: 'Outer field 3 (not terminal)', dbg }
    }
    if (!fields[4] && typeof fields[1] === 'number') {
      dbg.path = 'f1N'
      dbg.opStatus = fields[1]
      const statusName = OPERATION_STATUS_NAMES[fields[1]] || `Status ${fields[1]}`
      console.log('[VCSEC] ✓ Got operationStatus: ' + statusName)

      if (fields[1] === OPERATIONSTATUS_WAIT) {
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      }
      // operationStatus enum only defines 0/1/2. A value >= 7 is the car responding to
      // our now-ENROLLED key, not a fault: 7 = UNKNOWN_KEY (key-added transition), and
      // 8 was seen on-device 2026-07-14 in the field-16 response right after the key
      // appeared in the vehicle. Treat both as "enrolled" and route to the whitelist
      // verify step (authoritative) rather than hard-failing the pairing.
      if (fields[1] >= OPERATIONSTATUS_UNKNOWN_KEY) {
        console.log('[VCSEC] ✓ operationStatus ' + fields[1] + ' — key enrolled, proceeding to verify')
        dbg.hasSigner = true  // Signal that pairing is complete and key was enrolled
        return { success: true, status: 'ok', message: 'Key enrolled (status ' + fields[1] + ')', dbg }
      }
      if (fields[1] >= 3) {
        return { success: false, status: 'error', error: statusName, dbg }
      }
      return { success: true, status: 'pending', message: statusName, dbg }
    }
    const commandStatusBytes = fields[4]
    if (!commandStatusBytes) {
      dbg.path = 'noF4'
      const availableFields = Object.keys(fields).join(',')
      console.log('[VCSEC] ⚠ No field 4 (CommandStatus). Available fields: ' + availableFields)
      return { success: false, status: 'error', error: 'No command status (field 4)', availableFields, dbg }
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
          console.log('[VCSEC] Pairing completed (auto-approved)')
          return { success: true, status: 'ok', message: 'Key added (auto-approved)', dbg }
        }
        return { success: true, status: 'pending', message: 'Ambient push (not pairing result)', dbg }
      }
      if (wlInfo === 0) {
        console.log('[VCSEC] Pairing completed (manual)')
        return { success: true, status: 'ok', message: 'Key added successfully', dbg }
      }
      // 13 = ATTEMPTING_TO_ADD_KEY_THAT_IS_ALREADY_ON_THE_WHITELIST: the car
      // ALREADY has this key — a previous attempt succeeded but the watch missed
      // the transient success frame (device 2026-07-15: try 1 added the key, the
      // retry got wl:13 and errored the whole pairing). Success-equivalent:
      // proceed to verify + session derive like a normal completion.
      if (wlInfo === 13) {
        console.log('[VCSEC] Key already on whitelist (wl:13) — treating as paired')
        dbg.hasSigner = true
        return { success: true, status: 'ok', message: 'Key already on whitelist', dbg }
      }
      if (wlInfo === 14) return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      return { success: false, status: 'error', error: wlErrorMessage(wlInfo), dbg }
    }
    switch(operationStatus) {
      case OPERATIONSTATUS_OK:
        return { success: true, status: 'pending', message: 'Op status ok (awaiting wl result)', dbg }
      case OPERATIONSTATUS_WAIT:
        return { success: true, status: 'wait', message: 'Tap key card on car', dbg }
      case OPERATIONSTATUS_ERROR:
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
  SIGNATURE_TYPE_PRESENT_KEY,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,
  OPERATIONSTATUS_UNKNOWN_KEY,
  OPERATION_STATUS_NAMES,
  buildKeyMetadata,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,
  parseCommandStatus,
  parsePairingResponse,
}
