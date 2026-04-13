import { jest } from '@jest/globals'

let store
let zosFs

describe('lib/store.js', () => {
  beforeAll(async () => {
    zosFs = await import('@zos/fs')
    const mod = await import('../lib/store.js')
    store = mod.default
  })

  test('binary getters return undefined when no data stored', () => {
    expect(store.watchPublicKey).toBeUndefined()
    expect(store.vehicleEcPublicKey).toBeUndefined()
    expect(store.vehicleDoublingsTable).toBeUndefined()
    expect(store.keyPool).toBeUndefined()
  })

  test('localStorage-backed properties store and retrieve values', () => {
    store.vehicleMac = 'MAC_123'
    store.vehicleVin = 'VIN_123'
    store.vehicleName = 'MyCar'
    store.vehicleModel = 'Model S'

    expect(store.vehicleMac).toBe('MAC_123')
    expect(store.vehicleVin).toBe('VIN_123')
    expect(store.vehicleName).toBe('MyCar')
    expect(store.vehicleModel).toBe('Model S')
  })

  test('removeItem deletes entries from local storage', () => {
    store.vehicleName = 'TempName'
    expect(store.vehicleName).toBe('TempName')
    store.removeItem('vehicleName')
    expect(store.vehicleName).toBeNull()
  })


  test('removeBinary does not throw when clearing binary entries', () => {
    expect(() => store.removeBinary('key_pool')).not.toThrow()
  })

  test('writeBinary accepts Uint8Array with non-zero offset and length', () => {
    const buffer = new ArrayBuffer(10)
    const full = new Uint8Array(buffer)
    for (let i = 0; i < 10; i++) full[i] = i
    const sub = new Uint8Array(buffer, 2, 5) // bytes 2..6

    // Should not throw when storing a subarray (non-zero byteOffset)
    expect(() => { store.keyPool = sub }).not.toThrow()
  })

  test('writeBinary accepts subarray views created from slice', () => {
    const arr = new Uint8Array([10, 11, 12, 13, 14, 15])
    const view = arr.subarray(1, 5) // [11,12,13,14]
    expect(() => { store.keyPool = view }).not.toThrow()
  })
})
