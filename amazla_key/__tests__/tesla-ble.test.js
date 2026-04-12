import teslaBLE, { TESLA_WRITE_UUID } from '../lib/tesla-ble/ble.js'

function framePayload(payloadBytes) {
  const len = payloadBytes.length
  const msg = new Uint8Array(2 + len)
  msg[0] = (len >> 8) & 0xff
  msg[1] = len & 0xff
  msg.set(payloadBytes, 2)
  return msg
}

describe('TeslaBLE _handleResponse and send requeue behavior', () => {
  test('reassembles single-chunk response and calls responseCallback with data', () => {
    const payload = new Uint8Array([0x01,0x02,0x03,0x04])
    const frame = framePayload(payload)

    const cb = function() { cb.calls.push(Array.from(arguments)) }
    cb.calls = []
    teslaBLE.responseCallback = cb

    // Deliver the complete frame in one notification
    teslaBLE._handleResponse(frame, frame.length)

    expect(cb.calls.length).toBe(1)
    const arg = cb.calls[0][0]
    expect(arg.success).toBe(true)
    expect(Array.from(arg.data)).toEqual(Array.from(payload))
    // responseCallback cleared after delivery
    expect(teslaBLE.responseCallback).toBeNull()
  })

  test('send wrapped callback supports _requeue (multi-response) and forwards final response', () => {
    // Patch _sendMessage to avoid real BLE writes
    const origSendMsg = teslaBLE._sendMessage
    teslaBLE._sendMessage = function() { /* no-op */ }

    const userCb = function() { userCb.calls.push(Array.from(arguments)) }
    userCb.calls = []
    const dummyData = new Uint8Array([0x00])

    // Ensure BLE reported as connected so send proceeds
    const prevConnected = teslaBLE.connected
    teslaBLE.connected = true
    // Call send - this should set responseCallback to the wrappedCallback
    teslaBLE.send(dummyData, userCb)
    expect(teslaBLE.responseCallback).toBeTruthy()

    // Simulate first response that requests requeue
    teslaBLE.responseCallback({ success: true, _requeue: true })

    // User callback must NOT have been called yet
    expect(userCb.calls.length).toBe(0)

    // Simulate second, final response
    const finalPayload = new Uint8Array([0x09, 0x08])
    teslaBLE.responseCallback({ success: true, data: finalPayload })

    // Now user callback should have been invoked with final response
    expect(userCb.calls.length).toBe(1)
    const result = userCb.calls[0][0]
    expect(result.success).toBe(true)
    expect(Array.from(result.data)).toEqual(Array.from(finalPayload))

    // Restore
    teslaBLE._sendMessage = origSendMsg
    teslaBLE.connected = prevConnected
  })
})


describe('TeslaBLE reassembly and timeout edge cases', () => {
  test('reassembles multi-chunk response across two notifications', () => {
    const payload = new Uint8Array([1,2,3,4,5,6,7,8])
    const totalLen = payload.length
    const firstChunkLen = 3
    const firstFrame = new Uint8Array(2 + firstChunkLen)
    firstFrame[0] = (totalLen >> 8) & 0xff
    firstFrame[1] = totalLen & 0xff
    firstFrame.set(payload.slice(0, firstChunkLen), 2)

    const secondChunk = payload.slice(firstChunkLen)

    const cb = function() { cb.calls.push(Array.from(arguments)) }
    cb.calls = []
    teslaBLE.responseCallback = cb

    // Send first (partial) notification
    teslaBLE._handleResponse(firstFrame, firstFrame.length)
    // No callback yet
    expect(cb.calls.length).toBe(0)

    // Send remaining bytes as continuation
    teslaBLE._handleResponse(secondChunk, secondChunk.length)

    // Now should have one callback with full payload
    expect(cb.calls.length).toBe(1)
    const arg = cb.calls[0][0]
    expect(arg.success).toBe(true)
    expect(Array.from(arg.data)).toEqual(Array.from(payload))
  })

  test('ignores duplicate first chunk delivered within 200ms', () => {
    // Construct a first chunk that indicates a larger total length (partial first chunk)
    const totalLen = 8
    const firstChunkLen = 3
    const firstFrame = new Uint8Array(2 + firstChunkLen)
    firstFrame[0] = (totalLen >> 8) & 0xff
    firstFrame[1] = totalLen & 0xff
    firstFrame.set(new Uint8Array([9,9,9]), 2)

    const cb = function() { cb.calls.push(Array.from(arguments)) }
    cb.calls = []
    teslaBLE.responseCallback = cb

    // Deliver the same first-chunk twice quickly
    teslaBLE._handleResponse(firstFrame, firstFrame.length)
    teslaBLE._handleResponse(firstFrame, firstFrame.length)

    // No callback yet (waiting for completion), and duplicate was ignored
    expect(cb.calls.length).toBe(0)
  })

  test('stale reassembly buffer reset on long gap between chunks', () => {
    const payload = new Uint8Array([1,2,3,4,5])
    const firstChunkLen = 2
    const firstFrame = new Uint8Array(2 + firstChunkLen)
    firstFrame[0] = (payload.length >> 8) & 0xff
    firstFrame[1] = payload.length & 0xff
    firstFrame.set(payload.slice(0, firstChunkLen), 2)
    const secondChunk = payload.slice(firstChunkLen)

    const cb = function() { cb.calls.push(Array.from(arguments)) }
    cb.calls = []
    teslaBLE.responseCallback = cb

    // Stub Date.now to simulate large gap
    const origNow = Date.now
    const t0 = origNow()
    Date.now = () => t0
    teslaBLE._handleResponse(firstFrame, firstFrame.length)
    // Advance time beyond stale threshold
    Date.now = () => t0 + 2000
    // Now send continuation; handler should detect stale buffer and reset
    teslaBLE._handleResponse(secondChunk, secondChunk.length)

    // No callback because reassembly was reset
    expect(cb.calls.length).toBe(0)

    // Restore Date.now
    Date.now = origNow
  })

  test('sendAndWaitForResponse triggers timeout path when no response', () => {
    const prevConnected = teslaBLE.connected
    teslaBLE.connected = true
    const origSendMsg = teslaBLE._sendMessage
    teslaBLE._sendMessage = function() { /* no-op */ }

    // Capture timer callback
    const origSetTimeout = global.setTimeout
    let captured = null
    global.setTimeout = function(fn, ms) { captured = fn; return 't' }

    let cbCalled = null
    teslaBLE.sendAndWaitForResponse(new Uint8Array([0x00]), (res) => { cbCalled = res }, 500)

    expect(captured).not.toBeNull()
    // Simulate timer firing
    captured()

    expect(cbCalled && cbCalled.success).toBe(false)
    expect(cbCalled && cbCalled.error).toMatch(/Response timeout/)

    // Restore
    teslaBLE._sendMessage = origSendMsg
    teslaBLE.connected = prevConnected
    global.setTimeout = origSetTimeout
  })

  test('waitForNextResponse triggers NFC tap timeout path', () => {
    const prevConnected = teslaBLE.connected
    teslaBLE.connected = true

    const origSetTimeout = global.setTimeout
    let captured = null
    global.setTimeout = function(fn, ms) { captured = fn; return 't' }

    let cbResult = null
    teslaBLE.waitForNextResponse(300, (r) => { cbResult = r })
    expect(captured).not.toBeNull()
    captured()
    expect(cbResult && cbResult.success).toBe(false)
    expect(cbResult && cbResult.error).toMatch(/NFC tap timeout/)

    global.setTimeout = origSetTimeout
    teslaBLE.connected = prevConnected
  })
})
