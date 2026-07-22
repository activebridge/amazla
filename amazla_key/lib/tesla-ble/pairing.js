import BLE from './index.js'
import teslaSession from './session.js'
import store from '../store.js'
import { computeTeslaBLEName } from './ble-name.js'
import { parsePairingResponse } from './protocol/vcsec-pairing.js'
import { decodeMessage } from './protocol/protobuf.js'
import { binaryStringToBytes, bytesToBinaryString } from './crypto/binary-utils.js'

// createPairingController orchestrates the full Tesla BLE pairing flow.
//
// phone:     Phone instance (provides pairSetup, completePairing)
// callbacks:
//   onState(state)   — flow stage changed
//                      states: 'setup'|'scanning'|'connecting'|'pairing'|'confirming'|'verifying'|'done'
//   onLog(msg)       — optional debug/status message
//   onSuccess()      — all pairing artifacts saved, ready to use
//   onError(message) — unrecoverable failure
//
// Returns { start(), cancel() }
// Max silence (no car frame) during the keycard-tap wait before we give up. This
// re-arms on every incoming frame, and the car streams status ~1×/s while waiting
// for the tap — so this isn't the human's tap budget, it's how long the car can go
// FULLY silent (dropped link) before we surface "tap timeout". 30s: ample for a human
// tap even on a car that goes quiet, half the old 60s dead-link stare on the NFC screen.
const NFC_TAP_TIMEOUT_MS = 30000

