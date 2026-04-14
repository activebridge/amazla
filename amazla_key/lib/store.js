import { readFileSync, rmSync, writeFileSync } from '@zos/fs'
import { LocalStorage } from '@zos/storage'
import { binaryStringToBytes, bytesToBinaryString } from './tesla-ble/crypto/binary-utils.js'

const localStorage = new LocalStorage()

let _doublingsTableCache = null

const readBinary = (path) => {
  try {
    const raw = readFileSync({ path: `${path}.dat` })
    if (raw) return new Uint8Array(raw)
    return undefined
  } catch (_e) {
    return undefined
  }
}

const writeBinary = (path, bytes) => {
  bytes &&
    writeFileSync({
      path: `${path}.dat`,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
}

const get = (name) => {
  try {
    return binaryStringToBytes(localStorage.getItem(name))
  } catch (_e) {
    return null
  }
}

const set = (name, value) => {
  value ? localStorage.setItem(name, value) : localStorage.removeItem(name)
}

const store = {
  get watchPublicKey() {
    return get('watchPublicKey')
  },

  set watchPublicKey(value) {
    set('watchPublicKey', value)
  },

  get vehicleEcPublicKey() {
    return get('vehicleEcPublicKey')
  },
  set vehicleEcPublicKey(value) {
    set('vehicleEcPublicKey', bytesToBinaryString(value))
  },
  get vehicleDoublingsTable() {
    if (_doublingsTableCache) return _doublingsTableCache
    try {
      const raw = readFileSync({ path: 'vehicle_doublings_table.dat' })
      if (!raw || raw.byteLength !== 16384) return undefined
      _doublingsTableCache = new Uint32Array(raw)
    } catch (_e) {
      return undefined
    }
    return _doublingsTableCache
  },
  set vehicleDoublingsTable(value) {
    _doublingsTableCache = null
    writeBinary('vehicle_doublings_table', value)
  },
  get keyPool() {
    return readBinary('key_pool')
  },
  set keyPool(value) {
    writeBinary('key_pool', value)
  },
  get vehicleMac() {
    return localStorage.getItem('vehicleMac')
  },
  set vehicleMac(value) {
    set('vehicleMac', value)
  },
  get vehicleVin() {
    return localStorage.getItem('vehicleVin')
  },
  set vehicleVin(value) {
    set('vehicleVin', value)
  },
  get vehicleName() {
    return localStorage.getItem('vehicleName')
  },
  set vehicleName(value) {
    set('vehicleName', value)
  },
  get vehicleModel() {
    return localStorage.getItem('vehicleModel')
  },
  set vehicleModel(value) {
    set('vehicleModel', value)
  },

  removeBinary: (key) => {
    try {
      rmSync({ path: `${key}.dat` })
    } catch (_e) {
      // ignore
    }
  },

  removeItem: (key) => {
    localStorage.removeItem(key)
  },

  reset() {
    localStorage.removeItem('vehicleName')
    localStorage.removeItem('vehicleModel')
    localStorage.removeItem('vehicleVin')
    localStorage.removeItem('vehicleMac')
    localStorage.removeItem('vehicleEcPublicKey')
    localStorage.removeItem('watchPublicKey')
    _doublingsTableCache = null
    this.removeBinary('vehicle_doublings_table')
    this.removeBinary('key_pool')
  },
}

export default store
