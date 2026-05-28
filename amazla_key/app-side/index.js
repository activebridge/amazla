import kpayAppSide from 'kpay-amazfit/app-side'
import { kpayConfig } from '../shared/kpay-config'
import { MessageBuilder } from '../shared/message-side'
import bleCrypto, { binaryStringToBytes, bytesToBinaryString, bytesToHex } from './ble-crypto.js'

const messageBuilder = new MessageBuilder()
const kpay = new kpayAppSide({ ...kpayConfig, messageBuilder })

// Methods whose responses are raw binary (watch requests them with dataType:'bin').
// Envelope: [0x01][payload bytes] on success, [0x00][utf-8 error] on failure.
// Avoids the JSON \uXXXX 2x size blowup that OOM-rebooted the watch on big tables.
const BINARY_METHODS = { BLE_PRECOMPUTE_TABLE: 1, BLE_SYNC_POOL: 1, BLE_COMPLETE_PAIRING: 1 }

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
    console.log('[App] Syncing BLE keys to watch')
    // Return BOTH priv+pub: Tesla protocol uses one long-term keypair for both
    // SessionInfoRequest identity AND ECDH (vehicle-command Go SDK pattern).
    // Watch must hold the private key to derive the session secret locally.
    try {
      const { publicKeyBinary, privateKeyBinary, regenerated } = ensureValidKeypair()
      console.log(regenerated ? '[App] ✓ Regenerated and stored enrolled key pair' : '[App] Sending existing watch keypair to watch')
      return { success: true, publicKeyBinary, privateKeyBinary }
    } catch (e) {
      return { success: false, message: e.message || 'Failed to store keys' }
    }
  },

  BLE_PAIR_SETUP: async () => {
    console.log('[App] BLE_PAIR_SETUP: syncing keys and building pair/verify messages')
    const { publicKeyBinary, privateKeyBinary } = ensureValidKeypair()
    const r = bleCrypto.pairSetup(publicKeyBinary)
    if (!r.success) return r
    return { ...r, watchPrivateKey: privateKeyBinary }
  },

  // No-op success. The pair response's field 17 holds a signer/admin key,
  // not the vehicle's runtime EC pubkey; we used to extract it here and build
  // the doublings table, which silently produced wrong ECDH. The vehicle's
  // real pubkey now comes from SessionInfo on first connect — watch then calls
  // BLE_PRECOMPUTE_TABLE with that key. Matches Tesla Go SDK.
  BLE_COMPLETE_PAIRING: async () => {
    console.log('[App] BLE_COMPLETE_PAIRING: no-op (vehicle pub is fetched from SessionInfo on connect)')
    return okBin()
  },

  // Binary response: [0x01][pool bytes]. Empty payload = already have enough keys.
  BLE_SYNC_POOL: async ({ currentCount = 0 }) => {
    const TARGET = 33
    console.log(`[App] BLE_SYNC_POOL: have ${currentCount}, target ${TARGET}`)
    if (currentCount >= TARGET) return okBin()
    const r = bleCrypto.generateKeyPool(TARGET)
    if (!r.success) return errBin(r.error)
    return okBin(binaryStringToBytes(r.pool))
  },

  // Diagnostic: read stored phone-side priv/pub, derive pub from priv on phone,
  // and return all three as hex strings (ASCII-safe over JSON). Watch compares
  // to its locally-stored values + logs the result. No vehicle needed.
  VERIFY_KEYPAIR: async () => {
    const pubBinStr = settings.settingsStorage.getItem('tesla_public_key')
    const privBinStr = settings.settingsStorage.getItem('tesla_private_key')
    const phonePubHex = pubBinStr ? bytesToHex(binaryStringToBytes(pubBinStr)) : null
    const phonePrivHex = privBinStr ? bytesToHex(binaryStringToBytes(privBinStr)) : null
    let derivedPubHex = null
    let deriveError = null
    if (privBinStr && privBinStr.length === 32) {
      const r = bleCrypto.derivePublicKey(binaryStringToBytes(privBinStr))
      if (r.success) derivedPubHex = bytesToHex(r.pubBytes)
      else deriveError = r.error
    } else {
      deriveError = `priv length wrong: ${privBinStr ? privBinStr.length : 'null'}`
    }
    return {
      success: true,
      phonePubLen: pubBinStr ? pubBinStr.length : null,
      phonePrivLen: privBinStr ? privBinStr.length : null,
      phonePubHex,
      phonePrivHex,
      derivedPubHex,
      deriveError,
      pubMatchesDerived: derivedPubHex && phonePubHex && derivedPubHex === phonePubHex,
    }
  },

  SAVE_VEHICLE_MAC: async ({ mac }) => {
    if (!mac) return { success: false, error: 'mac required' }
    settings.settingsStorage.setItem('vehicleMac', mac)
    settings.settingsStorage.setItem('vehiclePairedAt', String(Date.now()))
    console.log('[App] SAVE_VEHICLE_MAC', mac)
    return { success: true }
  },

  GET_SETTINGS: async () => {
    try {
      const vehicleName = settings.settingsStorage.getItem('vehicleName') || null
      const vehicleVin = settings.settingsStorage.getItem('vehicleVin')
      const vehicleVinBinary = vehicleVin ? bytesToBinaryString(new TextEncoder().encode(vehicleVin)) : null
      console.log('[App] GET_SETTINGS', { vehicleName, vehicleVin })
      return { success: true, vehicleName, vehicleVin: vehicleVinBinary }
    } catch (e) {
      return { success: false, error: e && e.message }
    }
  },

  // Binary response: [0x01][16384-byte table]
  BLE_PRECOMPUTE_TABLE: async ({ vehiclePublicKeyBinary }) => {
    console.log('[App] Building ECDH doublings table for vehicle key')
    const result = bleCrypto.buildDoublingsTable(vehiclePublicKeyBinary)
    if (!result.success) return errBin(result.error)
    return okBin(new Uint8Array(result.buffer))
  },

  SIMULATE_PAIR: async () => {
    console.log('[App] SIMULATE_PAIR: generating fake vehicle pairing data')

    const watchKeypair = bleCrypto.generateEnrolledKeyPair()
    if (!watchKeypair.success) return { success: false, error: 'Watch keypair gen failed' }

    const vehicleKeypair = bleCrypto.generateEnrolledKeyPair()
    if (!vehicleKeypair.success) return { success: false, error: 'Vehicle keypair gen failed' }

    console.log('[App] SIMULATE_PAIR: keypairs generated OK')
    return {
      success: true,
      watchPublicKeyBinary: watchKeypair.publicKeyBinary,
      watchPrivateKeyBinary: watchKeypair.privateKeyBinary,
      vehicleEcKeyBinary: vehicleKeypair.publicKeyBinary,
      mac: 'AA:BB:CC:DD:EE:FF',
      vin: '5YJ3E1EA6JF020598',
    }
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
