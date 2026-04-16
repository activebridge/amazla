import bleCrypto from '../app-side/ble-crypto.js'
import BLEModule, { teslaBLE as teslaBLEFromIndex } from '../lib/tesla-ble/index.js'
import store from '../lib/store.js'

describe('coverage augment tests', () => {
  beforeEach(() => {
    store.reset()
  })

  test('ble-crypto basic API and pair messages', () => {
    // Use exported bleCryptoSession API
    const session = bleCrypto

    // generateEnrolledKeyPair returns keys
    const gen = session.generateEnrolledKeyPair()
    expect(gen.success).toBe(true)
    expect(typeof gen.publicKeyBinary).toBe('string')

    // generateKeyPool returns pool of expected size
    const pool = session.generateKeyPool(2)
    expect(pool.success).toBe(true)
    expect(typeof pool.pool).toBe('string')
    expect(pool.pool.length).toBeGreaterThan(0)

    // buildDoublingsTable fails on wrong length
    const bad = session.buildDoublingsTable('\x01\x02')
    expect(bad.success).toBe(false)

    // buildWhitelistQueryMessage returns success
    const q = session.buildWhitelistQueryMessage()
    expect(q.success).toBe(true)
    expect(typeof q.message).toBe('string')
  })

  test('lib/tesla-ble/index BLE wrapper stores mac on connect and clears', (done) => {
    // mock teslaBLE backend with minimal API
    const mock = {
      connect: (mac, cb) => cb({ success: true }),
      disconnect: () => {},
      isConnected: () => false,
      reset: () => {},
    }
    // replace internal teslaBLE object (teslaBLEFromIndex is reference)
    // mutate module's exported teslaBLE by assigning methods
    teslaBLEFromIndex.connect = mock.connect
    teslaBLEFromIndex.disconnect = mock.disconnect
    teslaBLEFromIndex.isConnected = mock.isConnected
    teslaBLEFromIndex.reset = mock.reset

    expect(store.vehicleMac).toBeNull()
    BLEModule.connect('AA:BB:CC:DD:EE:FF', (result) => {
      expect(result.success).toBe(true)
      expect(store.vehicleMac).toBe('AA:BB:CC:DD:EE:FF')
      BLEModule.clear()
      expect(store.vehicleMac).toBeNull()
      done()
    })
  })
})
