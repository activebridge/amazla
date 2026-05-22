import { jest } from '@jest/globals'
jest.useFakeTimers()

// Use harness mock directly (project provides __mocks__/zos.js helpers)
import { bleHarness } from '../__mocks__/zos.js'
import teslaBLENative, { CONNECTION_CONFIG } from '../lib/tesla-ble/ble-native.js'

describe('TeslaBLENative unit tests', () => {
  beforeEach(() => {
    jest.clearAllTimers()
    bleHarness.reset()
    // Production code wraps mstBuildProfile in a 50ms setTimeout (mirrors easy-ble
    // SHORT_DELAY); tests with jest.useFakeTimers() would have to advance manually.
    // Force synchronous build to keep the existing test flow.
    CONNECTION_CONFIG.prepareDelayMs = 0
  })

  test('scan emits found and complete events with proper MAC formatting', () => {
    const events = []
    teslaBLENative.scan((ev) => events.push(ev), 10)

    // Emit a matching device
    bleHarness.emitScanDevice('S0123456789abcdefC', 'AA:BB:CC:DD:EE:FF')

    // Fast-forward timers to trigger completion
    jest.advanceTimersByTime(10 + 500 + 1)

    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[0].type).toBe('found')
    expect(events[0].device.mac).toBe('AA:BB:CC:DD:EE:FF')
    expect(events[1].type).toBe('complete')
  })

  test('connect succeeds and returns mac', (done) => {
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(true)
        expect(res.mac).toBe('AA:BB:CC:DD:EE:FF')
        done()
      } catch (e) { done(e) }
    })
  })

  test('send framed message (single write) reaches simulator', () => {
    // Attach a simple simulator to observe received payload
    const sim = { onReceive: jest.fn() }
    bleHarness.setSimulator(sim)

    teslaBLENative.connected = true
    teslaBLENative._profile = 1

    // Build a framed message: 2-byte length + payload (3 bytes)
    const payload = new Uint8Array([10, 11, 12])
    const framed = new Uint8Array(2 + payload.length)
    framed[0] = 0
    framed[1] = payload.length
    framed.set(payload, 2)

    teslaBLENative._sendMessage(framed)

    // Since mstWriteCharacteristic is synchronous through harness, simulator should be called
    expect(sim.onReceive).toHaveBeenCalled()
    const received = sim.onReceive.mock.calls[0][0]
    expect(Array.from(received)).toEqual(Array.from(payload))
  })

  test('send framed message (chunked) is paced and delivered', () => {
    const sim = { onReceive: jest.fn() }
    bleHarness.setSimulator(sim)

    teslaBLENative.connected = true
    teslaBLENative._profile = 1

    // Large payload > 20 bytes to force chunking
    const payload = new Uint8Array(50).map((_, i) => i & 0xff)
    const framed = new Uint8Array(2 + payload.length)
    framed[0] = (payload.length >> 8) & 0xff
    framed[1] = payload.length & 0xff
    framed.set(payload, 2)

    teslaBLENative._sendMessage(framed)

    // Advance timers to allow scheduled chunk writes (20ms per chunk)
    const chunks = Math.ceil(framed.length / 20)
    jest.advanceTimersByTime(chunks * 20 + 10)

    expect(sim.onReceive).toHaveBeenCalled()
    const received = sim.onReceive.mock.calls[0][0]
    expect(Array.from(received)).toEqual(Array.from(payload))
  })

  test('_handleResponse short first chunk triggers error', () => {
    const cb = jest.fn()
    teslaBLENative.responseCallback = cb
    teslaBLENative._handleResponse(new Uint8Array([0]))
    expect(cb).toHaveBeenCalled()
    expect(cb.mock.calls[0][0].success).toBe(false)
    expect(cb.mock.calls[0][0].error).toBe('Response too short')
  })

  test('_handleResponse reassembles multi-chunk payload', () => {
    const cb = jest.fn()
    teslaBLENative.responseCallback = cb

    // First chunk: length=4, first byte payload=10
    teslaBLENative._handleResponse(new Uint8Array([0, 4, 10]))
    // Second chunk: remaining bytes
    teslaBLENative._handleResponse(new Uint8Array([11, 12, 13]))

    expect(cb).toHaveBeenCalled()
    const res = cb.mock.calls[0][0]
    expect(res.success).toBe(true)
    const data = res.data
    expect(Array.from(data)).toEqual([10, 11, 12, 13])
  })

  test('_handleResponse stale buffer reset after >1s gap between chunks', () => {
    const cb = jest.fn()
    teslaBLENative.responseCallback = cb

    const origNow = Date.now
    const t0 = Date.now()
    Date.now = () => t0

    // First chunk: expects 4 bytes, delivers 2
    teslaBLENative._handleResponse(new Uint8Array([0, 4, 10, 11]))
    expect(cb).not.toHaveBeenCalled()

    // Simulate >1s gap before continuation
    Date.now = () => t0 + 1500

    // Second chunk arrives after stale threshold — buffer reset, callback NOT fired
    teslaBLENative._handleResponse(new Uint8Array([12, 13]))
    expect(cb).not.toHaveBeenCalled()

    Date.now = origNow
  })

  test('send._requeue: BLE layer re-registers callback for multi-response commands', () => {
    teslaBLENative.connected = true
    teslaBLENative._profile = 1

    const cb = jest.fn()
    const origSendMsg = teslaBLENative._sendMessage.bind(teslaBLENative)
    teslaBLENative._sendMessage = () => {}  // suppress actual write

    teslaBLENative.send(new Uint8Array([1, 2, 3]), cb)
    expect(teslaBLENative.responseCallback).toBeTruthy()

    // First response: intermediate ack with _requeue
    teslaBLENative.responseCallback({ success: true, _requeue: true })

    // User callback NOT called yet; responseCallback re-registered
    expect(cb).not.toHaveBeenCalled()
    expect(teslaBLENative.responseCallback).toBeTruthy()

    // Second response: final result
    teslaBLENative.responseCallback({ success: true, data: new Uint8Array([9]) })

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].success).toBe(true)
    expect(teslaBLENative.responseCallback).toBeNull()

    teslaBLENative._sendMessage = origSendMsg
  })

  test('send fails immediately when not connected', () => {
    teslaBLENative.connected = false
    const cb = jest.fn()
    teslaBLENative.send(new Uint8Array([1]), cb)
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not connected' })
  })

  test('sendAndWaitForResponse fails immediately when not connected', () => {
    teslaBLENative.connected = false
    const cb = jest.fn()
    teslaBLENative.sendAndWaitForResponse(new Uint8Array([1]), cb, 500)
    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Not connected' })
  })

  test('sendAndWaitForResponse fires timeout callback when no response arrives', () => {
    teslaBLENative.connected = true
    teslaBLENative._profile = 1
    teslaBLENative._sendMessage = () => {}

    const origSetTimeout = global.setTimeout
    let capturedFn = null
    global.setTimeout = (fn) => { capturedFn = fn; return 'timer' }

    const cb = jest.fn()
    teslaBLENative.sendAndWaitForResponse(new Uint8Array([1]), cb, 500)

    expect(capturedFn).not.toBeNull()
    capturedFn()  // fire timeout

    expect(cb).toHaveBeenCalledWith({ success: false, error: 'Response timeout' })
    expect(teslaBLENative.responseCallback).toBeNull()

    global.setTimeout = origSetTimeout
    teslaBLENative._sendMessage = teslaBLENative._sendMessage  // no-op restore (already patched)
  })

  // ── connect() edge cases ───────────────────────────────────────────────────

  test('connect: connected:1 (immediate failure) → callback with success:false', (done) => {
    teslaBLENative.reset()
    bleHarness._failConnect = true
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(false)
        expect(res.error).toMatch(/connection failed/i)
        done()
      } catch (e) { done(e) }
    })
  })

  test('connect: GATT profile prepare failed → callback with success:false', (done) => {
    teslaBLENative.reset()
    bleHarness._prepareFails = true
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(false)
        expect(res.error).toMatch(/GATT profile failed/i)
        done()
      } catch (e) { done(e) }
    })
  })

  test('connect: connection timeout fires after timeoutMs → success:false', (done) => {
    teslaBLENative.reset()
    bleHarness._blockConnect = true  // mstConnect never calls back
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(false)
        expect(res.error).toMatch(/connection timeout/i)
        done()
      } catch (e) { done(e) }
    })
    jest.advanceTimersByTime(5001)  // first timeout = 5000ms
  })

  test('connect: duplicate connected:0 callback is ignored after setup starts', (done) => {
    teslaBLENative.reset()
    let callCount = 0
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      callCount++
      if (callCount === 1) {
        // First (real) callback — fire connected:0 again to simulate duplicate
        bleHarness._connectCb({ connected: 0, connect_id: 1 })
        // settle should have already been called; second call is silently ignored
        setTimeout(() => {
          try {
            expect(callCount).toBe(1)  // no second invocation
            done()
          } catch (e) { done(e) }
        }, 10)
        jest.advanceTimersByTime(10)
      }
    })
  })

  test('connect: onDisconnect handler fires after established connection drops', (done) => {
    teslaBLENative.reset()
    let disconnectFired = false
    teslaBLENative.onDisconnect = () => { disconnectFired = true }
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      if (!res.success) { done(new Error('connect failed')); return }
      // Connection established — simulate post-connect disconnect event
      bleHarness.simulateDisconnect()
      try {
        expect(disconnectFired).toBe(true)
        done()
      } catch (e) { done(e) }
    })
  })

  test('getMAC returns mac after successful connect', (done) => {
    teslaBLENative.reset()
    expect(teslaBLENative.getMAC()).toBeNull()
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(true)
        expect(teslaBLENative.getMAC()).toBe('AA:BB:CC:DD:EE:FF')
        done()
      } catch (e) { done(e) }
    })
  })

  test('mstBuildProfile is wrapped in prepareDelayMs setTimeout', (done) => {
    // Regression: easy-ble inserts a SHORT_DELAY between mstOnPrepare registration
    // and mstBuildProfile because some firmware fires the prepare event before the
    // handler is fully wired. If that delay is removed, real-device pair can lose
    // the prepare callback. Verify the timer-deferred path runs.
    teslaBLENative.reset()
    CONNECTION_CONFIG.prepareDelayMs = 50
    let connectResolved = false
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      connectResolved = true
      try { expect(res.success).toBe(true); done() } catch (e) { done(e) }
    })
    // Before the 50ms timer fires, prepare must not have been called yet.
    expect(connectResolved).toBe(false)
    jest.advanceTimersByTime(60)
    CONNECTION_CONFIG.prepareDelayMs = 0
  })

  test('payload delivered via mstOnCharaValueArrived still reaches _handleResponse', (done) => {
    // Regression: ble-native must subscribe BOTH mstOnCharaNotification AND
    // mstOnCharaValueArrived. ZeppOS firmware can route the terminal post-NFC
    // pair response through value-arrived rather than notification. If only one
    // stream is subscribed the pair flow loops on ambient pending pushes forever.
    teslaBLENative.reset()
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (connRes) => {
      if (!connRes.success) { done(new Error('connect failed')); return }
      teslaBLENative.responseCallback = (r) => {
        try { expect(r.success).toBe(true); expect(Array.from(r.data)).toEqual([42]); done() } catch (e) { done(e) }
      }
      const payload = new Uint8Array([0, 1, 42])
      bleHarness.notify(payload, 'value')  // ONLY via value-arrived, not notification
    })
  })

  test('duplicate first chunk arriving via both streams within 200ms is deduped', (done) => {
    teslaBLENative.reset()
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (connRes) => {
      if (!connRes.success) { done(new Error('connect failed')); return }
      let calls = 0
      teslaBLENative.responseCallback = () => { calls++ }
      const payload = new Uint8Array([0, 1, 42])
      bleHarness.notify(payload, 'notify')
      bleHarness.notify(payload, 'value')  // same payload, second delivery — must be ignored
      setTimeout(() => {
        try { expect(calls).toBe(1); done() } catch (e) { done(e) }
      }, 10)
      jest.advanceTimersByTime(10)
    })
  })

  test('notification with mismatched profile id still routed to _handleResponse', (done) => {
    // Regression: ble-native must filter notifications by UUID alone, not by profile id.
    // Some ZeppOS firmware reports a different `profile` value in mstOnCharaNotification
    // than the one passed to mstOnPrepare — filtering by id silently drops all responses.
    teslaBLENative.reset()
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (connRes) => {
      if (!connRes.success) { done(new Error('connect failed')); return }
      const cb = jest.fn()
      teslaBLENative.responseCallback = (r) => { cb(r); try { expect(r.success).toBe(true); done() } catch (e) { done(e) } }

      // Notification arrives with profile=999 even though prepare reported profile=1.
      const TESLA_READ_UUID = '00000213-b2d1-43f0-9b88-960cebf8b91e'
      const payload = new Uint8Array([0, 1, 42]) // length=1, byte=42
      bleHarness._notifyCb({ profile: 999, uuid: TESLA_READ_UUID, data: payload.buffer, length: payload.length })
    })
  })

  test('CCCD fallback timer fires after 4000ms and settles connection as success', (done) => {
    // _blockDescWrite prevents mstOnDescWriteComplete from firing.
    // After 4000ms the fallback timer (ble-native.js lines 241-242) settles with success.
    teslaBLENative.reset()
    bleHarness._blockDescWrite = true
    teslaBLENative.connect('AA:BB:CC:DD:EE:FF', (res) => {
      try {
        expect(res.success).toBe(true)
        expect(res.mac).toBe('AA:BB:CC:DD:EE:FF')
        done()
      } catch (e) { done(e) }
    })
    jest.advanceTimersByTime(4001)
  })

  test('waitForNextResponse: response before timeout fires callback and clears timer', () => {
    const cb = jest.fn()
    teslaBLENative.waitForNextResponse(5000, cb)

    // Fire a response synchronously — should clear the 5000ms timer and call cb
    const result = { success: true, data: new Uint8Array([42]) }
    teslaBLENative.responseCallback(result)

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(result)

    // Advance past the original timeout — cb must NOT be called again
    jest.advanceTimersByTime(5001)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
