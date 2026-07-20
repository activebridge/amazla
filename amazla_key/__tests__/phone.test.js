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

// ─── syncSettings ─────────────────────────────────────────────────────────────

describe('syncSettings()', () => {
  test('writes vehicleName and vehicleVin to store', async () => {
    const page = makeMb({
      GET_SETTINGS: { success: true, vehicleName: 'Model Y', vehicleVin: 'ABCDEFGH123456789', exitOnLock: true },
    })
    const phone = new Phone(page)

    await phone.syncSettings()

    expect(store.vehicleName).toBe('Model Y')
    // vehicleVin is stored as binary string and read back as Uint8Array
    expect(store.vehicleVin).toBeInstanceOf(Uint8Array)
    expect(store.vehicleVin.length).toBe(17)
    expect(store.exitOnLock).toBe(true)
  })

  test('missing exitOnLock syncs to OFF (default)', async () => {
    store.exitOnLock = true
    const page = makeMb({
      GET_SETTINGS: { success: true, vehicleName: 'Model Y', vehicleVin: null },
    })
    const phone = new Phone(page)

    await phone.syncSettings()

    expect(store.exitOnLock).toBe(false)
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

// ─── computeSharedSecret ────────────────────────────────────────────────────

describe('computeSharedSecret()', () => {
  test('returns 32-byte Uint8Array from BLE_COMPUTE_SHARED_SECRET binary response', async () => {
    const secret = fakeBinary(32)
    const page = makeMb({ BLE_COMPUTE_SHARED_SECRET: okEnv(secret) })
    const phone = new Phone(page)
    const result = await phone.computeSharedSecret(strBytes(fakeBinary(65, 0x04)))
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(32)
  })

  test('rejects when companion returns an error envelope', async () => {
    const page = makeMb({ BLE_COMPUTE_SHARED_SECRET: errEnv('Bad point') })
    const phone = new Phone(page)
    await expect(phone.computeSharedSecret(strBytes(fakeBinary(65, 0x04)))).rejects.toThrow(/bad point/i)
  })
})
