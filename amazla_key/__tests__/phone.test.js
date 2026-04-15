/**
 * Unit tests for the Phone class (lib/phone.js).
 *
 * The page object is replaced with a mock whose .request() returns
 * controlled promises. store is reset before each test.
 */

import { jest } from '@jest/globals'
import Phone from '../lib/phone.js'
import store from '../lib/store.js'
import { _fsStore } from '../__mocks__/zos.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a fake binary string of `n` bytes (value 0x42 by default) */
function fakeBinary(n, byte = 0x42) {
  return Array.from({ length: n }, () => String.fromCharCode(byte)).join('')
}

/**
 * Create a mock page whose .request() resolves with pre-configured responses.
 * `responses` maps method name → value or fn(params) → value.
 */
function makePage(responses = {}) {
  return {
    request: jest.fn(({ method, params }) => {
      if (method in responses) {
        const entry = responses[method]
        const value = typeof entry === 'function' ? entry(params) : entry
        return Promise.resolve(value)
      }
      return Promise.reject(new Error(`Unexpected method: ${method}`))
    }),
  }
}

// ─── lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  Object.keys(_fsStore).forEach(k => delete _fsStore[k])
  store.reset()
})

// ─── syncPool ─────────────────────────────────────────────────────────────────

describe('syncPool()', () => {
  test('writes store.keyPool when companion returns pool', async () => {
    const poolBinary = fakeBinary(97 * 3)
    const page = makePage({ BLE_SYNC_POOL: { success: true, pool: poolBinary } })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve))

    expect(store.keyPool).toBeDefined()
    expect(store.keyPool.length).toBe(97 * 3)
  })

  test('passes currentCount from store.keyPoolCount by default', async () => {
    store.keyPool = new Uint8Array(97 * 2) // 2 keys → keyPoolCount = 2
    const page = makePage({ BLE_SYNC_POOL: { success: true, pool: null } })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve))

    expect(page.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ currentCount: 2 }) }),
    )
  })

  test('count=0 overrides store.keyPoolCount (force full regen)', async () => {
    store.keyPool = new Uint8Array(97 * 5) // has 5 keys
    const page = makePage({ BLE_SYNC_POOL: { success: true, pool: null } })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve, 0))

    expect(page.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ currentCount: 0 }) }),
    )
  })

  test('does not write store.keyPool when companion returns no pool', async () => {
    const page = makePage({ BLE_SYNC_POOL: { success: true, pool: null } })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve))

    expect(store.keyPool).toBeFalsy()
  })

  test('calls cb with success:false on rejection', async () => {
    const page = { request: jest.fn(() => Promise.reject(new Error('net error'))) }
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.syncPool(resolve))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/net error/)
  })
})

// ─── syncSettings ─────────────────────────────────────────────────────────────

describe('syncSettings()', () => {
  test('writes vehicleName and vehicleVin to store', async () => {
    const page = makePage({
      GET_SETTINGS: { success: true, vehicleName: 'Model Y', vehicleVin: 'ABCDEFGH123456789' },
    })
    const phone = new Phone(page)

    await phone.syncSettings()

    expect(store.vehicleName).toBe('Model Y')
    // vehicleVin is stored as binary string and read back as Uint8Array
    expect(store.vehicleVin).toBeInstanceOf(Uint8Array)
    expect(store.vehicleVin.length).toBe(17)
  })

  test('nulls out missing fields', async () => {
    store.vehicleName = 'old'
    const page = makePage({
      GET_SETTINGS: { success: true, vehicleName: null, vehicleVin: null },
    })
    const phone = new Phone(page)

    await phone.syncSettings()

    expect(store.vehicleName).toBeNull()
  })

  test('silently ignores rejection', async () => {
    const page = { request: jest.fn(() => Promise.reject(new Error('timeout'))) }
    const phone = new Phone(page)

    await expect(phone.syncSettings()).resolves.not.toThrow()
  })
})

// ─── syncKeys ─────────────────────────────────────────────────────────────────

describe('syncKeys()', () => {
  test('writes store.watchPublicKey and returns publicKeyBinary in cb', async () => {
    const keyBinary = fakeBinary(65)
    const page = makePage({ BLE_SYNC_KEYS: { success: true, publicKeyBinary: keyBinary } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.syncKeys(resolve))

    expect(result.success).toBe(true)
    // watchPublicKey is stored as binary string and read back as Uint8Array
    expect(store.watchPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.watchPublicKey.length).toBe(65)
  })

  test('calls cb with success:false on failure response', async () => {
    const page = makePage({ BLE_SYNC_KEYS: { success: false, error: 'keygen failed' } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.syncKeys(resolve))

    expect(result.success).toBe(false)
    expect(result.error).toBe('keygen failed')
  })

  test('calls cb with success:false on rejection', async () => {
    const page = { request: jest.fn(() => Promise.reject(new Error('crash'))) }
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.syncKeys(resolve))
    expect(result.success).toBe(false)
  })
})

// ─── pair ─────────────────────────────────────────────────────────────────────

describe('pair()', () => {
  test('returns message from companion', async () => {
    const msgBinary = fakeBinary(50)
    const page = makePage({ BLE_PAIR: { success: true, message: msgBinary } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.pair(fakeBinary(65), resolve))

    expect(result.success).toBe(true)
    expect(result.message).toBe(msgBinary)
  })

  test('passes publicKeyBinary to companion', async () => {
    const pubKey = fakeBinary(65, 0x04)
    const page = makePage({ BLE_PAIR: { success: true, message: fakeBinary(10) } })
    const phone = new Phone(page)

    await new Promise(resolve => phone.pair(pubKey, resolve))

    expect(page.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ publicKeyBinary: pubKey }) }),
    )
  })

  test('calls cb with success:false on failure response', async () => {
    const page = makePage({ BLE_PAIR: { success: false, error: 'not enrolled' } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.pair(fakeBinary(65), resolve))
    expect(result.success).toBe(false)
    expect(result.error).toBe('not enrolled')
  })
})

