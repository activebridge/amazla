import teslaKeyfob from './keyfob'
import { store } from './utils'

const updateVehicle = (key, value) => {
  const vehicle = store.vehicle
  vehicle[key] = value
  store.vehicle = vehicle
}

const bleLock = async () => {
  if (!teslaKeyfob.getStatus().connected) {
    return { error: 'Not connected to Tesla via Bluetooth', status: 'disconnected' }
  }
  
  try {
    const result = await teslaKeyfob.lock()
    if (result.success) {
      updateVehicle('locked', true)
    }
    return result
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleUnlock = async () => {
  if (!teslaKeyfob.getStatus().connected) {
    return { error: 'Not connected to Tesla via Bluetooth', status: 'disconnected' }
  }
  
  try {
    const result = await teslaKeyfob.unlock()
    if (result.success) {
      updateVehicle('locked', false)
    }
    return result
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleConnect = async (macAddress) => {
  try {
    return await teslaKeyfob.connect(macAddress)
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleDisconnect = () => {
  teslaKeyfob.disconnect()
  return { success: true, message: 'Disconnected from Tesla' }
}

const bleScan = async () => {
  try {
    return await teslaKeyfob.scanForTesla()
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleAutoConnect = async () => {
  try {
    const connected = await teslaKeyfob.autoConnect()
    return { success: connected, message: connected ? 'Auto-connected' : 'No saved device' }
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleStatus = () => {
  return teslaKeyfob.getStatus()
}

const bleImportKeys = async (privateKeyPem, publicKeyPem) => {
  try {
    return await teslaKeyfob.importKeys(privateKeyPem, publicKeyPem)
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleSetKeysHex = (privateKeyHex, publicKeyHex) => {
  try {
    return teslaKeyfob.setKeysHex(privateKeyHex, publicKeyHex)
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleClearKeys = () => {
  try {
    return teslaKeyfob.clearKeys()
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const bleGetKeyInfo = () => {
  try {
    return teslaKeyfob.getKeyInfo()
  } catch (error) {
    return { error: error.message, status: 'failed' }
  }
}

const BleApi = {
  lock: bleLock,
  unlock: bleUnlock,
  connect: bleConnect,
  disconnect: bleDisconnect,
  scan: bleScan,
  autoConnect: bleAutoConnect,
  status: bleStatus,
  importKeys: bleImportKeys,
  setKeysHex: bleSetKeysHex,
  clearKeys: bleClearKeys,
  getKeyInfo: bleGetKeyInfo,
}

export default BleApi