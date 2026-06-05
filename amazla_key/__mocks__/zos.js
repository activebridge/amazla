// Minimal stub for all @zos/* imports used by watch-side modules under test
export class LocalStorage {
  constructor() { this._data = {} }
  getItem(k) { return this._data[k] ?? null }
  setItem(k, v) { this._data[k] = v }
  removeItem(k) { delete this._data[k] }
}

// @zos/i18n stub — echo the msgid back (no .po compilation in tests)
export const getText = (key) => key

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
    this._simulator              = null
    this._connectCb              = null  // mstConnect callback (for disconnect simulation)
    this._prepareCb              = null  // mstOnPrepare handler
    this._descWriteCb            = null  // mstOnDescWriteComplete handler
    this._notifyCb               = null  // mstOnCharaNotification handler
    this._valueCb                = null  // mstOnCharaValueArrived handler
    this._rxBuf                  = null  // inbound chunk reassembly (watch → car)
    this._rxExpected             = 0
    this._scanCb                 = null  // mstStartScan result callback
    this._scanAutoEmit           = null  // when set, mstStartScan fires this device immediately
    this._disconnectDuringPrepare = false // fire connected:2 before prepareCb
    this._failConnect            = false  // fire connected:1 (immediate failure)
    this._blockConnect           = false  // don't call connect callback (for timeout tests)
    this._prepareFails           = false  // fire prepareCb with non-zero status
    this._blockDescWrite         = false  // don't fire descWriteCb (lets CCCD fallback timer run)
  }

  setSimulator(sim) { this._simulator = sim }

  // Production session.js scans by VIN-derived local name on every connect
  // (Tesla rotates the BLE MAC every ~15 min). Tests that exercise
  // requestSessionInfo / ensureSessionEstablished install a fake scan
  // result here so the scan resolves immediately instead of waiting out
  // the scan duration.
  //   harness.setScanAutoEmit({ name: 'sabcdef0123456789c', mac: 'AA:BB:CC:DD:EE:FF' })
  setScanAutoEmit(device) { this._scanAutoEmit = device }

  // ── Called by mst* functions below ────────────────────────────────────────

  // mstConnect: fire "connected" synchronously so tests don't need timer ticks
  connect(macBuffer, callback) {
    this._connectCb = callback
    if (this._blockConnect) return        // caller's timeout fires instead
    if (this._failConnect) {
      this._failConnect = false
      callback({ connected: 1 })          // connected:1 = failed
      return
    }
    callback({ connected: 0, connect_id: 1 })
  }

  // mstBuildProfile: fire prepareCb synchronously, or simulate disconnect/failure during GATT setup.
  // Real ZeppOS mstOn* callbacks receive a single response object — mirror that shape.
  buildProfile() {
    if (this._disconnectDuringPrepare) {
      this._disconnectDuringPrepare = false
      if (this._connectCb) this._connectCb({ connected: 2 })
      return  // don't call prepareCb — vehicle dropped before profile was ready
    }
    if (this._prepareFails) {
      this._prepareFails = false
      if (this._prepareCb) this._prepareCb({ profile: -1, status: 5 })  // non-zero status = GATT failure
      return
    }
    if (this._prepareCb) this._prepareCb({ profile: 1, status: 0 })
  }

  // mstWriteDescriptor (CCCD): fire descWriteCb synchronously (unless _blockDescWrite is set)
  writeDescriptor(profile, uuid, descUUID, _data, _len) {
    if (this._blockDescWrite) return
    if (this._descWriteCb) this._descWriteCb({ profile, chara: uuid, desc: descUUID, status: 0 })
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

  // Called by CarSimulator to push a framed notification to the watch.
  // `via` lets a test pick which event stream the firmware delivers through;
  // real ZeppOS routes some payloads to charaNotification and others to
  // charaValueArrived, so callers exercising terminal-response handling
  // should be able to choose. Default 'notify' matches existing tests.
  notify(framedBytes, via = 'notify') {
    let handler
    if (via === 'value') handler = this._valueCb
    else if (via === 'notify') handler = this._notifyCb
    else handler = this._notifyCb || this._valueCb
    if (!handler) return
    handler({ profile: 1, uuid: TESLA_READ_UUID, data: framedBytes.buffer, length: framedBytes.length })
  }

  // Test helper: simulate car disconnect after connection
  simulateDisconnect() {
    if (this._connectCb) this._connectCb({ connected: 2 })
  }

  // mstStartScan: store the result callback so tests can emit devices
  setScanCb(cb) { this._scanCb = cb }

  // Test helper: push a scan result as if the vehicle was found.
  // The shape must satisfy both ble-native.js (which reads dev_name/dev_addr/rssi
  // directly) AND @silver-zepp/easy-ble's startScan wrapper (which additionally
  // does scan_result.uuid.toString(16), ab2str_stripped(scan_result.vendor_data),
  // and scan_result.service_data_array.map(...) and would crash on missing fields).
  emitScanDevice(name, mac) {
    if (!this._scanCb) return
    const parts = mac.split(':')
    const bytes = new Uint8Array(6)
    parts.forEach((h, i) => { bytes[i] = parseInt(h, 16) })
    this._scanCb({
      dev_name: name,
      dev_addr: bytes.buffer,
      rssi: -60,
      uuid: 0,
      vendor_data: new ArrayBuffer(0),
      service_data_array: [],
    })
  }
}

export const bleHarness = new BLEHarness()

// @zos/ble stubs — delegate to harness (backwards-compatible: all no-op when no simulator set)
export const mstConnect             = (mac, cb)          => bleHarness.connect(mac, cb)
export const mstBuildProfile        = (obj)              => bleHarness.buildProfile()
export const mstWriteDescriptor     = (p, u, d, data, l) => bleHarness.writeDescriptor(p, u, d, data, l)
export const mstWriteCharacteristic = (p, uuid, data, l) => bleHarness.receiveChunk(uuid, data, l)
// easy-ble routes WRITE_WITHOUT_RESPONSE through this separate native fn — must
// alias to the same harness path so session.js's _sendMessage(write_without_response=true)
// reaches the simulator.
export const mstWriteCharacteristicWithoutResponse = (p, uuid, data, l) => bleHarness.receiveChunk(uuid, data, l)
export const mstOnPrepare           = (cb)               => { bleHarness._prepareCb = cb }
export const mstOnCharaNotification = (cb)               => { bleHarness._notifyCb = cb }
export const mstOnCharaValueArrived = (cb)               => { bleHarness._valueCb = cb }
export const mstOnDescWriteComplete = (cb)               => { bleHarness._descWriteCb = cb }
export const mstDisconnect          = ()                 => {}
export const mstDestroyProfileInstance = ()             => {}
export const mstOffAllCb            = ()                 => {
  bleHarness._prepareCb = null
  bleHarness._descWriteCb = null
  bleHarness._notifyCb = null
  bleHarness._valueCb = null
}
export const mstStartScan           = (cb, _opts)        => {
  bleHarness.setScanCb(cb)
  // Auto-emit a fake scan result if a test has registered one (mirrors a
  // Tesla beacon advertising during the production scan-by-name flow).
  const auto = bleHarness._scanAutoEmit
  if (auto && auto.name && auto.mac) {
    setTimeout(() => bleHarness.emitScanDevice(auto.name, auto.mac), 0)
  }
  return true
}
export const mstStopScan            = ()                 => { bleHarness._scanCb = null; return true }

export default {}
