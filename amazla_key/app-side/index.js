import { BaseSideService } from '@zeppos/zml/base-side';
import { store } from '../../app-side/tesla/utils'
import TeslaSession from '../../app-side/tesla/session'
import bleCrypto, { bytesToBinaryString } from './ble-crypto.js'

const camalize =  str => {
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
}

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
    response(null, { success: false, error: e && e.message || 'dispatch error' })
  }
}

const actions = {
  // Sync (or generate) watch's public key from phone storage to watch
  // Called on app startup to ensure watch has the correct enrolled key
  // If key doesn't exist, generate and store it first
  BLE_SYNC_KEYS: async (params) => {
    const forceNew = params?.forceNew === true
    console.log('[App] Syncing BLE keys to watch' + (forceNew ? ' (force new)' : ''))
    
    if (forceNew) {
      // Force generation of fresh key pair
      console.log('[App] Generating fresh key pair for re-pairing')
      const result = bleCrypto.generateEnrolledKeyPair()
      if (result.success) {
        try {
          TeslaSession.setKeys(result.privateKeyBinary, result.publicKeyBinary)
          console.log('[App] ✓ Stored fresh enrolled key pair')
          return { success: true, publicKeyBinary: result.publicKeyBinary }
        } catch (storeError) {
          console.log('[App] Failed to store fresh key: ' + storeError.message)
          return { success: false, message: 'Failed to store keys' }
        }
      }
      return result
    }
    
    try {
      const pubKey = TeslaSession.getPublicKey()
      console.log('[App] Sending existing watch public key to watch')
      return { success: true, publicKeyBinary: bytesToBinaryString(pubKey) }
    } catch (error) {
      // No keys yet - generate and store them
      console.log('[App] No keys found, generating new pair: ' + error.message)
      const result = bleCrypto.generateEnrolledKeyPair()
      if (result.success) {
        try {
          TeslaSession.setKeys(result.privateKeyBinary, result.publicKeyBinary)
          console.log('[App] ✓ Stored new enrolled key pair')
          return { success: true, publicKeyBinary: result.publicKeyBinary }
        } catch (storeError) {
          console.log('[App] Failed to store keys: ' + storeError.message)
          return { success: false, message: 'Failed to store keys' }
        }
      }
      return result
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

  // Generate ephemeral P-256 keypair pool for watch passive entry.
  // Returns { success, pool } where pool is a hex string (194 hex chars/key: 64 priv + 130 pub).
  BLE_GENERATE_SESSION_KEYS: async ({ count = 5 }) => {
    console.log('[App] Generating key pool, count:', count)
    const result = bleCrypto.generateKeyPool(count)
    console.log('[App] Key pool generated, success:', result.success, 'pool length:', result.pool?.length)
    return result
  },

  // Sync key pool: watch sends current count, phone returns a full replacement pool if below target.
  // All logic lives here — watch just stores whatever comes back.
  BLE_SYNC_POOL: async ({ currentCount = 0 }) => {
    const TARGET = 33
    console.log(`[App] BLE_SYNC_POOL: have ${currentCount}, target ${TARGET}`)
    if (currentCount >= TARGET) return { success: true, pool: null }
    return bleCrypto.generateKeyPool(TARGET)
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
      vehicleEcKeyBinary:   vehicleKeypair.publicKeyBinary,
      mac:                  'AA:BB:CC:DD:EE:FF',
      vin:                  '5YJ3E1EA6JF020598',
    }
  },

}

AppSideService(
  BaseSideService({
    onInit() {
      settings.settingsStorage.setItem('debug', '')
      settings.settingsStorage.addListener('change', async ({ key, newValue, oldValue }) => {
      })
    },

    onRequest(req, res) {
      dispatch(req.method, res, req.params || {})
    },

    onRun() {},

    onDestroy() {},
  })
);
