// Minimal stub for all @zos/* imports used by watch-side modules under test
export class LocalStorage {
  constructor() { this._data = {} }
  getItem(k) { return this._data[k] ?? null }
  setItem(k, v) { this._data[k] = v }
  removeItem(k) { delete this._data[k] }
}

// @zos/fs stub — stateful in-memory store so tests can verify round-trips
export const _fsStore = {}
export const writeFileSync = ({ path, data }) => { _fsStore[path] = data }
export const readFileSync  = ({ path }) => _fsStore[path] ?? null
export const rmSync        = ({ path }) => { delete _fsStore[path] }

// ─────────────────────────────────────────────────────────────────────────────
// BLEHarness: stateful @zos/ble stub for VCR-style car simulation.
//
// Existing tests that stub teslaBLE.send directly never reach mstWriteCharacteristic,
// so this harness is fully backwards-compatible with all prior tests.
//
// Usage in tests:
//   import { bleHarness } from '../__mocks__/zos.js'
//   bleHarness.reset()
//   bleHarness.setSimulator(new CarSimulator())
// ─────────────────────────────────────────────────────────────────────────────

const TESLA_WRITE_UUID_UC = '00000212-B2D1-43F0-9B88-960CEBF8B91E'
const TESLA_READ_UUID     = '00000213-b2d1-43f0-9b88-960cebf8b91e'

class BLEHarness {
  constructor() { this.reset() }

  reset() {
    this._simulator   = null
    this._connectCb   = null  // mstConnect callback (for disconnect simulation)
    this._prepareCb   = null  // mstOnPrepare handler
    this._descWriteCb = null  // mstOnDescWriteComplete handler
    this._notifyCb    = null  // mstOnCharaNotification handler
    this._valueCb     = null  // mstOnCharaValueArrived handler
    this._rxBuf       = null  // inbound chunk reassembly (watch → car)
    this._rxExpected  = 0
  }

  setSimulator(sim) { this._simulator = sim }

  // ── Called by mst* functions below ────────────────────────────────────────

  // mstConnect: fire "connected" synchronously so tests don't need timer ticks
  connect(macBuffer, callback) {
    this._connectCb = callback
    callback({ connected: 0, connect_id: 1 })
  }

  // mstBuildProfile: fire prepareCb synchronously
  buildProfile() {
    if (this._prepareCb) this._prepareCb(1, 0)
  }

  // mstWriteDescriptor (CCCD): fire descWriteCb synchronously
  writeDescriptor(profile, uuid, descUUID, data, len) {
    if (this._descWriteCb) this._descWriteCb(profile, uuid, descUUID, 0)
  }

  // mstWriteCharacteristic: reassemble framed chunks from watch, then hand to simulator
  receiveChunk(uuid, data, len) {
    if (!uuid || uuid.toUpperCase() !== TESLA_WRITE_UUID_UC) return
    // data is ArrayBuffer from ble-native _sendChunk — wrap as Uint8Array
    const chunk = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer, 0, len)
    if (this._rxBuf === null) {
      // First chunk carries 2-byte length prefix (same framing as ble-native._frame)
      if (chunk.length < 2) return
      this._rxExpected = (chunk[0] << 8) | chunk[1]
      this._rxBuf = chunk.slice(2)
    } else {
      const combined = new Uint8Array(this._rxBuf.length + chunk.length)
      combined.set(this._rxBuf)
      combined.set(chunk, this._rxBuf.length)
      this._rxBuf = combined
    }
    if (this._rxBuf.length >= this._rxExpected) {
      const payload = this._rxBuf.slice(0, this._rxExpected)
      this._rxBuf = null
      this._rxExpected = 0
      if (this._simulator) this._simulator.onReceive(payload, this)
    }
  }

  // Called by CarSimulator to push a framed notification to the watch
  notify(framedBytes) {
    const handler = this._notifyCb || this._valueCb
    if (!handler) return
    // ble-native._handleResponse expects (data) where new Uint8Array(data) works
    handler(1, TESLA_READ_UUID, framedBytes.buffer, framedBytes.length)
  }

  // Test helper: simulate car disconnect after connection
  simulateDisconnect() {
    if (this._connectCb) this._connectCb({ connected: 2 })
  }
}

export const bleHarness = new BLEHarness()

// @zos/ble stubs — delegate to harness (backwards-compatible: all no-op when no simulator set)
export const mstConnect             = (mac, cb)          => bleHarness.connect(mac, cb)
export const mstBuildProfile        = (obj)              => bleHarness.buildProfile()
export const mstWriteDescriptor     = (p, u, d, data, l) => bleHarness.writeDescriptor(p, u, d, data, l)
export const mstWriteCharacteristic = (p, uuid, data, l) => bleHarness.receiveChunk(uuid, data, l)
export const mstSetMTU              = (mtu, cb)          => cb && cb({ mtu })
export const mstOnPrepare           = (cb)               => { bleHarness._prepareCb = cb }
export const mstOnCharaNotification = (cb)               => { bleHarness._notifyCb = cb }
export const mstOnCharaValueArrived = (cb)               => { bleHarness._valueCb = cb }
export const mstOnDescWriteComplete = (cb)               => { bleHarness._descWriteCb = cb }
export const mstDisconnect          = ()                 => {}
export const mstDestroyProfileInstance = ()             => {}
export const mstStartScan           = ()                 => true
export const mstStopScan            = ()                 => true

export default {}
