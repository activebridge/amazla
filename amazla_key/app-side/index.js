import { BaseSideService } from '@zeppos/zml/base-side'
import bleCrypto, { bytesToBinaryString } from './ble-crypto.js'

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
  // Return existing enrolled keypair, or generate and store one if missing.
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

  // BLE Pairing - build message bytes for watch to send
  BLE_PAIR: async (params) => {
    return bleCrypto.buildPairMessage(params.publicKeyBinary)
  },

  // Verify pairing: query whitelist entry to get vehicle EC key
  BLE_VERIFY_PAIR: async (params) => {
    console.log('[App] Building whitelist query message for verification')
    return bleCrypto.buildWhitelistQueryMessage(params.publicKeyBinary)
  },

  // Sync key pool: watch sends current count, phone returns a full replacement pool if below target.
  // All logic lives here — watch just stores whatever comes back.
  BLE_SYNC_POOL: async ({ currentCount = 0 }) => {
    const TARGET = 33
    console.log(`[App] BLE_SYNC_POOL: have ${currentCount}, target ${TARGET}`)
    if (currentCount >= TARGET) return { success: true, pool: null }
    return bleCrypto.generateKeyPool(TARGET)
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

  // Precompute doublings table for watch-side fixed-base ECDH.
  // Called once after pairing; watch stores result as binary for fast cold-start ECDH.
  BLE_PRECOMPUTE_TABLE: async ({ vehiclePublicKeyBinary }) => {
    console.log('[App] Building ECDH doublings table for vehicle key')
    const result = bleCrypto.buildDoublingsTable(vehiclePublicKeyBinary)
    if (!result.success) return result
    const bytes = new Uint8Array(result.buffer)
    return { success: true, table: bytesToBinaryString(bytes) }
  },

  // Simulates a full pairing flow with a generated vehicle key — no car needed.
  // All computation is real (P-256 keypairs, doublings table, key pool).
  // Watch stores the result identically to a real pairing so session establishment works.
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

AppSideService(
  BaseSideService({
    onInit() {
      settings.settingsStorage.setItem('debug', '')
      settings.settingsStorage.addListener('change', async ({ key, newValue, oldValue }) => {})
    },

    onRequest(req, res) {
      dispatch(req.method, res, req.params || {})
    },

    onRun() {},

    onDestroy() {},
  }),
)
