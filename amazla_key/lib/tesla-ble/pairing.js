import BLE from './index.js'
import store from '../store.js'
import { parsePairingResponse } from './protocol/vcsec-pairing.js'
import { decodeMessage } from './protocol/protobuf.js'
import { binaryStringToBytes, bytesToBinaryString } from './crypto/binary-utils.js'

// createPairingController orchestrates the full Tesla BLE pairing flow.
//
// phone:     Phone instance (provides pairSetup, completePairing, syncPool)
// callbacks:
//   onState(state)   — flow stage changed
//                      states: 'setup'|'scanning'|'connecting'|'pairing'|'confirming'|'verifying'|'done'
//   onLog(msg)       — optional debug/status message
//   onSuccess()      — all pairing artifacts saved, ready to use
//   onError(message) — unrecoverable failure
//
// Returns { start(), cancel() }
export function createPairingController(phone, { onState, onLog, onSuccess, onError }) {
  var cancelled = false
  var pairMsgBytes = null
  var verifyMsgBytes = null

  const log = (msg) => { if (onLog) onLog(msg) }

  function start() {
    cancelled = false
    BLE.reset()
    onState('setup')
    log('Setup...')

    phone.pairSetup((result) => {
      if (cancelled) return
      if (!result.success) { onError('Setup failed: ' + (result.error || '?')); return }
      pairMsgBytes = binaryStringToBytes(result.pairMsg)
      verifyMsgBytes = binaryStringToBytes(result.verifyMsg)
      log('Messages ready')
      scanAndConnect()
    })
  }

  function cancel() {
    cancelled = true
    try { BLE.stopScan() } catch (_e) {}
    try { BLE.disconnect() } catch (_e) {}
  }

  function scanAndConnect() {
    if (cancelled) return
    var savedMAC = store.vehicleMac
    if (savedMAC) {
      doConnect(savedMAC, 0)
      return
    }
    onState('scanning')
    log('Scanning 15s...')
    var foundMAC = null
    BLE.scan((result) => {
      if (cancelled) return
      if (result.type === 'found') {
        foundMAC = result.device.mac || null
        log('Found: ' + (result.device.name || '?'))
        BLE.stopScan()
        setTimeout(() => { doConnect(foundMAC, 0) }, 500)
      }
      if (result.type === 'complete' && !foundMAC) {
        if (!cancelled) onError('No Tesla found. Make sure your car is awake.')
      }
    }, 15000)
  }

  function doConnect(mac, attempt) {
    if (cancelled) return
    onState('connecting')
    log('Connecting ' + mac.slice(-8) + '...')
    BLE.connect(mac, (result) => {
      if (cancelled) return
      if (!result.success) {
        if (attempt < 1) {
          setTimeout(() => { doConnect(mac, attempt + 1) }, 2000)
          return
        }
        onError('Connection failed: ' + (result.error || 'check Bluetooth'))
        return
      }
      log('Connected')
      doPair()
    })
  }

  function doPair() {
    if (cancelled) return
    onState('pairing')
    log('TX pair msg [' + pairMsgBytes.length + 'b]')
    var sawTapRequired = false

    BLE.sendAndWaitForResponse(pairMsgBytes, (r) => {
      if (cancelled) return
      if (!r.success) {
        log('Pair timeout - trying verify')
        onState('verifying')
        setTimeout(doVerify, 1000)
        return
      }
      var parsed = parsePairingResponse(r.data)
      var dbg = parsed.dbg || {}
      log('RX: ' + parsed.status + (dbg.wlFault ? ' wl:' + dbg.wlFault : ''))

      if (parsed.status === 'ok') {
        if (sawTapRequired || dbg.hasSigner) {
          log('Paired!')
          onState('verifying')
          setTimeout(doVerify, 500)
        } else {
          onState('confirming')
          waitForNFC()
        }
        return
      }
      if (parsed.status === 'wait') { sawTapRequired = true; onState('confirming') }
      if (parsed.status === 'wait' || parsed.status === 'pending') waitForNFC()
      if (parsed.status === 'error') onError(parsed.error || 'Pairing error')
    }, 15000)

    function waitForNFC() {
      if (cancelled) return
      BLE.waitForNextResponse(60000, (r2) => {
        if (cancelled) return
        if (!r2.success) { onError('NFC tap timeout. Please try again.'); return }
        var p2 = parsePairingResponse(r2.data), d2 = p2.dbg || {}
        log('NFC: ' + p2.status + (d2.wlFault ? ' wl:' + d2.wlFault : ''))
        if (p2.status === 'wait')    { sawTapRequired = true; waitForNFC() }
        else if (p2.status === 'pending') { waitForNFC() }
        else if (p2.status === 'ok') {
          if (sawTapRequired || d2.hasSigner) {
            onState('verifying')
            setTimeout(doVerify, 500)
          } else { log('ok-skip(no tap): trying verify'); onState('verifying'); setTimeout(doVerify, 500) }
        }
        else if (p2.status === 'error') onError(p2.error || 'Pairing error')
      })
    }
  }

  function doVerify() {
    if (cancelled) return
    if (!BLE.isConnected) { onError('Connection lost. Please try again.'); return }
    onState('verifying')
    log('Querying whitelist...')

    function handleResponse(r, attempt) {
      if (cancelled) return
      if (!r.success) { onError('No response from Tesla. Try pairing again.'); return }
      var fields = decodeMessage(r.data)
      var fkeys = Object.keys(fields).join(',')
      if (fkeys === '3' && attempt < 5) {
        log('Ambient#' + (attempt + 1) + ' skip')
        BLE.waitForNextResponse(6000, (r2) => { handleResponse(r2, attempt + 1) })
        return
      }
      log('Parsing response...')
      phone.completePairing(bytesToBinaryString(r.data), (result) => {
        if (cancelled) return
        if (!result.success) { onError(result.error || 'Parse failed'); return }
        log('EC key + table saved')
        onState('done')
        onSuccess()
      })
    }

    BLE.sendAndWaitForResponse(verifyMsgBytes, (r) => { handleResponse(r, 0) }, 8000)
  }

  return { start, cancel }
}
