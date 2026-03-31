// Tesla BLE Protocol Constants
// Centralized definitions for both watch and phone-side logic

// Domain types from universal_message.proto
export const DOMAIN_BROADCAST = 0
export const DOMAIN_VEHICLE_SECURITY = 2  // VCSEC
export const DOMAIN_INFOTAINMENT = 3

// Signature types from vcsec.proto
export const SIGNATURE_TYPE_NONE = 0
export const SIGNATURE_TYPE_PRESENT_KEY = 2
export const SIGNATURE_TYPE_HMAC = 5
export const SIGNATURE_TYPE_AES_GCM = 6

// UnsignedMessage sub-message field numbers (from vcsec.proto)
export const UNSIGNED_FIELD_INFO_REQ = 1
export const UNSIGNED_FIELD_RKE_ACTION = 2
export const UNSIGNED_FIELD_CLOSURE_MOVE = 4
export const UNSIGNED_FIELD_WHITELIST_OP = 16

// WhitelistOperation sub-message field numbers (from vcsec.proto)
export const WHITELIST_FIELD_ADD_KEY_AND_PERM = 5
export const WHITELIST_FIELD_ADD_KEY = 6           // Modern firmware pairing
export const WHITELIST_FIELD_METADATA = 6          // Associated metadata
export const WHITELIST_FIELD_REMOVE_ALL_TEMP = 16

// PermissionChange field numbers
export const PERM_FIELD_KEY = 1
export const PERM_FIELD_ROLE = 4

// RKE (Remote Keyless Entry) actions
export const RKE_ACTION_UNLOCK = 0
export const RKE_ACTION_LOCK = 1
export const RKE_ACTION_OPEN_TRUNK = 2
export const RKE_ACTION_OPEN_FRUNK = 3
export const RKE_ACTION_OPEN_CHARGE_PORT = 4
export const RKE_ACTION_CLOSE_CHARGE_PORT = 5

// Key roles (from keys.proto)
export const KEY_ROLE_SERVICE = 1
export const KEY_ROLE_OWNER = 2
export const KEY_ROLE_DRIVER = 3

// Key form factors
export const KEY_FORM_FACTOR_UNKNOWN = 0
export const KEY_FORM_FACTOR_NFC_CARD = 1
export const KEY_FORM_FACTOR_IOS_DEVICE = 6
export const KEY_FORM_FACTOR_ANDROID_DEVICE = 7
export const KEY_FORM_FACTOR_CLOUD_KEY = 9

// Operation status from vcsec.proto
export const OPERATIONSTATUS_OK = 0
export const OPERATIONSTATUS_WAIT = 1
export const OPERATIONSTATUS_ERROR = 2

// Information request types
export const INFO_REQUEST_GET_STATUS = 0
export const INFO_REQUEST_GET_WHITELIST_INFO = 5
export const INFO_REQUEST_GET_WHITELIST_ENTRY_INFO = 6
