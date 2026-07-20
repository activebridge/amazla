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

  // Device 2026-07-20: a genuine car-side drop can land within FOREIGN_EVENT_RX_MS of its
  // last beacon and look identical to a foreign event — the ignore left the UI stuck
  // "Connected" on a dead link (manual reopen needed). The ignore is now VERIFIED by a
  // silence watchdog: a live car keeps streaming ~1Hz, so continued silence = our drop.
  test('ignored disconnect + frames resume → watchdog no-ops, link stays up', async () => {
    const { nativeCbs, results } = dial(30)
    await new Promise((r) => setTimeout(r, 60))
    expect(results.length).toBe(1)

    teslaBLE.deadLinkSilenceMs = 40
    teslaBLE.connected = true
    teslaBLE._lastRxTime = Date.now() // fresh → ignored as foreign, watchdog armed
    let linkDowns = 0
    teslaBLE.onLinkDown = () => linkDowns++

    nativeCbs[0]({ connected: false, status: 'disconnected' })
    // beacons keep flowing on a live link — RX stays fresh past the watchdog deadline
    const beacon = setInterval(() => { teslaBLE._lastRxTime = Date.now() }, 10)
    await new Promise((r) => setTimeout(r, 120))
    clearInterval(beacon)

    expect(linkDowns).toBe(0)
    expect(teslaBLE.connected).toBe(true)
  })

  test('ignored disconnect + link goes silent → watchdog fires linkDown, tears down', async () => {
    const { nativeCbs, results } = dial(30)
    await new Promise((r) => setTimeout(r, 60))
    expect(results.length).toBe(1)

    teslaBLE.deadLinkSilenceMs = 40
    teslaBLE.connected = true
    teslaBLE._lastRxTime = Date.now() // fresh now (passes the foreign filter, arms watchdog)
    let linkDowns = 0
    teslaBLE.onLinkDown = () => linkDowns++

    nativeCbs[0]({ connected: false, status: 'disconnected' })
    // no further frames — the car never comes back; the watchdog should catch it
    await new Promise((r) => setTimeout(r, 120))

    expect(linkDowns).toBe(1)
    expect(teslaBLE.connected).toBe(false)
  })
})
