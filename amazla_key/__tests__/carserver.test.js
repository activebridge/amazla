import {
  buildChargePortOpenAction,
  buildChargePortCloseAction,
  buildGetChargeStateAction,
  buildHvacAutoAction,
} from '../lib/tesla-ble/protocol/carserver.js'
import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'

// Action { vehicleAction(2) }; VehicleAction { getVehicleData(1), hvacAutoAction(10),
// chargePortDoorClose(61), chargePortDoorOpen(62) }.
const vehicleAction = (actionBytes) => decodeMessage(decodeMessage(actionBytes)[2])

describe('carserver action payloads', () => {
  test('ChargePortOpen selects VehicleAction.chargePortDoorOpen(62)', () => {
    const va = vehicleAction(buildChargePortOpenAction())
    expect(62 in va).toBe(true)
    expect(61 in va).toBe(false)
  })

  test('ChargePortClose selects VehicleAction.chargePortDoorClose(61)', () => {
    const va = vehicleAction(buildChargePortCloseAction())
    expect(61 in va).toBe(true)
    expect(62 in va).toBe(false)
  })

  test('GetChargeState → VehicleAction.getVehicleData(1) → GetVehicleData.getChargeState(2)', () => {
    const va = vehicleAction(buildGetChargeStateAction())
    expect(1 in va).toBe(true)
    const getVehicleData = decodeMessage(va[1])
    expect(2 in getVehicleData).toBe(true) // getChargeState
  })

  test('HvacAutoAction(true) → VehicleAction.hvacAutoAction(10) with power_on=1', () => {
    const va = vehicleAction(buildHvacAutoAction(true))
    expect(10 in va).toBe(true)
    const hvac = decodeMessage(va[10])
    expect(hvac[1]).toBe(1) // power_on varint true
  })
})
