import kpayAppSide from 'kpay-amazfit/app-side'
import { kpayConfig } from '../shared/kpay-config'
import { MessageBuilder } from '../shared/message-side'
import bleCrypto, { bytesToBinaryString, binaryStringToBytes } from './ble-crypto.js'

const messageBuilder = new MessageBuilder()
const kpay = new kpayAppSide({ ...kpayConfig, messageBuilder })

// Methods whose responses are raw binary (watch requests them with dataType:'bin').
// Envelope: [0x01][payload bytes] on success, [0x00][utf-8 error] on failure.
// Avoids the JSON \uXXXX 2x size blowup that OOM-rebooted the watch on big tables.
const BINARY_METHODS = { BLE_COMPUTE_SHARED_SECRET: 1 }

const okBin = (...parts) => Buffer.concat([Buffer.from([1]), ...parts.map((p) => Buffer.from(p))])
const errBin = (msg) => Buffer.concat([Buffer.from([0]), Buffer.from(String(msg || 'error'), 'utf-8')])

// Validate stored keypair: pub must be 65 chars (uncompressed EC), priv 32 chars.
// settingsStorage has historically corrupted binary strings with control bytes
// (saw a 32-byte priv come back as 200+ chars with literal `` sequences);
// when either side is the wrong length the pair is unusable for ECDH and we
// MUST regenerate both — otherwise SessionInfo HMAC verification fails.
// In-memory cache: the keypair the side service is actually using this session.
// Without it, a settingsStorage round-trip corruption between BLE_PAIR_SETUP and
// BLE_COMPUTE_SHARED_SECRET made the validator silently regenerate MID-PAIR:
// ECDH then ran with a private key that no longer matched the pubkey the car had
// just enrolled, so the session key was wrong, SessionInfo HMAC mismatched, and
// pairing failed with the orphaned key left on the car's whitelist (device
// 2026-07-15). The cache guarantees every RPC in one side-service session sees
// ONE keypair; settingsStorage is only best-effort persistence across restarts.
let _keypair = null

const ensureValidKeypair = () => {
  if (_keypair) return _keypair
  const pub = settings.settingsStorage.getItem('tesla_public_key')
  const priv = settings.settingsStorage.getItem('tesla_private_key')
  // Log only LENGTHS, never bytes — the private key unlocks the car, so its hex
  // must never reach the companion console (it can surface in Zepp diagnostics).
  console.log(`[App.diag] keypair lengths: pub=${pub == null ? 'null' : pub.length} priv=${priv == null ? 'null' : priv.length}`)
  if (pub && priv && pub.length === 65 && priv.length === 32) {
    _keypair = { publicKeyBinary: pub, privateKeyBinary: priv, regenerated: false }
    return _keypair
  }
  console.log(`[App] Keypair invalid (pub=${pub ? pub.length : 'null'}, priv=${priv ? priv.length : 'null'}) — regenerating`)
  const fresh = bleCrypto.generateEnrolledKeyPair()
  if (!fresh.success) throw new Error('Keypair regen failed')
  settings.settingsStorage.setItem('tesla_private_key', fresh.privateKeyBinary)
  settings.settingsStorage.setItem('tesla_public_key', fresh.publicKeyBinary)
  // Read-back check, lengths only. Diagnostic: the local copy may read clean even
  // when the persisted copy is mangled, but a mismatch here PROVES the storage
  // layer corrupts this keypair and the next side-service restart needs a re-pair.
  const priv2 = settings.settingsStorage.getItem('tesla_private_key')
  if (priv2 !== fresh.privateKeyBinary) {
    console.log(`[App] KEYPAIR STORAGE CORRUPTED on write (priv wrote 32, read ${priv2 == null ? 'null' : priv2.length}) - using in-memory key this session`)
  }
  _keypair = { publicKeyBinary: fresh.publicKeyBinary, privateKeyBinary: fresh.privateKeyBinary, regenerated: true }
  return _keypair
}

const dispatch = async (method, response, params = {}) => {
  const isBin = !!BINARY_METHODS[method]
  try {
    const func = actions[method]
    if (func) {
      const result = await func(params)
      response(null, result)
      return
    }
    response(null, isBin ? errBin(`Unknown method: ${method}`) : { success: false, error: `Unknown method: ${method}` })
  } catch (e) {
    const msg = (e && e.message) || 'dispatch error'
    response(null, isBin ? errBin(msg) : { success: false, error: msg })
  }
}

