import { BaseSideService } from '@zeppos/zml/base-side';
import Auth from '../../app-side/tesla/auth'
import Api from '../../app-side/tesla/api'
import { store } from '../../app-side/tesla/utils'
import bleCrypto, { generatePrivateKey, getPublicKey, bytesToHex } from './ble-crypto.js'

const camalize =  str => {
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
}

const dispatch = async (method, response, params = {}) => {
  const func = actions[method]
  if (func) {
    const result = await func(params)
    response(null, result)
  } else {
    const { status } = await Api[camalize(method)]()
    response(null, { vehicle: store.vehicle, error: status })
  }
}

const actions = {
  VEHICLE_DATA: async() => {
    let { status } = await Api.vehicleData()

    if ([401, 403].includes(status)) await Auth.refreshToken()
    if (status === 408) await Api.wakeUp()
    if (status) ({ status } = await Api.vehicleData())
    return { vehicle: store.vehicle, error: status }
  },

  // BLE Pairing - build message bytes for watch to send
  BLE_PAIR: async (params) => {
    console.log('[BLE] Building pair message for public key')
    return bleCrypto.buildPairMessage(params.publicKeyHex)
  },

  // Generate session key pool for standalone operation
  BLE_GENERATE_SESSION_KEYS: async ({ count = 5 }) => {
    console.log(`[BLE] Generating ${count} session keypairs...`)
    const keys = []
    for (let i = 0; i < count; i++) {
      console.log(`[BLE] Generating key ${i + 1}/${count}...`)
      const privateKey = generatePrivateKey()
      const publicKey = getPublicKey(privateKey)
      keys.push({
        privateKeyHex: bytesToHex(privateKey),
        publicKeyHex: bytesToHex(publicKey)
      })
    }
    console.log(`[BLE] Done generating ${keys.length} keys`)
    return { success: true, keys }
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
      console.log("=====>,", req.method, req.params || '');
      dispatch(req.method, res, req.params || {})
    },

    onRun() {},

    onDestroy() {},
  })
);
