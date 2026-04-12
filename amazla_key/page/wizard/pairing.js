import teslaBleApi, { teslaBLE } from '../../lib/tesla-ble/index.js'
import { parsePairingResponse } from '../../lib/tesla-ble/protocol/vcsec-pairing.js'
import { binaryStringToBytes, bytesToBinaryString } from '../../lib/tesla-ble/crypto/binary-utils.js'

function decodeRawFields(data) {
  var fields = {}, offset = 0
  while (offset < data.length) {
    var tag = 0, shift = 0
    while (offset < data.length) {
      var b = data[offset++]
      tag |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    var fieldNum = tag >> 3, wireType = tag & 7
    if (wireType === 0) {
      var val = 0; shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        val |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = val
    } else if (wireType === 2) {
      var len = 0; shift = 0
      while (offset < data.length) {
        var b = data[offset++]
        len |= (b & 0x7f) << shift
        if (!(b & 0x80)) break
        shift += 7
      }
      fields[fieldNum] = data.slice(offset, offset + len)
      offset += len
    } else { break }
  }
  return fields
}

// createPairingController orchestrates the full BLE pairing flow.
// - page: the BasePage instance (provides .request() for app-side RPC)
// - storage: the key-value storage object
// - onState(substate): called when the flow stage changes
//     substates: 'connecting' | 'pairing' | 'confirming' | 'verifying'
// - onSuccess(): called when all pairing artifacts are saved
// - onError(message): called on any unrecoverable failure
// Returns { start(), cancel() }
export const createPairingController = function(page, storage, onState, onSuccess, onError) {
  var cancelled = false

  function start() {
    cancelled = false
    teslaBleApi.reset()

    var ecKey  = storage.getItem('vehicle_ec_public_key')
    var table  = storage.getItem('vehicle_doublings_table')
    var mac    = storage.getItem('tesla_ble_mac') || teslaBleApi.savedMAC

    // EC key already fetched but table is missing — skip pairing entirely
    if (ecKey && !table) {
      onState('verifying')
      computeTableAndPool(ecKey)
      return
    }

    // Key may already be enrolled — skip pairing, just verify
    if (mac && storage.getItem('watch_public_key') && !ecKey) {
      onState('connecting')
      doConnect(mac, 0, doVerify)
      return
    }

    // Full flow
    onState('connecting')
    ensureWatchKey()
  }

  function cancel() {
    cancelled = true
    try { teslaBleApi.stopScan() } catch (e) {}
    try { teslaBleApi.disconnect() } catch (e) {}
  }

  // Step 1: ensure watch keypair exists, generate if missing
  function ensureWatchKey() {
    var existingKey = storage.getItem('watch_public_key')
    if (existingKey) {
      scanAndConnect()
      return
    }
    page.request({ method: 'BLE_SYNC_KEYS', params: { forceNew: false } })
      .then(function(result) {
        if (cancelled) return
        if (!result.success || !result.publicKeyBinary) {
          onError('Key generation failed')
          return
        }
        storage.setItem('watch_public_key', result.publicKeyBinary)
        scanAndConnect()
      })
      .catch(function(e) {
        if (!cancelled) onError('Key generation failed: ' + (e.message || '?'))
      })
  }

  // Step 2: find and connect to the vehicle
  function scanAndConnect() {
    if (cancelled) return
    var savedMAC = storage.getItem('tesla_ble_mac') || teslaBleApi.savedMAC
    if (savedMAC) {
      doConnect(savedMAC, 0)
      return
    }
    var foundMAC = null
    teslaBleApi.scan(function(result) {
      if (cancelled) return
      if (result.type === 'found') {
        foundMAC = result.device.mac || null
        teslaBleApi.stopScan()
        setTimeout(function() { doConnect(foundMAC, 0) }, 500)
      }
      // Only report "not found" if scan completed without ever finding a device
      if (result.type === 'complete' && !foundMAC) {
        if (!cancelled) onError('No Tesla found. Make sure your car is awake.')
      }
    }, 15000)
  }

  function doConnect(mac, attempt) {
    if (cancelled) return
    teslaBleApi.connect(mac, function(result) {
      if (cancelled) return
      if (!result.success) {
        if (attempt < 1) {
          setTimeout(function() { doConnect(mac, attempt + 1) }, 2000)
          return
        }
        onError('Connection failed: ' + (result.error || 'check Bluetooth'))
        return
      }
      doPair()
    }, storage)
  }

  // Step 3: send pairing message and wait for key card tap
  function doPair() {
    if (cancelled) return
    onState('pairing')
    var watchKey = storage.getItem('watch_public_key')
    if (!watchKey) { onError('No watch key. Please try again.'); return }

    page.request({ method: 'BLE_PAIR', params: { publicKeyBinary: watchKey } })
      .then(function(result) {
        if (cancelled) return
        if (!result.success) {
          onError('Pair request failed: ' + (result.error || '?'))
          return
        }
        var msgBytes = binaryStringToBytes(result.message)
        var sawTapRequired = false

        // Prompt user to tap NFC card while we wait for the vehicle's first response
        onState('confirming')

        teslaBLE.sendAndWaitForResponse(msgBytes, function(r) {
          if (cancelled) return
          if (!r.success) {
            // Timeout — vehicle may have accepted already, try verify
            doVerify()
            return
          }
          var parsed = parsePairingResponse(r.data)
          var dbg = parsed.dbg || {}
          if (parsed.status === 'ok') {
            if (sawTapRequired || dbg.hasSigner) {
              doVerify()
            } else {
              waitForResult(0)
            }
          } else if (parsed.status === 'wait') {
            sawTapRequired = true
            waitForResult(0)
          } else if (parsed.status === 'pending') {
            waitForResult(0)
          } else if (parsed.status === 'error') {
            onError(parsed.error || 'Pairing error')
          }
        }, 15000)

        function waitForResult(attempts) {
          if (cancelled) return
          if (attempts >= 10) {
            onError('NFC card not detected. Hold the card on the steering column.')
            return
          }
          teslaBLE.waitForNextResponse(60000, function(r2) {
            if (cancelled) return
            if (!r2.success) {
              onError('NFC card not detected. Hold the card on the steering column.')
              return
            }
            var p2 = parsePairingResponse(r2.data), d2 = p2.dbg || {}
            if (p2.status === 'wait') { sawTapRequired = true; waitForResult(attempts + 1) }
            else if (p2.status === 'pending') { waitForResult(attempts + 1) }
            else if (p2.status === 'ok') {
              if (sawTapRequired || d2.hasSigner) {
                doVerify()
              } else {
                waitForResult(attempts + 1)
              }
            } else if (p2.status === 'error') {
              onError(p2.error || 'Pairing error')
            }
          })
        }
      })
      .catch(function(err) {
        if (!cancelled) onError('Pair failed: ' + (err.message || '?'))
      })
  }

  function normalizeVehicleKeyBinary(keyData) {
    if (typeof keyData !== 'string') return null
    if (keyData.length === 65) return keyData
    if (keyData.length === 130) {
      const out = new Uint8Array(65)
      for (var i = 0; i < 65; i++) {
        const byteHex = keyData.substr(i * 2, 2)
        const n = parseInt(byteHex, 16)
        if (isNaN(n)) return null
        out[i] = n
      }
      return bytesToBinaryString(out)
    }
    return null
  }

  // Compute doublings table and generate key pool from a known EC public key binary string.
  // Called from doVerify() after fetching the key, or directly on retry when the
  // EC key is already saved but the table is missing.
  function computeTableAndPool(ecKeyBinaryOrHex) {
    if (cancelled) return
    var vehiclePublicKeyBinary = normalizeVehicleKeyBinary(ecKeyBinaryOrHex)
    if (!vehiclePublicKeyBinary) {
      onError('Invalid vehicle public key format. Re-pair with vehicle.')
      return
    }
    page.request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyBinary: vehiclePublicKeyBinary } })
      .then(function(r) {
        if (cancelled) return
        if (!r.success || !r.table) {
          onError('Failed to compute session table. Please try again.')
          throw new Error('handled')
        }
        try {
          storage.setItem('vehicle_ec_public_key', vehiclePublicKeyBinary)
          storage.setItem('vehicle_doublings_table', r.table)
        } catch (e) {
          onError('Failed to save session table. Check watch storage.')
          throw new Error('handled')
        }
        return page.request({ method: 'BLE_GENERATE_SESSION_KEYS', params: { count: 20 } })
      })
      .then(function(r) {
        if (cancelled) return
        if (r && r.success && r.pool) {
          try { storage.setItem('key_pool', r.pool) } catch (e) {}
        }
        onSuccess()
      })
      .catch(function(e) {
        if (e.message === 'handled') return
        if (!cancelled) onError('Setup failed: ' + (e.message || '?'))
      })
  }

  // Step 4: verify enrollment, fetch vehicle EC key, compute table, generate pool
  function doVerify() {
    if (cancelled) return
    if (!teslaBleApi.isConnected()) {
      onError('Connection lost. Please try again.')
      return
    }
    onState('verifying')
    var watchKey = storage.getItem('watch_public_key')
    if (!watchKey) { onError('No watch key'); return }

    page.request({ method: 'BLE_VERIFY_PAIR', params: { publicKeyBinary: watchKey } })
      .then(function(result) {
        if (cancelled) return
        if (!result.success) {
          onError('Verify failed: ' + (result.error || '?'))
          return
        }
        var msgBytes = binaryStringToBytes(result.message)

        function handleQueryResponse(r, attempt) {
          if (cancelled) return
          if (!r.success) {
            onError('No response from Tesla. Try pairing again.')
            return
          }
          var fields = decodeRawFields(r.data)
          var fkeys = Object.keys(fields).join(',')
          // Field 3 alone = ambient/heartbeat message, skip up to 3 times
          if (fkeys === '3' && attempt < 3) {
            teslaBLE.waitForNextResponse(6000, function(r2) { handleQueryResponse(r2, attempt + 1) })
            return
          }
          if (!fields[17]) {
            onError('Key not enrolled. Tap your NFC card on the steering column, then confirm on the Tesla screen.')
            return
          }
          var ecKey = null
          var wei = decodeRawFields(fields[17])
          if (wei[2]) {
            var pk = decodeRawFields(wei[2])
            if (pk[1] && pk[1].length === 65) ecKey = pk[1]
          }
          if (!ecKey) {
            onError('Could not read vehicle key. Please try again.')
            return
          }
          var ecKeyBinary = bytesToBinaryString(ecKey)
          try {
            storage.setItem('vehicle_ec_public_key', ecKeyBinary)
          } catch (e) {
            onError('Failed to save vehicle key. Check watch storage.')
            return
          }

          computeTableAndPool(ecKeyBinary)
        }

        teslaBLE.sendAndWaitForResponse(msgBytes, function(r) { handleQueryResponse(r, 0) }, 8000)
      })
      .catch(function(err) {
        if (!cancelled) onError('Verify failed: ' + (err.message || '?'))
      })
  }

  return { start, cancel }
}
