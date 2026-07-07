import kpayAppSide from 'kpay-amazfit/app-side'
import { kpayConfig } from '../shared/kpay-config'
import { MessageBuilder } from '../shared/message-side'
import bleCrypto, { bytesToBinaryString, binaryStringToBytes } from './ble-crypto.js'

const messageBuilder = new MessageBuilder()
const kpay = new kpayAppSide({ ...kpayConfig, messageBuilder })

// Methods whose responses are raw binary (watch requests them with dataType:'bin').
// Envelope: [0x01][payload bytes] on success, [0x00][utf-8 error] on failure.
// Avoids the JSON \uXXXX 2x size blowup that OOM-rebooted the watch on big tables.
const BINARY_METHODS = { BLE_COMPUTE_SHARED_SECRET: 1, BLE_COMPLETE_PAIRING: 1 }

const okBin = (...parts) => Buffer.concat([Buffer.from([1]), ...parts.map((p) => Buffer.from(p))])
const errBin = (msg) => Buffer.concat([Buffer.from([0]), Buffer.from(String(msg || 'error'), 'utf-8')])

// Validate stored keypair: pub must be 65 chars (uncompressed EC), priv 32 chars.
// settingsStorage has historically corrupted binary strings with control bytes
// (saw a 32-byte priv come back as 200+ chars with literal `` sequences);
// when either side is the wrong length the pair is unusable for ECDH and we
// MUST regenerate both — otherwise SessionInfo HMAC verification fails.
const _binStrHex = (s) => {
  if (s == null) return '<null>'
  let h = ''
  for (let i = 0; i < s.length; i++) h += (s.charCodeAt(i) & 0xff).toString(16).padStart(2, '0')
  return h
}

const ensureValidKeypair = () => {
  const pub = settings.settingsStorage.getItem('tesla_public_key')
  const priv = settings.settingsStorage.getItem('tesla_private_key')
  console.log(`[App.diag] tesla_public_key:  len=${pub == null ? 'null' : pub.length} hex=${_binStrHex(pub)}`)
  console.log(`[App.diag] tesla_private_key: len=${priv == null ? 'null' : priv.length} hex=${_binStrHex(priv)}`)
  if (pub && priv && pub.length === 65 && priv.length === 32) {
    return { publicKeyBinary: pub, privateKeyBinary: priv, regenerated: false }
  }
  console.log(`[App] Keypair invalid (pub=${pub ? pub.length : 'null'}, priv=${priv ? priv.length : 'null'}) — regenerating`)
  const fresh = bleCrypto.generateEnrolledKeyPair()
  if (!fresh.success) throw new Error('Keypair regen failed')
  settings.settingsStorage.setItem('tesla_private_key', fresh.privateKeyBinary)
  settings.settingsStorage.setItem('tesla_public_key', fresh.publicKeyBinary)
  return { publicKeyBinary: fresh.publicKeyBinary, privateKeyBinary: fresh.privateKeyBinary, regenerated: true }
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
  BLE_SYNC_KEYS: async () => {
    console.log('[App] Syncing BLE public key to watch')
    // Send only the PUBLIC key: it's the SessionInfoRequest identity. The ECDH
    // runs here on the phone (BLE_COMPUTE_SHARED_SECRET), so the private key never
    // leaves the companion — the watch has no use for it (no BigInt in QuickJS).
    try {
      const { publicKeyBinary, regenerated } = ensureValidKeypair()
      console.log(regenerated ? '[App] ✓ Regenerated and stored enrolled key pair' : '[App] Sending existing watch public key to watch')
      return { success: true, publicKeyBinary }
    } catch (e) {
      return { success: false, message: e.message || 'Failed to store keys' }
    }
  },

  BLE_PAIR_SETUP: async () => {
    console.log('[App] BLE_PAIR_SETUP: syncing key and building pair/verify messages')
    // Returns { success, watchPublicKey, pairMsg, verifyMsg } — no private key
    // crosses BLE; the phone keeps it for ECDH.
    const { publicKeyBinary } = ensureValidKeypair()
    return bleCrypto.pairSetup(publicKeyBinary)
  },

  // No-op success. The pair response's field 17 holds a signer/admin key,
  // not the vehicle's runtime EC pubkey; we used to extract it here and build
  // the doublings table, which silently produced wrong ECDH. The vehicle's
  // real pubkey now comes from SessionInfo on first connect — watch then calls
  // BLE_COMPUTE_SHARED_SECRET with that key. Matches Tesla Go SDK.
  BLE_COMPLETE_PAIRING: async () => {
    console.log('[App] BLE_COMPLETE_PAIRING: no-op (vehicle pub is fetched from SessionInfo on connect)')
    return okBin()
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
      // User prefs (settings page toggles). Unset = OFF for both.
      const autoUnlock = settings.settingsStorage.getItem('autoUnlock') === '1'
      const autoLock = settings.settingsStorage.getItem('autoLock') === '1'
      console.log('[App] GET_SETTINGS', { vehicleName, vehicleVin, autoUnlock, autoLock })
      return { success: true, vehicleName, vehicleVin: vehicleVinBinary, autoUnlock, autoLock }
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

  // Full unpair: wipe the tesla enrollment/vehicle data from the phone's settingsStorage
  // (keypair + vehicle identity). The watch clears its own localStorage separately. KPAY
  // license keys are intentionally left alone — a reset unpairs, it doesn't un-purchase.
  RESET: async () => {
    console.log('[App] RESET: clearing tesla settings')
    const keys = ['tesla_public_key', 'tesla_private_key', 'vehicleMac', 'vehiclePairedAt', 'vehicleName', 'vehicleVin']
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
