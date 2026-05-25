import kpayAppSide from 'kpay-amazfit/app-side'
import { kpayConfig } from '../shared/kpay-config'
import { MessageBuilder } from '../shared/message-side'
import bleCrypto, { binaryStringToBytes, bytesToBinaryString } from './ble-crypto.js'

const messageBuilder = new MessageBuilder()
const kpay = new kpayAppSide({ ...kpayConfig, messageBuilder })

// Methods whose responses are raw binary (watch requests them with dataType:'bin').
// Envelope: [0x01][payload bytes] on success, [0x00][utf-8 error] on failure.
// Avoids the JSON \uXXXX 2x size blowup that OOM-rebooted the watch on big tables.
const BINARY_METHODS = { BLE_PRECOMPUTE_TABLE: 1, BLE_SYNC_POOL: 1, BLE_COMPLETE_PAIRING: 1 }

const okBin = (...parts) => Buffer.concat([Buffer.from([1]), ...parts.map((p) => Buffer.from(p))])
const errBin = (msg) => Buffer.concat([Buffer.from([0]), Buffer.from(String(msg || 'error'), 'utf-8')])

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
    const storedPub = settings.settingsStorage.getItem('tesla_public_key')
    const storedPriv = settings.settingsStorage.getItem('tesla_private_key')
    if (storedPub && storedPriv) {
      console.log('[App] Sending existing watch keypair to watch')
      return { success: true, publicKeyBinary: storedPub, privateKeyBinary: storedPriv }
    }
    console.log('[App] No keys found, generating new pair')
    const result = bleCrypto.generateEnrolledKeyPair()
    if (!result.success) return result
    try {
      settings.settingsStorage.setItem('tesla_private_key', result.privateKeyBinary)
      settings.settingsStorage.setItem('tesla_public_key', result.publicKeyBinary)
      console.log('[App] ✓ Stored enrolled key pair')
      return {
        success: true,
        publicKeyBinary: result.publicKeyBinary,
        privateKeyBinary: result.privateKeyBinary,
      }
    } catch (storeError) {
      console.log(`[App] Failed to store keys: ${storeError.message}`)
      return { success: false, message: 'Failed to store keys' }
    }
  },

  BLE_PAIR_SETUP: async () => {
    console.log('[App] BLE_PAIR_SETUP: syncing keys and building pair/verify messages')
    const stored = settings.settingsStorage.getItem('tesla_public_key')
    if (!stored) {
      const keypair = bleCrypto.generateEnrolledKeyPair()
      if (!keypair.success) return keypair
      settings.settingsStorage.setItem('tesla_private_key', keypair.privateKeyBinary)
      settings.settingsStorage.setItem('tesla_public_key', keypair.publicKeyBinary)
    }
    const publicKeyBinary = settings.settingsStorage.getItem('tesla_public_key')
    const privateKeyBinary = settings.settingsStorage.getItem('tesla_private_key')
    const r = bleCrypto.pairSetup(publicKeyBinary)
    if (!r.success) return r
    return { ...r, watchPrivateKey: privateKeyBinary }
  },

  // Binary response: [0x01][65-byte ecKey][16384-byte table]
  BLE_COMPLETE_PAIRING: async ({ rawResponse }) => {
    console.log('[App] BLE_COMPLETE_PAIRING: parsing verify response and computing table')
    const r = bleCrypto.completePairing(binaryStringToBytes(rawResponse))
    if (!r.success) return errBin(r.error)
    return okBin(binaryStringToBytes(r.ecKey), binaryStringToBytes(r.table))
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