const actions = {
  BLE_PAIR_SETUP: async () => {
    console.log('[App] BLE_PAIR_SETUP: syncing key and building pair/verify messages')
    // Returns { success, watchPublicKey, pairMsg, verifyMsg } — no private key
    // crosses BLE; the phone keeps it for ECDH.
    const { publicKeyBinary } = ensureValidKeypair()
    return bleCrypto.pairSetup(publicKeyBinary)
  },

  // Mark the watch as paired (settings page shows "Paired At"). No MAC: Tesla
  // rotates the BLE MAC every ~15 min, so a synced MAC is stale by design — the
  // watch re-finds the car by advertised name (scan-by-name).
  SAVE_PAIRED: async () => {
    settings.settingsStorage.setItem('vehiclePairedAt', String(Date.now()))
    console.log('[App] SAVE_PAIRED')
    return { success: true }
  },

  GET_SETTINGS: async () => {
    try {
      const vehicleName = settings.settingsStorage.getItem('vehicleName') || null
      const vehicleVin = settings.settingsStorage.getItem('vehicleVin')
      const vehicleVinBinary = vehicleVin ? bytesToBinaryString(new TextEncoder().encode(vehicleVin)) : null
      // Auto-unlock pref (toggle) + button action (select). Unset → OFF / 'lockUnlock'.
      const autoUnlock = settings.settingsStorage.getItem('autoUnlock') === '1'
      const buttonAction = settings.settingsStorage.getItem('buttonAction') || 'lockUnlock'
      console.log('[App] GET_SETTINGS', { vehicleName, vehicleVin, autoUnlock, buttonAction })
      return { success: true, vehicleName, vehicleVin: vehicleVinBinary, autoUnlock, buttonAction }
    } catch (e) {
      return { success: false, error: e && e.message }
    }
  },

  // Binary response: [0x01][32-byte ECDH shared secret X]. The phone owns the
  // watch private key (settingsStorage), so it computes watchPriv × vehiclePub
  // here and returns just the secret — the 16 KB doublings table never crosses
  // BLE. Watch derives sessionKey = sha1(secret)[:16] and caches it.
  BLE_COMPUTE_SHARED_SECRET: async ({ vehiclePublicKeyBinary }) => {
    console.log('[App] Computing ECDH shared secret for vehicle key')
    const { privateKeyBinary } = ensureValidKeypair()
    const result = bleCrypto.computeSharedSecret(privateKeyBinary, vehiclePublicKeyBinary)
    if (!result.success) return errBin(result.error)
    return okBin(binaryStringToBytes(result.secret))
  },

  // Full unpair: wipe the tesla enrollment (keypair + pairing state) from the phone's
  // settingsStorage. The watch clears its own localStorage separately. Deliberately KEPT:
  // vehicleVin/vehicleName — user-entered settings that identify the car, not pairing
  // data; wiping them forced re-typing the 17-char VIN after every reset (user, 2026-07-15).
  // The pairing page re-syncs them to the watch, so reset lands on "ready", not "setup".
  // KPAY license keys are also left alone — a reset unpairs, it doesn't un-purchase.
  // (A kpay-wiping "factory reset" variant was tried 2026-07-15 and reverted: re-seeding
  // the account token broke the purchase popup flow.)
  RESET: async () => {
    console.log('[App] RESET: clearing tesla enrollment (VIN kept)')
    _keypair = null // drop the in-memory keypair — next pair must regenerate
    const keys = ['tesla_public_key', 'tesla_private_key', 'vehicleMac', 'vehiclePairedAt']
    for (let i = 0; i < keys.length; i++) settings.settingsStorage.removeItem(keys[i])
    return { success: true }
  },

}

AppSideService({
  onInit() {
    settings.settingsStorage.setItem('debug', '')
    settings.settingsStorage.addListener('change', () => {})

    kpay.init()
    messageBuilder.listen(() => {})
    messageBuilder.on('request', (ctx) => {
      const jsonRpc = messageBuilder.buf2Json(ctx.request.payload)
      if (kpay.onRequest(jsonRpc)) return
      dispatch(jsonRpc.method, (_err, data) => ctx.response({ data }), jsonRpc.params || {})
    })
  },
  onRun() {},
  onDestroy() {
    kpay.destroy()
  },
})
