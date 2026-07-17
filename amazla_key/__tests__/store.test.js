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
    store.reset()
  })

  // ── string-backed properties ──────────────────────────────────────────────

  test('localStorage-backed properties store and retrieve values', () => {
    store.vehicleMac   = 'MAC_123'
    store.vehicleVin   = '5YJ3E1EA6JF020598'
    store.vehicleName  = 'MyCar'

    expect(store.vehicleMac).toBe('MAC_123')
    expect(store.vehicleVin).toBeInstanceOf(Uint8Array)
    expect(store.vehicleVin.length).toBe(17)
    expect(store.vehicleName).toBe('MyCar')
    // Derived from VIN char 4 ('3'), not stored
    expect(store.vehicleModel).toBe('Model 3')
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

  test('watchPublicKey: preserves null bytes (file-backed, not LocalStorage)', () => {
    // Regression: a 65-byte EC point with null bytes must survive storage. In
    // LocalStorage a later write corrupted it → the vehicle rejected the enrolled
    // key as KEY_NOT_ON_WHITELIST on the connect right after a successful pairing.
    const input = new Uint8Array(65)
    input[0] = 0x04
    input[1] = 0x00; input[2] = 0x00; input[10] = 0x00; input[40] = 0x00
    for (let i = 3; i < 65; i++) if (input[i] === undefined || i % 7) input[i] = (i * 5) & 0xff
    store.watchPublicKey = bytesToBinaryString(input)
    expect(Array.from(store.watchPublicKey)).toEqual(Array.from(input))
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

  // ── sessionKey (file-backed, secret) ──────────────────────────────────────

  test('sessionKey: null when nothing stored', () => {
    expect(store.sessionKey).toBeFalsy()
  })

  test('sessionKey round-trip: 16-byte value preserved', () => {
    const input = new Uint8Array(16)
    for (let i = 0; i < 16; i++) input[i] = i * 7
    store.sessionKey = input
    const got = store.sessionKey
    expect(got.length).toBe(16)
    expect(Array.from(got)).toEqual(Array.from(input))
  })

  test('sessionKey: preserves null bytes (file-backed, not LocalStorage)', () => {
    const input = new Uint8Array([0, 0, 1, 0, 255, 0, 0, 7, 0, 0, 0, 0, 9, 0, 0, 0])
    store.sessionKey = input
    expect(Array.from(store.sessionKey)).toEqual(Array.from(input))
  })

  test('sessionKey: cleared by setting falsy', () => {
    store.sessionKey = new Uint8Array(16).fill(3)
    store.sessionKey = null
    expect(store.sessionKey).toBeFalsy()
  })

  // ── isReady / isEnrolled / isPaired ────────────────────────────────────────

  // Enrolled = public key + VIN (gates connects). Fully paired also needs the
  // session key. The private key lives only on the phone, never on the watch.
  function setupEnrolled() {
    store.watchPublicKey        = bytesToBinaryString(new Uint8Array(65).fill(0x04))
    store.vehicleEcPublicKey    = new Uint8Array(65).fill(0x04)
    store.vehicleVin            = '5YJ3E1EA6JF020598'
  }
  function setupFullyPaired() {
    setupEnrolled()
    store.sessionKey = new Uint8Array(16).fill(0x06)
  }

  test('isReady: false when nothing stored, true once VIN is present', () => {
    expect(store.isReady).toBe(false)
    store.vehicleVin = '5YJ3E1EA6JF020598'
    expect(store.isReady).toBe(true)
  })

  test('isEnrolled: true with public key + VIN, even without a session key', () => {
    setupEnrolled()
    expect(store.isEnrolled).toBe(true)
    expect(store.sessionKey).toBeFalsy()
  })

  test('isEnrolled: false when watchPublicKey missing', () => {
    setupEnrolled()
    store.watchPublicKey = null // file-backed now — clear via setter, not removeItem
    expect(store.isEnrolled).toBe(false)
  })

  test('isPaired: false when nothing stored', () => {
    expect(store.isPaired).toBe(false)
  })

  test('isPaired: true when enrolled AND session key cached', () => {
    setupFullyPaired()
    expect(store.isPaired).toBe(true)
  })

  test('isPaired: false when watchPublicKey missing', () => {
    setupFullyPaired()
    store.watchPublicKey = null
    expect(store.isPaired).toBe(false)
  })

  test('isPaired: stays true when vehicleEcPublicKey missing (not part of pairing identity)', () => {
    setupFullyPaired()
    store.removeItem('vehicleEcPublicKey')
    store.removeBinary('vehicle_ec_public_key')
    expect(store.isPaired).toBe(true)
  })

  test('isPaired: false when sessionKey missing (enrolled but not yet derived)', () => {
    setupFullyPaired()
    store.sessionKey = null
    // The key is derived on first CONNECT; until then the watch is enrolled but
    // not fully paired.
    expect(store.isEnrolled).toBe(true)
    expect(store.isPaired).toBe(false)
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

  // ── counterState (anti-replay high-water) ───────────────────────────────────

  test('counterState round-trips {epoch, counter}', () => {
    store.counterState = { epoch: 'aabbccdd', counter: 42 }
    expect(store.counterState).toEqual({ epoch: 'aabbccdd', counter: 42 })
  })

  test('counterState is null when unset and after clearing', () => {
    expect(store.counterState).toBeNull()
    store.counterState = { epoch: 'ff', counter: 7 }
    store.counterState = null
    expect(store.counterState).toBeNull()
  })

  test('counterState ignores malformed values (no epoch / non-numeric counter)', () => {
    store.counterState = { counter: 5 } // no epoch
    expect(store.counterState).toBeNull()
    store.counterState = { epoch: 'ab', counter: 'x' } // non-numeric
    expect(store.counterState).toBeNull()
  })

  test('reset() clears counterState (new pairing = new session)', () => {
    store.counterState = { epoch: 'aa', counter: 99 }
    store.reset()
    expect(store.counterState).toBeNull()
  })

  test('counterStore adapter: save then load for a matching epoch; null for a different one', () => {
    store.counterStore.save('deadbeef', 77)
    expect(store.counterStore.load('deadbeef')).toBe(77)
    expect(store.counterStore.load('otherepoch')).toBeNull() // epoch mismatch = no floor
  })

  // ── reset ─────────────────────────────────────────────────────────────────

  test('reset clears all localStorage keys without throwing', () => {
    store.vehicleName  = 'Car'
    store.vehicleVin   = '5YJYE1EA6JF020598'
    store.vehicleMac   = 'MAC'
    store.vehicleEcPublicKey = new Uint8Array(65)
    store.watchPublicKey     = bytesToBinaryString(new Uint8Array(65))
    store.sessionKey         = new Uint8Array(16).fill(1)

    expect(() => store.reset()).not.toThrow()

    expect(store.vehicleName).toBeNull()
    expect(store.vehicleModel).toBeNull()
    expect(store.vehicleVin).toBeNull()
    expect(store.vehicleMac).toBeNull()
    expect(store.vehicleEcPublicKey).toBeNull()
    expect(store.watchPublicKey).toBeNull()
    expect(store.sessionKey).toBeFalsy()
  })
})
