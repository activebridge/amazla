import { readFileSync, writeFileSync } from '@zos/fs'
import { LocalStorage } from '@zos/storage'

const localStorage = new LocalStorage()

const readBinary = (path) => {
  try {
    const raw = readFileSync({ path: `${path}.dat` })
    if (raw) return new Uint8Array(raw)
  } catch (_e) {
    return null
  }
}

const writeBinary = (path, bytes) => {
  bytes &&
    writeFileSync({
      path: `${path}.dat`,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
}

export default {
  get watchPublicKey() {
    return readBinary('watch_public_key')
  },
  set watchPublicKey(value) {
    writeBinary('watch_public_key', value)
  },
  get vehicleEcPublicKey() {
    return readBinary('vehicle_ec_public_key')
  },
  set vehicleEcPublicKey(value) {
    writeBinary('vehicle_ec_public_key', value)
  },
  get vehicleDoublingsTable() {
    return readBinary('vehicle_doublings_table')
  },
  set vehicleDoublingsTable(value) {
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
    localStorage.setItem('vehicleMac', value)
  },
  get vehicleVin() {
    return localStorage.getItem('vehicleVin')
  },
  set vehicleVin(value) {
    localStorage.setItem('vehicleVin', value)
  },
  get vehicleName() {
    return localStorage.getItem('vehicleName')
  },
  set vehicleName(value) {
    localStorage.setItem('vehicleName', value)
  },
  get vehicleModel() {
    return localStorage.getItem('vehicleModel')
  },
  set vehicleModel(value) {
    localStorage.setItem('vehicleModel', value)
  },

  removeBinary: (key) => writeBinary(key, new Uint8Array(0)),
  removeItem: (key) => localStorage.removeItem(key),
}
