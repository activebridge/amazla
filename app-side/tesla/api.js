import { xhr, store } from './utils'
const { setItem, getItem } = store

const URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/'
const EU_URL = 'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/'
const PROXY_URL = 'https://tesla.activebridge.org/api/1/'

const R = {
  get HEADERS() {
    return {
      Authorization: `Bearer ${store.access_token}`,
      'Content-Type': 'application/json',
    }
  },

  get URL() {
    // if (store.eu) return EU_URL
    return PROXY_URL
  }
}

const path = path => `${R.URL}/vehicles/${store.id}/${path}`

const formatTime = time => {
  const h = Math.floor(time / 60)
  const m = time % 60
  return `${h}hrs ${m < 10 ? `0${m}` : m}mins`
}

const saveVehicle = ({
  vehicle_name: name = store.name,
  vehicle_state: {
    locked,
    rt,
    ft,
    df,
    dr,
    pf,
    pr,
    odometer,
  },
  charge_state: {
    battery_level,
    battery_range,
    charge_port_door_open,
    charge_port_latch,
    charger_actual_current,
    charger_power,
    charging_state,
    minutes_to_full_charge,
    charge_limit_soc,
    managed_charging_start_time,
  },
  climate_state: {
    inside_temp,
    outside_temp,
    is_climate_on,
    is_auto_conditioning_on,
    is_front_defroster_on,
    is_preconditioning,
    is_rear_defroster_on,
    seat_heater_rear_center,
    seat_heater_rear_left,
    seat_heater_rear_right,
    seat_heater_left,
    seat_heater_right,
    driver_temp_setting,
    max_avail_temp,
  },
  drive_state: {
    shift_state,
    latitude,
    longitude,
  },
  gui_settings: {
    gui_distance_units,
    gui_temperature_units,
    gui_tirepressure_units,
  },
  vehicle_config: {
    car_type,
    exterior_color,
  },
}) => {
  const isKM = gui_distance_units !== 'mi/hr'
  const tempUnit = gui_temperature_units !== 'F' ? '℃' : '℉'
  const isMaxHeat = max_avail_temp === driver_temp_setting

  const vehicle = {
    name,
    battery_level,
    soc_limit: charge_limit_soc,
    battery_range: Math.floor(battery_range * (isKM ? 1.609344 : 1)),
    locked,
    trunk_open: !!rt,
    frunk_open: !!ft,
    df: !!df,
    dr: !!dr,
    pf: !!pf,
    pr: !!pr,
    online: true,
    odometer: Math.floor(odometer * (isKM ? 1.609344 : 1)),
    unit: isKM ? '㎞' : '㎖',
    isCharging: charging_state === 'Charging',
    isConnected: charging_state !== 'Disconnected',
    remaning: formatTime(minutes_to_full_charge),
    chargeStartAt: managed_charging_start_time,
    shift_state,
    car_type,
    exterior_color,
    charging_state,
    is_climate_on,
    inside_temp,
    outside_temp,
    driver_temp_setting,
    insideTemp: `${inside_temp || '••'}${tempUnit}`,
    outsideTemp: `${outside_temp || '••'}${tempUnit}`,
    climateTemp: `${driver_temp_setting || '••'}${tempUnit}`,
    shrl: seat_heater_rear_left,
    shrc: seat_heater_rear_center,
    shrr: seat_heater_rear_right,
    shl: seat_heater_left,
    shr: seat_heater_right,
    isMaxHeat,
    isChargerOpen: charge_port_door_open,
    isDefrosting: is_front_defroster_on && isMaxHeat,
    color: getItem('custom_color') === 'true' ? getItem('color') : null
  }
  setItem('vehicle', JSON.stringify(vehicle))
  return vehicle
}

const updateVehicle = (key, value) => {
  const vehicle = store.vehicle
  vehicle[key] = value
  store.vehicle = vehicle
}