export function createPairingController(phone, { onState, onLog, onSuccess, onError }) {
  var cancelled = false
  var pairMsgBytes = null
  var verifyMsgBytes = null

  const log = (msg) => { if (onLog) onLog(msg) }

  // Raw frame dump for offline decoding. The pairing status frames are the only
  // evidence of what the car actually said (the 12B "auto-approved" frame and the
  // 82B whitelist response are currently interpreted on faith — device 2026-07-15:
  // a key that unlocked the car during the pairing connection came back
  // KEY_NOT_ON_WHITELIST on the next one). Frames are ≤90B, so this is cheap.
  const hex = (b) => {
    if (!b) return '(null)'
    var s = ''
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16)
    return s
  }

  // Post-enroll session-key derivation with retries. The car signs SessionInfo
  // for a fresh key only after its whitelist settles (~seconds); until then the
  // response is tag-less and derivation fails. 4 attempts × 2s covers the window
  // seen on device (signed on attempt 2, ~1s after enrollment). Exhausted retries
  // fall back to the old skip: pairing still succeeds, key derives on a later
  // CONNECT (the main page's isPaired routing sends the user back here otherwise,
  // so the retries are what make pairing reliably terminal).
  const SESSION_DERIVE_ATTEMPTS = 4
  const SESSION_DERIVE_DELAY_MS = 2000

  // Initial-connect resilience. The native GATT stack can wedge during CCCD setup on
  // the first dials of a pairing run (device 2026-07-22: repeated cccdWritten=false /
  // descriptor-write timeouts that only an app relaunch cleared). Re-dialing into the
  // same wedged stack keeps failing — so on each failed connect we run the session
  // watchdog's proven wedge-recovery (disconnect + native flush + settle) before the
  // next dial, and allow more attempts than the old 2 so a run rides out the flakiness
  // instead of erroring and making the user re-tap. 4 dials × recovery covers what was
  // seen on device (a clean CCCD landed by the 2nd–3rd dial once the stack was flushed).
  const CONNECT_ATTEMPTS = 4
  const CONNECT_RECYCLE_SETTLE_MS = 800

  function deriveSessionKey(attempt) {
    if (cancelled) { BLE.suppressDeadLink(false); return }
    // The car drops the link right after enrollment and stays silent while we re-dial
    // for a signed SessionInfo. Gate off the BLE dead-link silence watchdog for this
    // whole window so that expected quiet isn't torn down as a dropped link mid-derive
    // (device 2026-07-22: watchdog from 02d29e3 tore the link, every attempt failed,
    // pairing bounced to the start screen). Cleared on every terminal exit below.
    BLE.suppressDeadLink(true)
    teslaSession.requestSessionInfo((sr) => {
      if (cancelled) { BLE.suppressDeadLink(false); return }
      if (sr && sr.success) {
        BLE.suppressDeadLink(false)
        log('✓ Session key derived — standalone')
        onState('done')
        onSuccess()
        return
      }
      if (attempt + 1 < SESSION_DERIVE_ATTEMPTS) {
        log('Session derive attempt ' + (attempt + 1) + ' failed (' + ((sr && sr.error) || '?') + ') — retrying in ' + SESSION_DERIVE_DELAY_MS + 'ms')
        setTimeout(() => { deriveSessionKey(attempt + 1) }, SESSION_DERIVE_DELAY_MS)
        return
      }
      BLE.suppressDeadLink(false)
      log('Session key derivation skipped: ' + ((sr && sr.error) || '?') + ' (will retry on CONNECT)')
      onState('done')
      onSuccess()
    })
  }

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
    try { BLE.suppressDeadLink(false) } catch (_e) {}
    try { BLE.stopScan() } catch (_e) {}
    try { BLE.disconnect() } catch (_e) {}
  }

  function scanAndConnect() {
    if (cancelled) return
    // Always scan, never trust a cached MAC: Tesla rotates its BLE address
    // every ~15 min. Mirrors Tesla Go SDK's VehicleLocalName → scan → dial
    // flow. The exact-name filter pins us to the right car even if other
    // Teslas are nearby. See README "Scan-by-name on every connect".
    var vinBytes = store.vehicleVin
    var expectedName = vinBytes ? computeTeslaBLEName(vinBytes) : null
    if (!expectedName) {
      onError('VIN not set. Open Settings and enter the vehicle VIN.')
      return
    }
    onState('scanning')
    log('Scanning 15s for ' + expectedName + '...')
    var foundMAC = null
    BLE.scan((result) => {
      if (cancelled) return
      if (result.type === 'found') {
        foundMAC = result.device.mac || null
        log('Found: ' + (result.device.name || '?'))
        BLE.stopScan()
        // Refresh the cached MAC opportunistically — it's a hint for the UI
        // only; session never trusts it across the rotation window.
        if (foundMAC && foundMAC !== store.vehicleMac) store.vehicleMac = foundMAC
        setTimeout(() => { doConnect(foundMAC, 0) }, 500)
      }
      if (result.type === 'complete' && !foundMAC) {
        if (!cancelled) onError('No Tesla found. Make sure your car is awake and the VIN in Settings is correct.')
      }
    }, 15000, expectedName)
  }

  function doConnect(mac, attempt) {
    if (cancelled) return
    onState('connecting')
    log('Connecting ' + mac.slice(-8) + '...')
    BLE.connect(mac, (result) => {
      if (cancelled) return
      if (!result.success) {
        if (attempt + 1 < CONNECT_ATTEMPTS) {
          // Wedge recovery before re-dialing — mirrors session.js Tier-1 recycle so a
          // stuck native GATT stack is cleared in-app instead of re-dialing into it.
          log('Connect failed (' + (result.error || '?') + ') — flushing + re-dialing (' + (attempt + 2) + '/' + CONNECT_ATTEMPTS + ')')
          try { BLE.disconnect() } catch (_e) {}
          try { BLE.flushNative() } catch (_e) {}
          setTimeout(() => { doConnect(mac, attempt + 1) }, CONNECT_RECYCLE_SETTLE_MS)
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
      log('RX: ' + parsed.status + (dbg.wlFault ? ' wl:' + dbg.wlFault : '') + ' hex=' + hex(r.data))

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
      // Show the "tap your key card on the console" screen while we wait for the tap.
      // Some cars (device-confirmed 2026-07-14) never send an explicit WAIT status —
      // they stream 'pending' and prompt on the car's own screen — so gating the NFC
      // screen on WAIT left the watch stuck on the generic pairing spinner. Every path
      // into the tap-wait goes through here; onState is idempotent (setScreen guards
      // unchanged states, so no re-buzz).
      onState('confirming')
      BLE.waitForNextResponse(NFC_TAP_TIMEOUT_MS, (r2) => {
        if (cancelled) return
        if (!r2.success) { onError('NFC tap timeout. Please try again.'); return }
        var p2 = parsePairingResponse(r2.data), d2 = p2.dbg || {}
        log('NFC: ' + p2.status + (d2.wlFault ? ' wl:' + d2.wlFault : '') + ' hex=' + hex(r2.data))
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
      log('Verify RX (fields:' + fkeys + ') hex=' + hex(r.data))
      log('Parsing response...')
      phone.completePairing(bytesToBinaryString(r.data), (result) => {
        if (cancelled) return
        if (!result.success) { onError(result.error || 'Parse failed'); return }
        log('Pair OK, deriving session key now')
        // Reuse the live BLE connection + in-range phone: do the SessionInfo
        // exchange right away so the phone-computed ECDH (computeSharedSecret)
        // runs and the session key gets cached while we have both. After this the
        // watch is fully standalone for subsequent CONNECTs (cached key, no phone).
        //
        // RETRY LOOP (device 2026-07-15): the car often refuses to SIGN SessionInfo
        // for a freshly enrolled key — the first answer comes back tag-less (141B,
        // "Unauthenticated SessionInfo") and a repeat a couple of seconds later is
        // signed (175B). One-shot derivation made pairing success a coin flip.
        // requestSessionInfo re-dials internally if the car dropped the link, so
        // each retry survives the post-enrollment disconnect too.
        deriveSessionKey(0)
      })
    }

    BLE.sendAndWaitForResponse(verifyMsgBytes, (r) => { handleResponse(r, 0) }, 8000)
  }

  return { start, cancel }
}
