import { BaseSideService } from '@zeppos/zml/base-side';
import Auth from '../../app-side/tesla/auth'
import Api from '../../app-side/tesla/api'
import { store } from '../../app-side/tesla/utils'
import TeslaSession from '../../app-side/tesla/session'
import bleCrypto from './ble-crypto.js'

const camalize =  str => {
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
}

const dispatch = async (method, response, params = {}) => {
  try {
    const func = actions[method]
    if (func) {
      const result = await func(params)
      response(null, result)
    } else {
      const { status } = await Api[camalize(method)]()
      response(null, { vehicle: store.vehicle, error: status })
    }
  } catch (e) {
    response(null, { success: false, error: e && e.message || 'dispatch error' })
  }
}

const actions = {
  // Sync (or generate) watch's public key from phone storage to watch
  // Called on app startup to ensure watch has the correct enrolled key
  // If key doesn't exist, generate and store it first
  BLE_SYNC_KEYS: async () => {
    console.log('[App] Syncing BLE keys to watch')
    try {
      const pubKey = TeslaSession.getPublicKey()
      const pubKeyHex = Array.from(pubKey, x => x.toString(16).padStart(2, '0')).join('')
      console.log('[App] Sending watch public key to watch: ' + pubKeyHex.slice(0, 16) + '...')
      return { success: true, publicKeyHex: pubKeyHex }
    } catch (error) {
      // No keys yet - generate and store them
      console.log('[App] No keys found, generating new pair: ' + error.message)
      const result = bleCrypto.generateEnrolledKeyPair()
      if (result.success) {
        try {
          TeslaSession.setKeys(result.privateKeyHex, result.publicKeyHex)
          console.log('[App] ✓ Stored new enrolled key pair')
          return { success: true, publicKeyHex: result.publicKeyHex }
        } catch (storeError) {
          console.log('[App] Failed to store keys: ' + storeError.message)
          return { success: false, message: 'Failed to store keys' }
        }
      }
      return result
    }
  },

  VEHICLE_DATA: async() => {
    let { status } = await Api.vehicleData()

    if ([401, 403].includes(status)) await Auth.refreshToken()
    if (status === 408) await Api.wakeUp()
    if (status) ({ status } = await Api.vehicleData())
    return { vehicle: store.vehicle, error: status }
  },

  // BLE Pairing - build message bytes for watch to send
  BLE_PAIR: async (params) => {
    return bleCrypto.buildPairMessage(params.publicKeyHex)
  },

  // Generate ephemeral P-256 keypair pool for watch passive entry.
  // Returns { success, pool } where pool is base64 flat binary (97 bytes/key).
  BLE_GENERATE_SESSION_KEYS: async ({ count = 5 }) => {
    console.log('[App] Generating key pool, count:', count)
    const result = bleCrypto.generateKeyPool(count)
    console.log('[App] Key pool generated, success:', result.success, 'pool length:', result.pool?.length)
    return result
  },

  // Precompute doublings table for watch-side fixed-base ECDH.
  // Called once after pairing; result stored on watch for fast cold-start ECDH.
  BLE_PRECOMPUTE_TABLE: async ({ vehiclePublicKeyHex }) => {
    console.log('[App] Building ECDH doublings table for vehicle key')
    return bleCrypto.buildDoublingsTable(vehiclePublicKeyHex)
  },

  // Verify pairing: query car's VCSEC whitelist for our public key.
  // Car responds: FromVCSECMessage { whitelistEntryInfo } if enrolled,
  //              FromVCSECMessage { commandStatus { ERROR } } if not.
  BLE_VERIFY_PAIR: async ({ publicKeyHex }) => {
    return bleCrypto.buildWhitelistQueryMessage(publicKeyHex)
  },

}

AppSideService(
  BaseSideService({
    onInit() {
      settings.settingsStorage.setItem('debug', '')
      settings.settingsStorage.addListener('change', async ({ key, newValue, oldValue }) => {
        if (key === 'code' && newValue) {
          await Auth.fetchToken(newValue)
          await Api.vehicles()
        }

        if (key === 'command' && newValue === 'vehicles') {
          await dispatch('VEHICLE_DATA', () => {})
        }
      })
    },

    onRequest(req, res) {
      dispatch(req.method, res, req.params || {})
    },

    onRun() {},

    onDestroy() {},
  })
);
