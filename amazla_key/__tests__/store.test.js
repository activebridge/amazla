import { jest } from '@jest/globals'

let store
let zosFs
let bytesToBinaryString

describe('lib/store.js', () => {
  beforeAll(async () => {
    zosFs = await import('@zos/fs')
    const mod   = await import('../lib/store.js')
    const utils = await import('../lib/tesla-ble/crypto/binary-utils.js')
    store = mod.default
    bytesToBinaryString = utils.bytesToBinaryString
  })

  beforeEach(() => {
    // Reset in-memory fs and localStorage state between tests
    for (const k of Object.keys(zosFs._fsStore)) delete zosFs._fsStore[k]
    // Clear doublings table cache by writing undefined (triggers cache reset)
    store.vehicleDoublingsTable = undefined
  })

  // ── string-backed properties ──────────────────────────────────────────────

  test('localStorage-backed properties store and retrieve values', () => {
    store.vehicleMac   = 'MAC_123'
    store.vehicleVin   = '5YJ3E1EA6JF020598'
    store.vehicleName  = 'MyCar'
    store.vehicleModel = 'Model S'

    expect(store.vehicleMac).toBe('MAC_123')
    expect(store.vehicleVin).toBeInstanceOf(Uint8Array)
    expect(store.vehicleVin.length).toBe(17)
    expect(store.vehicleName).toBe('MyCar')
    expect(store.vehicleModel).toBe('Model S')
  })

  test('removeItem deletes entries from local storage', () => {
    store.vehicleName = 'TempName'
    store.removeItem('vehicleName')
    expect(store.vehicleName).toBeNull()
  })

  test('removeBinary does not throw when file absent', () => {
    expect(() => store.removeBinary('nonexistent_file')).not.toThrow()
  })

  // ── watchPublicKey ────────────────────────────────────────────────────────

  test('watchPublicKey: returns null when nothing stored', () => {
    expect(store.watchPublicKey).toBeNull()
  })

  test('watchPublicKey round-trip: binary string in, Uint8Array out', () => {
    const original = new Uint8Array(65)
    original[0] = 0x04
    for (let i = 1; i < 65; i++) original[i] = i

    store.watchPublicKey = bytesToBinaryString(original)

    const result = store.watchPublicKey
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(65)
    expect(Array.from(result)).toEqual(Array.from(original))
  })

  // ── vehicleEcPublicKey ────────────────────────────────────────────────────

  test('vehicleEcPublicKey: returns null when nothing stored', () => {
    expect(store.vehicleEcPublicKey).toBeNull()
  })

  test('vehicleEcPublicKey round-trip: Uint8Array in, Uint8Array out', () => {
    const original = new Uint8Array(65)
    original[0] = 0x04
    for (let i = 1; i < 65; i++) original[i] = (i * 3) & 0xff

    store.vehicleEcPublicKey = original

    const result = store.vehicleEcPublicKey
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(65)
    expect(Array.from(result)).toEqual(Array.from(original))
  })

  test('writeBinary accepts Uint8Array with non-zero byteOffset', () => {
    const buffer = new ArrayBuffer(10)
    const full = new Uint8Array(buffer)
    for (let i = 0; i < 10; i++) full[i] = i
    const sub = new Uint8Array(buffer, 2, 5) // bytes 2..6

    store.vehicleEcPublicKey = sub

    const result = store.vehicleEcPublicKey
    expect(result).toBeInstanceOf(Uint8Array)
    expect(Array.from(result)).toEqual([2, 3, 4, 5, 6])
  })

  // ── vehicleDoublingsTable ─────────────────────────────────────────────────

  test('vehicleDoublingsTable: returns undefined when nothing stored', () => {
    expect(store.vehicleDoublingsTable).toBeUndefined()
  })

  test('vehicleDoublingsTable: returns undefined when data length is wrong', () => {
    store.vehicleDoublingsTable = new Uint32Array(10) // too short — byteLength=40, not 16384
    expect(store.vehicleDoublingsTable).toBeUndefined()
  })

  test('vehicleDoublingsTable round-trip: returns Uint32Array of correct length', () => {
    store.vehicleDoublingsTable = new Uint32Array(256 * 16)
    const table = store.vehicleDoublingsTable
    expect(table).toBeInstanceOf(Uint32Array)
    expect(table.length).toBe(256 * 16)
  })

  test('vehicleDoublingsTable round-trip: values preserved (x=1, y=2)', () => {
    const input = new Uint32Array(256 * 16)
    input[0] = 1  // entry 0 x LSW
    input[8] = 2  // entry 0 y LSW

    store.vehicleDoublingsTable = input
    const table = store.vehicleDoublingsTable

    expect(table[0]).toBe(1)
    for (let i = 1; i < 8; i++) expect(table[i]).toBe(0)
    expect(table[8]).toBe(2)
    for (let i = 9; i < 16; i++) expect(table[i]).toBe(0)
  })

  test('vehicleDoublingsTable round-trip: multi-word values preserved', () => {
    const input = new Uint32Array(256 * 16)
    input[0] = 0x05060708
    input[1] = 0x01020304

    store.vehicleDoublingsTable = input
    const table = store.vehicleDoublingsTable

    expect(table[0]).toBe(0x05060708)
    expect(table[1]).toBe(0x01020304)
    for (let i = 2; i < 8; i++) expect(table[i]).toBe(0)
  })

  test('vehicleDoublingsTable round-trip: entry i=1 preserved independently', () => {
    const input = new Uint32Array(256 * 16)
    input[16] = 7  // entry 1 x LSW
    input[24] = 9  // entry 1 y LSW

    store.vehicleDoublingsTable = input
    const table = store.vehicleDoublingsTable

    for (let i = 0; i < 16; i++) expect(table[i]).toBe(0)
    expect(table[16]).toBe(7)
    expect(table[24]).toBe(9)
  })

  test('vehicleDoublingsTable is cached after first read', () => {
    store.vehicleDoublingsTable = new Uint8Array(16384)
    const t1 = store.vehicleDoublingsTable
    const t2 = store.vehicleDoublingsTable
    expect(t1).toBe(t2) // same reference
  })

  // ── hasDoublingsTable ─────────────────────────────────────────────────────

  test('hasDoublingsTable: false when nothing stored', () => {
    expect(store.hasDoublingsTable).toBe(false)
  })

  test('hasDoublingsTable: true after storing valid table', () => {
    store.vehicleDoublingsTable = new Uint32Array(256 * 16)
    expect(store.hasDoublingsTable).toBe(true)
  })

  test('hasDoublingsTable: true after first cache load (no extra file I/O)', () => {
    store.vehicleDoublingsTable = new Uint32Array(256 * 16)
    store.vehicleDoublingsTable // loads and caches
    // Force cache clear — but LocalStorage flag still set
    // We can't clear _doublingsTableCache directly; re-test from LocalStorage flag
    expect(store.hasDoublingsTable).toBe(true)
  })

  // ── isPaired ──────────────────────────────────────────────────────────────

  function setupFullyPaired() {
    store.watchPublicKey        = bytesToBinaryString(new Uint8Array(65).fill(0x04))
    store.watchPrivateKey       = bytesToBinaryString(new Uint8Array(32).fill(0x05))
    store.vehicleEcPublicKey    = new Uint8Array(65).fill(0x04)
    store.vehicleDoublingsTable = new Uint32Array(256 * 16)
    store.vehicleVin            = '5YJ3E1EA6JF020598'
  }

  test('isPaired: false when nothing stored', () => {
    expect(store.isPaired).toBe(false)
  })

  test('isPaired: true when all artifacts present', () => {
    setupFullyPaired()
    expect(store.isPaired).toBe(true)
  })

  test('isPaired: false when watchPublicKey missing', () => {
    setupFullyPaired()
    store.watchPublicKey = null
    expect(store.isPaired).toBe(false)
  })

  test('isPaired: stays true when vehicleEcPublicKey missing (lands on first CONNECT, not pair)', () => {
    setupFullyPaired()
    store.removeItem('vehicleEcPublicKey')
    // After refactor: vehicle EC pubkey is fetched from SessionInfo on first
    // CONNECT, not extracted at pair time. isPaired no longer depends on it.
    expect(store.isPaired).toBe(true)
  })

  test('isPaired: stays true when doublingsTable missing (built on first CONNECT, not pair)', () => {
    setupFullyPaired()
    store.vehicleDoublingsTable = null
    // After refactor: doublings table is built from SessionInfo response, not
    // at pair time. isPaired no longer depends on it.
    expect(store.isPaired).toBe(true)
  })

  test('isPaired: false when VIN missing', () => {
    setupFullyPaired()
    store.vehicleVin = null
    expect(store.isPaired).toBe(false)
  })

  test('isPaired: false after reset()', () => {
    setupFullyPaired()
    expect(store.isPaired).toBe(true)
    store.reset()
    expect(store.isPaired).toBe(false)
  })

  // ── reset ─────────────────────────────────────────────────────────────────

  test('reset clears all localStorage keys without throwing', () => {
    store.vehicleName  = 'Car'
    store.vehicleModel = 'Y'
    store.vehicleVin   = 'VIN'
    store.vehicleMac   = 'MAC'
    store.vehicleEcPublicKey = new Uint8Array(65)
    store.watchPublicKey     = bytesToBinaryString(new Uint8Array(65))
    store.vehicleDoublingsTable = new Uint32Array(256 * 16)

    expect(() => store.reset()).not.toThrow()

    expect(store.vehicleName).toBeNull()
    expect(store.vehicleModel).toBeNull()
    expect(store.vehicleVin).toBeNull()
    expect(store.vehicleMac).toBeNull()
    expect(store.vehicleEcPublicKey).toBeNull()
    expect(store.watchPublicKey).toBeNull()
    expect(store.hasDoublingsTable).toBe(false)
  })
})
