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

import { encodeBytes, decodeMessage } from './protobuf.js'

const EMPTY = new Uint8Array(0)

// Wrap a VehicleAction protobuf in an Action message (field 2).
const buildAction = (vehicleAction) => encodeBytes(2, vehicleAction)

// Charge port open/close: VehicleAction.chargePortDoorOpen(62)/Close(61), empty body.
const buildChargePortOpenAction = () => buildAction(encodeBytes(62, EMPTY))
const buildChargePortCloseAction = () => buildAction(encodeBytes(61, EMPTY))

// Read charge state: VehicleAction.getVehicleData(1) → GetVehicleData.getChargeState(2).
const buildGetChargeStateAction = () => buildAction(encodeBytes(1, encodeBytes(2, EMPTY)))

// HvacAutoAction { power_on(1 bool) } → VehicleAction.hvacAutoAction(10). Climate on/off.
const buildHvacAutoAction = (powerOn) => {
  const hvac = powerOn ? new Uint8Array([0x08, 0x01]) : new Uint8Array([0x08, 0x00]) // field 1 varint = bool
  return buildAction(encodeBytes(10, hvac))
}

// Parse a decrypted car-server Response far enough to pull the charge state's
// battery_level. The full Response/VehicleData schema is large; we walk only the
// path we need and return null if the shape doesn't match (caller logs raw bytes).
const parseBatteryLevel = (responseBytes) => {
  try {
    // Response { actionStatus(1), vehicleData(... )} — field layout varies by FW; the
    // ChargeState.battery_level is a float/int we locate by walking GetVehicleData →
    // ChargeState. This is best-effort until validated against a real car capture.
    const top = decodeMessage(responseBytes)
    // Placeholder: real field path wired once we have a captured response to decode.
    return top && Object.keys(top).length ? { raw: responseBytes, fields: Object.keys(top) } : null
  } catch (_e) {
    return null
  }
}

export {
  buildAction,
  buildChargePortOpenAction,
  buildChargePortCloseAction,
  buildGetChargeStateAction,
  buildHvacAutoAction,
  parseBatteryLevel,
}
