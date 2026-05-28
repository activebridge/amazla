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

/** Bytes of a binary string. */
function strBytes(s) {
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff
  return u
}

/**
 * Build the binary response envelope the companion now sends for large
 * payloads: [0x01][concatenated parts] on success, [0x00][utf-8 msg] on error.
 * Mirrors okBin/errBin in app-side/index.js.
 */
function okEnv(...binStrs) {
  const parts = binStrs.map(strBytes)
  const u = new Uint8Array(1 + parts.reduce((a, p) => a + p.length, 0))
  u[0] = 1
  let o = 1
  for (const p of parts) {
    u.set(p, o)
    o += p.length
  }
  return u
}
function errEnv(msg) {
  const b = strBytes(msg)
  const u = new Uint8Array(1 + b.length)
  u[0] = 0
  u.set(b, 1)
  return u
}

/**
 * Create a mock page whose .request() resolves with pre-configured responses.
 * `responses` maps method name → value or fn(params) → value.
 */
function makeMb(responses = {}) {
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
    const page = makeMb({ BLE_SYNC_POOL: okEnv(poolBinary) })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve))

    expect(store.keyPool).toBeDefined()
    expect(store.keyPool.length).toBe(97 * 3)
  })

  test('passes currentCount from store.keyPoolCount by default', async () => {
    store.keyPool = new Uint8Array(97 * 2) // 2 keys → keyPoolCount = 2
    const page = makeMb({ BLE_SYNC_POOL: okEnv() })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve))

    expect(page.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ currentCount: 2 }) }),
      { dataType: 'bin' },
    )
  })

  test('count=0 overrides store.keyPoolCount (force full regen)', async () => {
    store.keyPool = new Uint8Array(97 * 5) // has 5 keys
    const page = makeMb({ BLE_SYNC_POOL: okEnv() })
    const phone = new Phone(page)

    await new Promise(resolve => phone.syncPool(resolve, 0))

    expect(page.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ currentCount: 0 }) }),
      { dataType: 'bin' },
    )
  })

  test('does not write store.keyPool when companion returns no pool', async () => {
    const page = makeMb({ BLE_SYNC_POOL: okEnv() })
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
    const page = makeMb({
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
    const page = makeMb({
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
    const page = makeMb({ BLE_SYNC_KEYS: { success: true, publicKeyBinary: keyBinary } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.syncKeys(resolve))

    expect(result.success).toBe(true)
    // watchPublicKey is stored as binary string and read back as Uint8Array
    expect(store.watchPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.watchPublicKey.length).toBe(65)
  })

  test('calls cb with success:false on failure response', async () => {
    const page = makeMb({ BLE_SYNC_KEYS: { success: false, error: 'keygen failed' } })
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

// ─── pairSetup ────────────────────────────────────────────────────────────────

describe('pairSetup()', () => {
  test('writes store.watchPublicKey and returns pairMsg + verifyMsg', async () => {
    const pubKey = fakeBinary(65, 0x04)
    const pairMsg = fakeBinary(50)
    const verifyMsg = fakeBinary(30)
    const page = makeMb({
      BLE_PAIR_SETUP: { success: true, watchPublicKey: pubKey, pairMsg, verifyMsg },
    })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.pairSetup(resolve))

    expect(result.success).toBe(true)
    expect(result.pairMsg).toBe(pairMsg)
    expect(result.verifyMsg).toBe(verifyMsg)
    expect(store.watchPublicKey).toBeInstanceOf(Uint8Array)
    expect(store.watchPublicKey.length).toBe(65)
  })

  test('calls cb with success:false on failure', async () => {
    const page = makeMb({ BLE_PAIR_SETUP: { success: false, error: 'keygen failed' } })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.pairSetup(resolve))
    expect(result.success).toBe(false)
    expect(result.error).toBe('keygen failed')
  })

  test('calls cb with success:false on rejection', async () => {
    const page = { request: jest.fn(() => Promise.reject(new Error('crash'))) }
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.pairSetup(resolve))
    expect(result.success).toBe(false)
  })
})

// ─── completePairing ──────────────────────────────────────────────────────────

describe('completePairing()', () => {
  // After the field-17 EC-extraction bug was found (2026-05-28),
  // BLE_COMPLETE_PAIRING became a no-op and the vehicle pubkey is fetched
  // from SessionInfo on first connect instead. phone.completePairing now
  // short-circuits to success without any RPC or store writes.
  test('always calls cb with success:true (no RPC, no store writes)', async () => {
    const before = store.vehicleEcPublicKey
    const phone = new Phone({ request: jest.fn() })
    const result = await new Promise(resolve =>
      phone.completePairing(fakeBinary(100), resolve))
    expect(result.success).toBe(true)
    expect(store.vehicleEcPublicKey).toBe(before)  // untouched
  })

  test('still succeeds even when no messageBuilder is available', async () => {
    const phone = new Phone(null)
    const result = await new Promise(resolve =>
      phone.completePairing(fakeBinary(100), resolve))
    expect(result.success).toBe(true)
  })
})

// ─── precomputeTable ──────────────────────────────────────────────────────────

describe('precomputeTable()', () => {
  test('returns 16384-byte Uint8Array from BLE_PRECOMPUTE_TABLE binary response', async () => {
    const table = fakeBinary(16384)
    const page = makeMb({ BLE_PRECOMPUTE_TABLE: okEnv(table) })
    const phone = new Phone(page)
    const result = await phone.precomputeTable(strBytes(fakeBinary(65, 0x04)))
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(16384)
  })

  test('rejects when companion returns an error envelope', async () => {
    const page = makeMb({ BLE_PRECOMPUTE_TABLE: errEnv('Bad point') })
    const phone = new Phone(page)
    await expect(phone.precomputeTable(strBytes(fakeBinary(65, 0x04)))).rejects.toThrow(/bad point/i)
  })
})

// ─── simulatePair ─────────────────────────────────────────────────────────────

describe('simulatePair()', () => {
  function makeSimulateMb() {
    return makeMb({
      SIMULATE_PAIR: {
        success: true,
        watchPublicKeyBinary: fakeBinary(65, 0x01),
        vehicleEcKeyBinary:   fakeBinary(65, 0x02),
        mac: 'AA:BB:CC:DD:EE:FF',
        vin: new Uint8Array(17).fill(0x56),
      },
      BLE_PRECOMPUTE_TABLE: okEnv(fakeBinary(16384)),
      BLE_SYNC_POOL: okEnv(fakeBinary(97 * 5)),
    })
  }

  test('writes all pairing artifacts to store on success', async () => {
    const phone = new Phone(makeSimulateMb())

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
    const page = makeSimulateMb()
    const phone = new Phone(page)

    await new Promise(resolve => phone.simulatePair(resolve))

    const methods = page.request.mock.calls.map(c => c[0].method)
    expect(methods).toEqual(['SIMULATE_PAIR', 'BLE_PRECOMPUTE_TABLE', 'BLE_SYNC_POOL'])
  })

  test('stops and reports error if SIMULATE_PAIR fails', async () => {
    const page = makeMb({
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
    const page = makeMb({
      SIMULATE_PAIR: {
        success: true,
        watchPublicKeyBinary: fakeBinary(65, 0x01),
        vehicleEcKeyBinary:   fakeBinary(65, 0x02),
        mac: 'AA:BB:CC:DD:EE:FF',
        vin: new Uint8Array(17).fill(0x56),
      },
      BLE_PRECOMPUTE_TABLE: errEnv('table error'),
    })
    const phone = new Phone(page)

    const result = await new Promise(resolve => phone.simulatePair(resolve))

    expect(result.success).toBe(false)
    const methods = page.request.mock.calls.map(c => c[0].method)
    expect(methods).not.toContain('BLE_SYNC_POOL')
  })
})