const vehicles = async () => {
  data = await xhr(R.URL + 'vehicles', 'GET', R.HEADERS)
  const { response: [{ id, display_name }] } = data
  setItem('id', id)
  setItem('name', display_name)
  return data
}

const vehicleData = async () => {
  const { response, status } = await xhr(path('vehicle_data'), 'GET', R.HEADERS)
  response ? saveVehicle(response) : updateVehicle('online', false)
  return response || { status }
}

const doorLock = async () => {
  const { response, status } = await xhr(path('command/door_lock'), 'POST', R.HEADERS)
  if (response) updateVehicle('locked', true)
  return response, { status }
}

const doorUnlock = async () => {
  const { response, status } = await xhr(path('command/door_unlock'), 'POST', R.HEADERS)
  if (response) updateVehicle('locked', false)
  return response || { status }
}

const wakeUp = async () => {
  const { response, status } = await xhr(path('wake_up'), 'POST', R.HEADERS)
  return response || { status }
}

const actuateFrunk = async () => {
  const { response, status } = await xhr(path('command/actuate_trunk'), 'POST', R.HEADERS, { which_trunk: 'front' })
  if (response) updateVehicle('frunk_open', !store.vehicle.frunk_open)
  return response || { status }
}

const actuateTrunk = async () => {
  const { response, status } = await xhr(path('command/actuate_trunk'), 'POST', R.HEADERS, { which_trunk: 'rear' })
  if (response) updateVehicle('trunk_open', !store.vehicle.trunk_open)
  return response || { status }
}

const startConditioning = async () => {
  const { response, status } = await xhr(path('command/auto_conditioning_start'), 'POST', R.HEADERS)
  if (response) updateVehicle('is_climate_on', true)
  return response || { status }
}

const stopConditioning = async () => {
  const { response, status } = await xhr(path('command/auto_conditioning_stop'), 'POST', R.HEADERS)
  if (response) updateVehicle('is_climate_on', false)
  if (response) updateVehicle('isDefrosting', false)
  if (response) updateVehicle('isMaxHeat', false)
  if (response) updateVehicle('shl', 0)
  if (response) updateVehicle('shr', 0)
  return response || { status }
}

const defrost = async () => {
  const { response, status } = await xhr(path('command/set_preconditioning_max'), 'POST', R.HEADERS, { on: true, manual_override: true })
  if (response) updateVehicle('is_climate_on', true)
  if (response) updateVehicle('isDefrosting', true)
  if (response) updateVehicle('isMaxHeat', true)
  if (response) updateVehicle('shl', 3)
  if (response) updateVehicle('shr', 3)
  return response || { status }
}

const undefrost = async () => {
  const { response, status } = await xhr(path('command/set_preconditioning_max'), 'POST', R.HEADERS)
  if (response) updateVehicle('is_climate_on', true)
  if (response) updateVehicle('isDefrosting', false)
  if (response) updateVehicle('isMaxHeat', false)
  return response || { status }
}

const heatSeat = async (seat_postion = 3, seat_cooler_level = 2) => {
  const body = { seat_postion, seat_cooler_level }
  const { response, status } = await xhr(path('command/remote_seat_heater_request'), 'POST', R.HEADERS, body)
  if (response) updateVehicle('shrr', (store.vehicle.shr + 1) % 3)
  return response || { status }
}

const openCharger = async () => {
  const { response, status } = await xhr(path('command/charge_port_door_open'), 'POST', R.HEADERS)
  if (response) updateVehicle('isChargerOpen', true)
  return response || { status }
}

const closeCharger = async () => {
  const { response, status } = await xhr(path('command/charge_port_door_close'), 'POST', R.HEADERS)
  if (response) updateVehicle('isChargerOpen', false)
  return response || { status }
}

const Api = {
  vehicles,
  vehicleData,
  doorLock,
  doorUnlock,
  wakeUp,
  actuateTrunk,
  actuateFrunk,
  startConditioning,
  stopConditioning,
  defrost,
  undefrost,
  heatSeat,
  openCharger,
  closeCharger,
}

export default Api
