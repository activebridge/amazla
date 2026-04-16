import { jest } from '@jest/globals'
jest.useFakeTimers()

// Use harness mock directly (project provides __mocks__/zos.js helpers)
import { bleHarness } from '../__mocks__/zos.js'
import teslaBLENative from '../lib/tesla-ble/ble-native.js'

describe('TeslaBLENative unit tests', () => {
  beforeEach(() => {
    jest.clearAllTimers()
    bleHarness.reset()
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

  test('_handleResponse: duplicate first chunk within 200ms is ignored', () => {
    const cb = jest.fn()
    teslaBLENative.responseCallback = cb
    teslaBLENative._lastResponseData = null
    teslaBLENative._lastResponseTime = 0

    // Send a partial first chunk (total=4 bytes, delivers 2)
    const chunk1 = new Uint8Array([0, 4, 10, 11])
    teslaBLENative._handleResponse(chunk1)
    expect(cb).not.toHaveBeenCalled()  // waiting for rest

    // Reset and send IDENTICAL first chunk synchronously (same sig, same timestamp)
    teslaBLENative._rxBuf = null
    teslaBLENative._rxExpected = 0
    teslaBLENative._handleResponse(chunk1)
    // Duplicate detected — responseCallback NOT called, _rxBuf still null (ignored)
    expect(cb).not.toHaveBeenCalled()
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
