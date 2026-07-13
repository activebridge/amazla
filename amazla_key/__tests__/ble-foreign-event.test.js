import { jest } from '@jest/globals'
import teslaBLE from '../lib/tesla-ble/ble.js'

// Device 2026-07-13: the native mstConnect callback fires for ANY device's
// connection state changes — the paired phone's companion link cycling arrived
// as a disconnect on OUR callback and was read as the car link dying; the
// reset+re-dial churn wedged the BLE stack until a Bluetooth restart. easy-ble
// forwards those events indistinguishably (no source MAC), so ble.js filters by
// RX recency: a connected car streams frames continuously (~1Hz beacons), so a
// "disconnect" arriving while RX is fresh must belong to another device.
describe('teslaBLE — late native disconnect vs foreign-device noise', () => {
  afterEach(() => {
    teslaBLE.reset()
    jest.restoreAllMocks()
  })

  const dial = (timeoutMs) => {
    const nativeCbs = []
    jest.spyOn(teslaBLE, '_ensureBLE').mockReturnValue({
      connect: (_mac, cb) => { nativeCbs.push(cb); return true },
    })
    jest.spyOn(teslaBLE, '_clearStaleNativeState').mockImplementation(() => {})
    const results = []
    teslaBLE.connect('a4:da:32:3e:70:25', (r) => results.push(r), timeoutMs)
    return { nativeCbs, results }
  }

  test('disconnect with FRESH RX → foreign noise: no linkDown, link state untouched', async () => {
    const { nativeCbs, results } = dial(30)
    await new Promise((r) => setTimeout(r, 60)) // let the dial settle (done=true), as on device
    expect(results.length).toBe(1)

    teslaBLE.connected = true // link believed up (as after a successful earlier dial)
    teslaBLE._lastRxTime = Date.now() // frames flowing — beacons arrive ~1Hz on a live link
    let linkDowns = 0
    teslaBLE.onLinkDown = () => linkDowns++

    nativeCbs[0]({ connected: false, status: 'disconnected' }) // phone link cycling
    expect(linkDowns).toBe(0)
    expect(teslaBLE.connected).toBe(true)
  })

  test('disconnect with STALE RX → genuine link death: linkDown fires, state torn down', async () => {
    const { nativeCbs, results } = dial(30)
    await new Promise((r) => setTimeout(r, 60))
    expect(results.length).toBe(1)

    teslaBLE.connected = true
    teslaBLE._lastRxTime = Date.now() - 10000 // silent for 10s — no beacons, no acks
    let linkDowns = 0
    teslaBLE.onLinkDown = () => linkDowns++

    nativeCbs[0]({ connected: false, status: 'disconnected' })
    expect(linkDowns).toBe(1)
    expect(teslaBLE.connected).toBe(false)
  })
})