// ─── verifyPair ───────────────────────────────────────────────────────────────

describe('verifyPair()', () => {
  test('returns message from companion', async () => {
    const msgBinary = fakeBinary(30)
    const page = makePage({ BLE_VERIFY_PAIR: { success: true, message: msgBinary } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.verifyPair(fakeBinary(65), resolve))

    expect(result.success).toBe(true)
    expect(result.message).toBe(msgBinary)
  })

  test('calls cb with success:false on failure', async () => {
    const page = makePage({ BLE_VERIFY_PAIR: { success: false, error: 'not found' } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.verifyPair(fakeBinary(65), resolve))
    expect(result.success).toBe(false)
  })
})

// ─── precomputeTable ──────────────────────────────────────────────────────────

describe('precomputeTable()', () => {
  test('writes store.vehicleDoublingsTable and calls cb with success', async () => {
    const tableBinary = fakeBinary(16384)
    const page = makePage({ BLE_PRECOMPUTE_TABLE: { success: true, table: tableBinary } })
    const phone = new Phone(page)

    const result = await new Promise(resolve =>
      phone.precomputeTable(fakeBinary(65), resolve))

    expect(result.success).toBe(true)
    expect(store.vehicleDoublingsTable).toBeDefined()
    // stored as Uint32Array: 16384 bytes / 4 = 4096 elements
    expect(store.vehicleDoublingsTable.length).toBe(4096)
  })

  test('calls cb with success:false when table missing in response', async () => {
    const page = makePage({ BLE_PRECOMPUTE_TABLE: { success: true, table: null } })
    const phone = new Phone(page)

    const result = await new Promise(resolve =>
      phone.precomputeTable(fakeBinary(65), resolve))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no table/i)
  })

  test('calls cb with success:false on rejection', async () => {
    const page = { request: jest.fn(() => Promise.reject(new Error('OOM'))) }
    const phone = new Phone(page)

    const result = await new Promise(resolve =>
      phone.precomputeTable(fakeBinary(65), resolve))
    expect(result.success).toBe(false)
  })
})

// ─── simulatePair ─────────────────────────────────────────────────────────────

describe('simulatePair()', () => {
  function makeSimulatePage() {
    return makePage({
      SIMULATE_PAIR: {
        success: true,
        watchPublicKeyBinary: fakeBinary(65, 0x01),
        vehicleEcKeyBinary:   fakeBinary(65, 0x02),
        mac: 'AA:BB:CC:DD:EE:FF',
        vin: new Uint8Array(17).fill(0x56),
      },
      BLE_PRECOMPUTE_TABLE: { success: true, table: fakeBinary(16384) },
      BLE_SYNC_POOL: { success: true, pool: fakeBinary(97 * 5) },
    })
  }

  test('writes all pairing artifacts to store on success', async () => {
    const phone = new Phone(makeSimulatePage())

    const result = await new Promise(resolve => phone.simulatePair(resolve))

    expect(result.success).toBe(true)
    expect(store.vehicleMac).toBe('AA:BB:CC:DD:EE:FF')
    expect(store.vehicleEcPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.vehicleEcPublicKey.length).toBe(65)
    expect(store.vehicleDoublingsTable).toBeDefined()
    // stored as Uint32Array: 16384 bytes / 4 = 4096 elements
    expect(store.vehicleDoublingsTable.length).toBe(4096)
    expect(store.keyPool).toBeDefined()
    expect(store.keyPool.length).toBe(97 * 5)
  })

  test('calls all three phone methods in order', async () => {
    const page = makeSimulatePage()
    const phone = new Phone(page)

    await new Promise(resolve => phone.simulatePair(resolve))

    const methods = page.request.mock.calls.map(c => c[0].method)
    expect(methods).toEqual(['SIMULATE_PAIR', 'BLE_PRECOMPUTE_TABLE', 'BLE_SYNC_POOL'])
  })

  test('stops and reports error if SIMULATE_PAIR fails', async () => {
    const page = makePage({
      SIMULATE_PAIR: { success: false, error: 'sim error' },
    })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.simulatePair(resolve))

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/sim error/)
    // Should not have called subsequent methods
    const methods = page.request.mock.calls.map(c => c[0].method)
    expect(methods).not.toContain('BLE_PRECOMPUTE_TABLE')
  })

  test('stops and reports error if BLE_PRECOMPUTE_TABLE fails', async () => {
    const page = makePage({
      SIMULATE_PAIR: {
        success: true,
        watchPublicKeyBinary: fakeBinary(65, 0x01),
        vehicleEcKeyBinary:   fakeBinary(65, 0x02),
        mac: 'AA:BB:CC:DD:EE:FF',
        vin: new Uint8Array(17).fill(0x56),
      },
      BLE_PRECOMPUTE_TABLE: { success: false, error: 'table error' },
    })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.simulatePair(resolve))

    expect(result.success).toBe(false)
    const methods = page.request.mock.calls.map(c => c[0].method)
    expect(methods).not.toContain('BLE_SYNC_POOL')
  })
})
