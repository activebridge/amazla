import { MessageBuilder } from '../shared/message-side'
import { kpayConfig } from '../shared/kpay-config'
import kpayAppSide from 'kpay-amazfit/app-side'
import bleCrypto, { binaryStringToBytes, bytesToBinaryString } from './ble-crypto.js'

const messageBuilder = new MessageBuilder()
const kpay = new kpayAppSide({ ...kpayConfig, messageBuilder })

const dispatch = async (method, response, params = {}) => {
  try {
    const func = actions[method]
    if (func) {
      const result = await func(params)
      response(null, result)
      return
    }
    response(null, { success: false, error: `Unknown method: ${method}` })
  } catch (e) {
    response(null, { success: false, error: (e && e.message) || 'dispatch error' })
  }
}

const actions = {
  BLE_SYNC_KEYS: async () => {
    console.log('[App] Syncing BLE keys to watch')
    const stored = settings.settingsStorage.getItem('tesla_public_key')
    if (stored) {
      console.log('[App] Sending existing watch public key to watch')
      return { success: true, publicKeyBinary: stored }
    }
    console.log('[App] No keys found, generating new pair')
    const result = bleCrypto.generateEnrolledKeyPair()
    if (!result.success) return result
    try {
      settings.settingsStorage.setItem('tesla_private_key', result.privateKeyBinary)
      settings.settingsStorage.setItem('tesla_public_key', result.publicKeyBinary)
      console.log('[App] ✓ Stored enrolled key pair')
      return { success: true, publicKeyBinary: result.publicKeyBinary }
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
    return bleCrypto.pairSetup(publicKeyBinary)
  },

  BLE_COMPLETE_PAIRING: async ({ rawResponse }) => {
    console.log('[App] BLE_COMPLETE_PAIRING: parsing verify response and computing table')
    const rawBytes = binaryStringToBytes(rawResponse)
    return bleCrypto.completePairing(rawBytes)
  },

  BLE_SYNC_POOL: async ({ currentCount = 0 }) => {
    const TARGET = 33
    console.log(`[App] BLE_SYNC_POOL: have ${currentCount}, target ${TARGET}`)
    if (currentCount >= TARGET) return { success: true, pool: null }
    return bleCrypto.generateKeyPool(TARGET)
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

  BLE_PRECOMPUTE_TABLE: async ({ vehiclePublicKeyBinary }) => {
    console.log('[App] Building ECDH doublings table for vehicle key')
    const result = bleCrypto.buildDoublingsTable(vehiclePublicKeyBinary)
    if (!result.success) return result
    const bytes = new Uint8Array(result.buffer)
    return { success: true, table: bytesToBinaryString(bytes) }
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
