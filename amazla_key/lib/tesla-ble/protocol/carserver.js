// Car-server (infotainment domain) command payloads.
//
// These are the plaintext protobufs that get AES-GCM-encrypted into the
// RoutableMessage payload (see infotainment.js). Field numbers from the Tesla
// vehicle-command SDK car_server.proto:
//   Action        { vehicleAction = 2 }
//   VehicleAction { getVehicleData = 1, hvacAutoAction = 10,
//                   chargePortDoorClose = 61, chargePortDoorOpen = 62 }
//   GetVehicleData { getChargeState = 2, getClimateState = 3 }
//   ChargePortDoorOpen {}  (empty — presence selects the action)

import { decodeMessage, encodeBytes } from './protobuf.js'

const EMPTY = new Uint8Array(0)

// Wrap a VehicleAction protobuf in an Action message (field 2).
const buildAction = (vehicleAction) => encodeBytes(2, vehicleAction)

// Charge port open/close: VehicleAction.chargePortDoorOpen(62)/Close(61), empty body.
const buildChargePortOpenAction = () => buildAction(encodeBytes(62, EMPTY))
const buildChargePortCloseAction = () => buildAction(encodeBytes(61, EMPTY))

// Start/stop charging: VehicleAction.chargingStartStopAction(6) → ChargingStartStopAction
// charging_action oneof { start(2), stop(5) } = Void. Field numbers per car_server.proto.
const buildChargeStartAction = () => buildAction(encodeBytes(6, encodeBytes(2, EMPTY)))
const buildChargeStopAction = () => buildAction(encodeBytes(6, encodeBytes(5, EMPTY)))

// Read charge state: VehicleAction.getVehicleData(1) → GetVehicleData.getChargeState(2).
const buildGetChargeStateAction = () => buildAction(encodeBytes(1, encodeBytes(2, EMPTY)))

// HvacAutoAction { power_on(1 bool) } → VehicleAction.hvacAutoAction(10). Climate on/off.
const buildHvacAutoAction = (powerOn) => {
  const hvac = powerOn ? new Uint8Array([0x08, 0x01]) : new Uint8Array([0x08, 0x00]) // field 1 varint = bool
  return buildAction(encodeBytes(10, hvac))
}

// IEEE-754 float32, little-endian (protobuf fixed32 / wire type 5). QuickJS has
// no guaranteed DataView ergonomics in this path, so decode the bits by hand.
const decodeFloat32LE = (b) => {
  const bits = ((b[3] << 24) | (b[2] << 16) | (b[1] << 8) | b[0]) >>> 0
  const sign = bits >>> 31 ? -1 : 1
  const exp = (bits >>> 23) & 0xff
  const frac = bits & 0x7fffff
  if (exp === 0) return sign * frac * 2 ** -149 // subnormal / zero
  if (exp === 0xff) return frac ? NaN : sign * Infinity
  return sign * (1 + frac * 2 ** -23) * 2 ** (exp - 127)
}

// ChargeState.charging_state (field 1) is a ChargingState message whose oneof
// member's FIELD NUMBER is the state (each member is an empty Void). So we read
// which field is present, not a value.
const CHARGING_STATE_NAMES = {
  1: 'Unknown',
  2: 'Disconnected',
  3: 'NoPower',
  4: 'Starting',
  5: 'Charging',
  6: 'Complete',
  7: 'Stopped',
  8: 'Calibrating',
}

// Parse a car-server Response (the PLAINTEXT bytes in RoutableMessage field 10 —
// we don't request FLAG_ENCRYPT_RESPONSE, so the reply isn't GCM-encrypted) for
// the charge snapshot. Path: Response{1 actionStatus, 2 vehicleData}
// → VehicleData{3 charge_state} → ChargeState{1 charging_state, 104 charge_limit_soc
// (int32), 111 battery_range (float32), 114 battery_level (int32), 123
// minutes_to_full_charge (int32)}. Field numbers verified against Tesla
// vehicle-command vehicle.proto. Returns { ok, level, range, limit, minsToFull,
// state }; ok is false (caller logs raw) if the shape doesn't match or it errored.
const parseChargeStateResponse = (responseBytes) => {
  try {
    const resp = decodeMessage(responseBytes)
    // actionStatus.result (field 1) — OPERATIONSTATUS_E: 0=OK, 1=ERROR. Absent/0 = OK.
    if (resp[1] instanceof Uint8Array) {
      const status = decodeMessage(resp[1])
      if (status[1]) return { ok: false, error: 'vehicle reported ERROR' }
    }
    if (!(resp[2] instanceof Uint8Array)) return { ok: false, error: 'no vehicleData' }
    const vd = decodeMessage(resp[2])
    if (!(vd[3] instanceof Uint8Array)) return { ok: false, error: 'no charge_state' }
    const cs = decodeMessage(vd[3])

    const level = typeof cs[114] === 'number' ? cs[114] : null
    const limit = typeof cs[104] === 'number' ? cs[104] : null // charge_limit_soc, %
    const minsToFull = typeof cs[123] === 'number' ? cs[123] : null // minutes_to_full_charge
    const range = cs[111] instanceof Uint8Array && cs[111].length === 4 ? decodeFloat32LE(cs[111]) : null
    let state = null
    if (cs[1] instanceof Uint8Array) {
      const memberField = Object.keys(decodeMessage(cs[1]))[0] // the oneof member set
      state = CHARGING_STATE_NAMES[memberField] || null
    }
    return { ok: true, level, range, limit, minsToFull, state }
  } catch (e) {
    return { ok: false, error: e && e.message }
  }
}

export {
  buildAction,
  buildChargePortOpenAction,
  buildChargePortCloseAction,
  buildChargeStartAction,
  buildChargeStopAction,
  buildGetChargeStateAction,
  buildHvacAutoAction,
  decodeFloat32LE,
  parseChargeStateResponse,
}
