import { MessageBuilder } from '../shared/message'
import Auth from './tesla/auth'
import Api from './tesla/api'
import { store } from './tesla/utils'

const messageBuilder = new MessageBuilder()

const dispatch = {
  VEHICLE_DATA: async(ctx) => {
    let { status } = await Api.vehicleData()

    if (status === 401) await Auth.refreshToken()
    if (status === 408) await Api.wakeUp()
    if (status) ({ status } = await Api.vehicleData())

    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  DOOR_UNLOCK: async (ctx) => {
    const { status } = await Api.doorUnlock()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  DOOR_LOCK: async (ctx) => {
    const { status } = await Api.doorLock()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  ACTUATE_TRUNK: async (ctx) => {
    const { status } = await Api.actuateTrunk()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  ACTUATE_FRUNK: async (ctx) => {
    const { status } = await Api.actuateFrunk()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  START_HVAC: async (ctx) => {
    const { status } = await Api.startConditioning()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  STOP_HVAC: async (ctx) => {
    const { status } = await Api.stopConditioning()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  HEAT_SEAT: async (ctx) => {
    const { status } = await Api.heatSeat({})
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  DEFROST: async (ctx) => {
    const { status } = await Api.defrost()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  UNDEFROST: async (ctx) => {
    const { status } = await Api.undefrost()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  OPEN_CHARGER: async (ctx) => {
    const { status } = await Api.openCharger()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
  CLOSE_CHARGER: async (ctx) => {
    const { status } = await Api.closeCharger()
    ctx.response({ data: { vehicle: store.vehicle, error: status } })
  },
}

AppSideService({
  onInit() {
    settings.settingsStorage.setItem('debug', '')
    settings.settingsStorage.addListener('change', async ({ key, newValue, oldValue }) => {
      if (key === 'code' && newValue) {
        await Auth.fetchToken(newValue)
        await Api.vehicles()
      }

      if (key === 'command' && newValue === 'vehicles') {
        await dispatch['VEHICLE_DATA']({response: () => {}})
      }
    })

    messageBuilder.listen(() => { })

    messageBuilder.on('request', (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload)
      dispatch[payload.method](ctx)
    })
  },

  onRun() { },
  onDestroy() { },
});
