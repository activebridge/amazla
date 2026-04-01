import { BaseSideService } from '@zeppos/zml/base-side';
import Auth from '../../app-side/tesla/auth'
import Api from '../../app-side/tesla/api'
import { store } from '../../app-side/tesla/utils'
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
