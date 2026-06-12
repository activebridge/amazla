import {
  buildChargePortOpenAction,
  buildChargePortCloseAction,
  buildGetChargeStateAction,
  buildHvacAutoAction,
  decodeFloat32LE,
  parseChargeStateResponse,
} from '../lib/tesla-ble/protocol/carserver.js'
import { decodeMessage, encodeBytes, encodeVarintField } from '../lib/tesla-ble/protocol/protobuf.js'

// Action { vehicleAction(2) }; VehicleAction { getVehicleData(1), hvacAutoAction(10),
// chargePortDoorClose(61), chargePortDoorOpen(62) }.
const vehicleAction = (actionBytes) => decodeMessage(decodeMessage(actionBytes)[2])

const float32LE = (v) => { const b = new Uint8Array(4); const dv = new DataView(b.buffer); dv.setFloat32(0, v, true); return b }

// Build a plaintext carserver Response carrying a ChargeState — the shape the car
// returns in RoutableMessage field 10 for GetChargeState (FLAG_ENCRYPT_RESPONSE
// unset, so it's not GCM-encrypted). Response{2 vehicleData}→VehicleData{3
// charge_state}→ChargeState{1 charging_state, 111 battery_range f32, 114 level i32}.
const concat = (...parts) => parts.reduce((a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r }, new Uint8Array(0))
const buildChargeResponse = ({ level, range, chargingStateField, errorStatus } = {}) => {
  let cs = new Uint8Array(0)
  // charging_state(1) = ChargingState message; its oneof member's field number is the state
  if (chargingStateField != null) cs = concat(cs, encodeBytes(1, encodeBytes(chargingStateField, new Uint8Array(0))))
  if (range != null) cs = concat(cs, new Uint8Array([0xfd, 0x06]), float32LE(range)) // field 111 (111*8+5=893 → fd 06), wire type 5
  if (level != null) cs = concat(cs, encodeVarintField(114, level))
  const vehicleData = encodeBytes(3, cs)               // VehicleData.charge_state(3)
  let resp = encodeBytes(2, vehicleData)               // Response.vehicleData(2)
  if (errorStatus) resp = concat(encodeBytes(1, encodeVarintField(1, 1)), resp) // actionStatus.result=ERROR
  return resp
}

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

describe('decodeFloat32LE', () => {
  test('round-trips against DataView for a range value', () => {
    expect(decodeFloat32LE(float32LE(198.5))).toBeCloseTo(198.5, 3)
    expect(decodeFloat32LE(float32LE(0))).toBe(0)
    expect(decodeFloat32LE(float32LE(12.34))).toBeCloseTo(12.34, 2)
  })
})

describe('parseChargeStateResponse', () => {
  test('decodes battery_level, battery_range, and charging_state', () => {
    const bytes = buildChargeResponse({ level: 70, range: 198.5, chargingStateField: 2 })
    const r = parseChargeStateResponse(bytes)
    expect(r.ok).toBe(true)
    expect(r.level).toBe(70)
    expect(r.range).toBeCloseTo(198.5, 2)
    expect(r.state).toBe('Disconnected')
  })

  test('maps each ChargingState oneof member to its name', () => {
    const names = { 1: 'Unknown', 2: 'Disconnected', 3: 'NoPower', 4: 'Starting', 5: 'Charging', 6: 'Complete', 7: 'Stopped', 8: 'Calibrating' }
    for (const field in names) {
      const r = parseChargeStateResponse(buildChargeResponse({ level: 50, chargingStateField: Number(field) }))
      expect(r.state).toBe(names[field])
    }
  })

  test('missing optional fields decode as null, not a throw', () => {
    const r = parseChargeStateResponse(buildChargeResponse({ level: 42 })) // no range, no charging_state
    expect(r.ok).toBe(true)
    expect(r.level).toBe(42)
    expect(r.range).toBeNull()
    expect(r.state).toBeNull()
  })

  test('actionStatus ERROR → ok:false', () => {
    const r = parseChargeStateResponse(buildChargeResponse({ level: 70, errorStatus: true }))
    expect(r.ok).toBe(false)
  })

  test('no vehicleData → ok:false (not a throw)', () => {
    const r = parseChargeStateResponse(new Uint8Array(0))
    expect(r.ok).toBe(false)
  })

  test('garbage bytes → ok:false (not a throw)', () => {
    const r = parseChargeStateResponse(new Uint8Array([0xff, 0xff, 0xff]))
    expect(r.ok).toBe(false)
  })
})
