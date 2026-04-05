import * as hmUI from '@zos/ui'
import { BasePage } from '@zeppos/zml/base-page'
import { keepScreenOn } from '../../../zeppify/index.js'
import teslaBleApi, { teslaBLE } from '../../lib/tesla-ble/index.js'
import { parsePairingResponse } from '../../lib/tesla-ble/protocol/vcsec.js'
import { writeFileSync, readFileSync } from '@zos/fs'

// Lightweight inline storage (shares ble_settings.txt with ble-service)
var storage = {
  data: {},
  load: function() {
    try {
      var json = readFileSync({ path: 'ble_settings.txt', options: { encoding: 'utf8' } })
      this.data = json ? JSON.parse(json) : {}
    } catch (e) { this.data = {} }
  },
  save: function() {
    try {
      writeFileSync({ path: 'ble_settings.txt', data: JSON.stringify(this.data), options: { encoding: 'utf8' } })
    } catch (e) {}
  },
  getItem: function(key) { return this.data[key] || null },
  setItem: function(key, val) { this.data[key] = val; this.save() },
  removeItem: function(key) { delete this.data[key]; this.save() }
}

function hexToBytes(hex) {
  var bytes = new Uint8Array(hex.length / 2)
  for (var i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

// Dump first n bytes of a Uint8Array as compact hex
function dumpHex(bytes, n) {
  if (!bytes) return 'null'
  var s = ''
  var limit = Math.min(bytes.length, n || 10)
  for (var i = 0; i < limit; i++) {
    s += ('0' + bytes[i].toString(16)).slice(-2)
  }
  if (bytes.length > limit) s += '..'
  return s
}

// ── state ────────────────────────────────────────────────────────────────────
var state = 'IDLE'   // IDLE|SCANNING|CONNECTING|PAIRING|WAITING_KEYCARD|DONE
var foundMAC = null
var logLines  = ['', '', '', '', '', '', '', '']
var logColors = [0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666, 0x666666]

var statusDotWidget  = null
var statusTextWidget = null
var deviceInfoWidget = null
var logWidgets       = []
var currentPage      = null

// ── helpers ──────────────────────────────────────────────────────────────────
function addLog(msg, color) {
  console.log('[BLE]', msg)  // Also log to console
  var s = msg.length > 36 ? msg.slice(0, 36) : msg
  for (var i = 0; i < 7; i++) {
    logLines[i]  = logLines[i + 1]
    logColors[i] = logColors[i + 1]
  }
  logLines[7]  = s
  logColors[7] = color || 0x666666
  for (var j = 0; j < 8; j++) {
    if (logWidgets[j]) {
      logWidgets[j].setProperty(hmUI.prop.TEXT,  logLines[j])
      logWidgets[j].setProperty(hmUI.prop.COLOR, logColors[j])
    }
  }
}

function updateStatus(label, dotColor) {
  if (statusDotWidget)  statusDotWidget.setProperty(hmUI.prop.COLOR,  dotColor)
  if (statusTextWidget) {
    statusTextWidget.setProperty(hmUI.prop.TEXT,  label)
    statusTextWidget.setProperty(hmUI.prop.COLOR, dotColor)
  }
}

function updateDeviceInfo() {
  var s        = teslaBleApi.getStatus()
  var watchKey = getWatchPublicKey()
  var keyPart  = watchKey ? watchKey.slice(2, 10) : '--------'
  var savePart = (s.savedMAC && s.savedMAC.length >= 8) ? s.savedMAC.slice(-8) : '--------'
  var nowPart  = (s.mac && s.mac.length >= 8)           ? s.mac.slice(-8)      : '--------'
  if (deviceInfoWidget) deviceInfoWidget.setProperty(hmUI.prop.TEXT,
    'KEY:' + keyPart + ' SAVE:' + savePart + ' NOW:' + nowPart)
}

function getWatchPublicKey() {
  return storage.getItem('watch_public_key') || null
}

// ── pair flow ─────────────────────────────────────────────────────────────────
// Mirrors Tesla Go SDK exactly:
//   1. doPair()  — fire-and-forget SendAddKeyRequest (ToVCSECMessage, PRESENT_KEY)
//                  Tell user to watch car touchscreen and tap NFC key card.
//   2. doVerify() — on second PAIR press: query VCSEC whitelist for our key.
//                   Car returns whitelistEntryInfo (enrolled) or ERROR (not enrolled).

function doPair() {
  state = 'PAIRING'
  updateStatus('PAIRING...', 0xffcc00)
  addLog('Requesting pair msg...', 0xcccccc)
  console.log('[BLE] ▶ Starting pairing flow')

  var watchKey = getWatchPublicKey()
  if (!watchKey) {
    state = 'IDLE'
    updateStatus('ERROR - no key', 0xff4444)
    addLog('No watch public key', 0xff4444)
    console.log('[BLE] ✗ No watch public key in storage')
    return
  }
  console.log('[BLE] Using watch public key: ' + watchKey.slice(0, 16) + '...')

  currentPage.request({ method: 'BLE_PAIR', params: { publicKeyHex: watchKey } })
    .then(function(result) {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog('Pair msg err: ' + (result.error || '?'), 0xff4444)
        console.log('[BLE] ✗ Failed to build pairing message: ' + result.error)
        return
      }
      var msgBytes = hexToBytes(result.messageHex)
      console.log('[BLE] Built pairing message (' + msgBytes.length + ' bytes)')
      addLog('TX[' + msgBytes.length + ']:' + dumpHex(msgBytes, 6), 0xaaaaaa)

      var sawTapRequired = false

      console.log('[BLE] Sending pairing request, waiting for response...')
      teslaBLE.sendAndWaitForResponse(msgBytes, function(r) {
        if (!r.success) {
          console.log('[BLE] ⚠ No response from vehicle (timeout) - but key may still be enrolled')
          addLog('PRX:timeout', 0x888888)
          // Even if response times out, the vehicle may have processed the AddKeyRequest
          // and enrolled the key. Attempt to fetch EC key via GetWhitelistEntryInfo anyway.
          addLog('Trying to fetch EC key...', 0xff8800)
          var watchKey2 = getWatchPublicKey()
          if (watchKey2) {
            console.log('[BLE] Attempting to fetch EC key despite response timeout...')
            state = 'DONE'
            updateStatus('Fetch EC key', 0xffcc00)
            setTimeout(function() { doVerify() }, 1000)
          }
          return
        }
        console.log('[BLE] Received pairing response (' + r.data.length + ' bytes)')
        addLog('RX[' + r.data.length + ']:' + dumpHex(r.data, 8), 0x888888)
        var parsed = parsePairingResponse(r.data)
        var dbg = parsed.dbg || {}
        var wlStr = dbg.wlFault ? ' wl:' + dbg.wlFault : ''
        var pathStr = dbg.path ? ' p:' + dbg.path : ''
        var keysStr = dbg.outerKeys ? ' k:' + dbg.outerKeys : ''
        addLog('PRX:' + parsed.status + wlStr + pathStr, 0x4488ff)
        addLog(keysStr || 'no keys', 0x666666)
        console.log('[BLE] Pairing response status: ' + parsed.status + ', wlFault: ' + (dbg.wlFault || 'none'))

        if (parsed.status === 'ok') {
          console.log('[BLE] ✓ Pairing status OK - AddKeyResponse received')
          if (sawTapRequired || dbg.hasSigner) {
            console.log('[BLE] ✓ Got tap/signer signal - key enrolled on vehicle')
            
            // Per Tesla SDK: EC key is obtained via KeyInfoBySlot (GetWhitelistEntryInfo),
            // never from the AddKeyRequest response. Always fetch it now.
            addLog('⚠ Fetching EC key...', 0xff8800)
            var watchKey2 = getWatchPublicKey()
            if (watchKey2) {
              console.log('[BLE] Pairing step 1 complete. Step 2: Requesting vehicle EC key via GetWhitelistEntryInfo(slot=0)...')
              state = 'DONE'
              updateStatus('PAIRED!', 0x00cc44)
              addLog('✓ Paired!', 0x44ff44)
              setTimeout(function() { doVerify() }, 500)
            } else {
              console.log('[BLE] ✗ No watch public key available for EC key fetch')
              addLog('⚠ No watch key', 0xff8800)
            }
          } else {
            console.log('[BLE] Ignoring false positive (no tap signal)')
            addLog('Waiting for tap...', 0xff8800)
            waitForResult()
          }
          return
        }

        if (parsed.status === 'wait') {
          console.log('[BLE] Vehicle waiting for NFC tap')
          sawTapRequired = true
        }

        if (parsed.status === 'wait' || parsed.status === 'pending') {
          console.log('[BLE] Waiting for next response...')
          waitForResult()
        }
      }, 15000)

      // Loops until ok (with valid tap/signer), error, or 60s timeout.
      // No depth limit — car may push many intermediate notifications.
      // sawTapRequired is captured by closure from the outer doPair() scope.
      function waitForResult() {
        teslaBLE.waitForNextResponse(60000, function(r2) {
          if (!r2.success) {
            addLog('NFC timeout', 0x888888)
            addLog('(press PAIR to verify)', 0x666666)
            return
          }
          addLog('RX[' + r2.data.length + ']:' + dumpHex(r2.data, 8), 0x888888)
          var p2 = parsePairingResponse(r2.data)
          var d2 = p2.dbg || {}
          var wl2 = d2.wlFault ? ' wl:' + d2.wlFault : ''
          addLog('NFC:' + p2.status + wl2 + (d2.path ? ' p:' + d2.path : ''), 0x4488ff)

          if (p2.status === 'wait') {
            sawTapRequired = true
            waitForResult()
          } else if (p2.status === 'pending') {
            waitForResult()
          } else if (p2.status === 'ok') {
            if (sawTapRequired || d2.hasSigner) {
              console.log('[BLE] Got status=ok with tap/signer signal - pairing complete')
              console.log('[BLE] Per Tesla SDK: EC key fetched via GetWhitelistEntryInfo, not pairing response')
              state = 'DONE'
              updateStatus('PAIRED!', 0x00cc44)
              addLog('Key enrolled!', 0x00cc44)
              
              // Fetch the EC key after pairing completes
              var watchKey3 = getWatchPublicKey()
              if (watchKey3) {
                console.log('[BLE] Pairing complete, now fetching vehicle EC key via GetWhitelistEntryInfo...')
                setTimeout(function() { doVerify() }, 500)
              }
            } else {
              addLog('NFC:ok-skip(no tap)', 0xff8800)
              waitForResult()
            }
          } else if (p2.status === 'error') {
            state = 'IDLE'
            updateStatus('PAIR ERROR', 0xff4444)
            addLog(p2.error || 'Error', 0xff4444)
          }
        })
      }

      state = 'WAITING_KEYCARD'
      updateStatus('TAP KEY CARD', 0xff4444)
      addLog('TAP KEY CARD', 0xff4444)
      addLog('on center console!', 0xff8800)
      addLog('then press PAIR to verify', 0x888888)
    })
    .catch(function(err) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Exc: ' + (err.message || '?'), 0xff4444)
    })
}

function doVerify() {
  if (!teslaBleApi.isConnected()) {
    state = 'IDLE'
    updateStatus('CONN LOST', 0xff4444)
    addLog('BLE dropped.', 0xff8800)
    addLog('Reconnect & retry', 0xff8800)
    return
  }
  updateStatus('QUERYING...', 0xffcc00)
  addLog('Querying whitelist...', 0xcccccc)
  console.log('[BLE] ▶ Starting GetWhitelistEntryInfo query')

  var watchKey = getWatchPublicKey()
  if (!watchKey) {
    state = 'IDLE'
    updateStatus('ERROR - no key', 0xff4444)
    addLog('No watch key', 0xff4444)
    console.log('[BLE] ✗ No watch public key in storage')
    return
  }

  currentPage.request({ method: 'BLE_VERIFY_PAIR', params: { publicKeyHex: watchKey } })
    .then(function(result) {
      if (!result.success) {
        state = 'IDLE'
        updateStatus('ERROR', 0xff4444)
        addLog('Query build err: ' + (result.error || '?'), 0xff4444)
        return
      }
      var msgBytes = hexToBytes(result.messageHex)
      addLog('QTX[' + msgBytes.length + ']:' + dumpHex(msgBytes, 6), 0xaaaaaa)

      function handleQueryResponse(r, attempt) {
        if (!r.success) {
          state = 'IDLE'
          updateStatus('NO RESPONSE', 0xff8800)
          addLog('Query timeout', 0xff8800)
          console.log('[BLE] ✗ Query response timeout (attempt ' + (attempt + 1) + ')')
          return
        }
        var rx = r.data
        console.log('[BLE] Got query response (' + rx.length + ' bytes)')
        addLog('QRX[' + rx.length + ']:' + dumpHex(rx, 6), 0x4488ff)

        var fields = decodeRawFields(rx)
        var fkeys = Object.keys(fields).join(',')
        addLog('f:' + fkeys, 0x4488ff)
        console.log('[BLE] Response fields: ' + fkeys)

        // Field 3 only = keychainStatus push (car sends on CCCD enable and occasionally).
        // Skip up to 3 ambients and wait for the real query response.
        if (fkeys === '3' && attempt < 3) {
          console.log('[BLE] Ambient push #' + (attempt + 1) + ' - skipping...')
          addLog('Ambient#' + (attempt + 1) + ' skip', 0x888888)
          teslaBLE.waitForNextResponse(6000, function(r2) {
            handleQueryResponse(r2, attempt + 1)
          })
          return
        }

        if (fkeys === '3') {
          // Still only field 3 after 3 retries — car never responded to query
          state = 'IDLE'
          updateStatus('NO QUERY RESP', 0xff8800)
          addLog('Only ambients,', 0xff8800)
          addLog('no query resp', 0xff8800)
          console.log('[BLE] ✗ Only ambient pushes received, vehicle not responding to query')
          return
        }

        if (fields[17]) {
          // whitelistEntryInfo (field 17) present — our key is in the whitelist
          console.log('[BLE] ✓ Got whitelistEntryInfo in response - key is enrolled!')
          
          // Field 17 = WhitelistEntryInfo protobuf message (Tesla SDK vcsec.proto)
          // WhitelistEntryInfo structure:
          //   field 1: KeyIdentifier (keyId)
          //   field 2: PublicKey message (contains the EC key)
          //   field 4: KeyMetadata
          //   field 6: uint32 slot
          //   field 7: Keys.Role keyRole
          //
          // PublicKey structure:
          //   field 1: bytes PublicKeyRaw (the 65-byte EC key)
          //
          // So: field 17 → decode → field 2 (PublicKey) → decode → field 1 (EC key)
          
          var f17bytes = fields[17]
          var ecKey = null
          
          if (f17bytes) {
            // Parse the WhitelistEntryInfo message inside field 17
            var whitelistEntryInfo = decodeRawFields(f17bytes)
            var weiFields = Object.keys(whitelistEntryInfo).join(',')
            console.log('[BLE] WhitelistEntryInfo fields: ' + weiFields)
            
            // Field 2 of WhitelistEntryInfo is the PublicKey message
            if (whitelistEntryInfo[2]) {
              var publicKeyMsg = whitelistEntryInfo[2]
              console.log('[BLE] Field 2 (PublicKey message): ' + publicKeyMsg.length + ' bytes')
              
              // Decode the PublicKey message to extract field 1 (PublicKeyRaw)
              var publicKey = decodeRawFields(publicKeyMsg)
              var pkFields = Object.keys(publicKey).join(',')
              console.log('[BLE] PublicKey fields: ' + pkFields)
              
              // Field 1 of PublicKey is the actual 65-byte EC key
              if (publicKey[1] && publicKey[1].length === 65) {
                ecKey = publicKey[1]
                console.log('[BLE] ✓ Found EC key in WhitelistEntryInfo.field2.field1 (65 bytes)')
              } else if (publicKey[1]) {
                console.log('[BLE] ⚠ PublicKey.field1 exists but is ' + publicKey[1].length + ' bytes (expected 65)')
              } else {
                console.log('[BLE] ⚠ No field 1 in PublicKey message')
              }
            } else {
              console.log('[BLE] ⚠ WhitelistEntryInfo missing field 2 (PublicKey)')
            }
            
            if (!ecKey) {
              console.log('[BLE] ⚠ Could not extract EC key from WhitelistEntryInfo')
              // Debug: show all fields from first decode
              for (var f in whitelistEntryInfo) {
                var val = whitelistEntryInfo[f]
                var info = ''
                if (val && val.length !== undefined) {
                  info = val.length + ' bytes'
                } else if (typeof val === 'number') {
                  info = 'number: ' + val
                } else {
                  info = 'type: ' + typeof val
                }
                console.log('[BLE]   WhitelistEntryInfo[' + f + ']: ' + info)
              }
            }
          }
          
          if (ecKey && ecKey.length === 65) {
            var ecKeyHex = ''
            for (var i = 0; i < ecKey.length; i++) {
              ecKeyHex += ('0' + ecKey[i].toString(16)).slice(-2)
            }
            storage.setItem('vehicle_ec_public_key', ecKeyHex)
            console.log('[BLE] ✓ Extracted EC key from whitelist response: ' + ecKeyHex.slice(0, 16) + '...')
            addLog('✓ Got EC key!', 0x44ff44)
            
            // Request ECDH table precomputation
            addLog('Computing table...', 0x666666)
            console.log('[BLE] Requesting ECDH doublings table...')
            currentPage.request({ method: 'BLE_PRECOMPUTE_TABLE', params: { vehiclePublicKeyHex: ecKeyHex } })
              .then(function(r) {
                if (r.success && r.table) {
                  storage.setItem('vehicle_doublings_table', r.table)
                  addLog('✓ Saved table', 0x44ff44)
                  console.log('[BLE] ✓ ECDH table stored (' + r.table.length + ' chars)')
                } else {
                  addLog('⚠ Table failed', 0xffaa44)
                  console.log('[BLE] ⚠ Table generation failed: ' + (r.error || 'unknown'))
                }
              })
              .catch(function(e) {
                addLog('⚠ Table error', 0xff8844)
                console.log('[BLE] ⚠ Table error: ' + e)
              })
          } else {
            console.log('[BLE] ⚠ Could not extract 65-byte EC key from field 17')
          }
          
          state = 'DONE'
          updateStatus('PAIRED!', 0x00cc44)
          addLog('Key enrolled!', 0x00cc44)
          updateDeviceInfo()
        } else if (fields[4]) {
          // commandStatus (field 4) = not enrolled or error
          state = 'IDLE'
          updateStatus('NOT ENROLLED', 0xff4444)
          addLog('Not in whitelist', 0xff8800)
          console.log('[BLE] ✗ Key not in whitelist (commandStatus field present)')
        } else {
          state = 'IDLE'
          updateStatus('NOT ENROLLED', 0xff4444)
          addLog('Tap key card first', 0xff8800)
          console.log('[BLE] ✗ No enrollment info in response')
        }
      }

      teslaBLE.sendAndWaitForResponse(msgBytes, function(r) {
        handleQueryResponse(r, 0)
      }, 8000)
    })
    .catch(function(err) {
      state = 'IDLE'
      updateStatus('ERROR', 0xff4444)
      addLog('Exc: ' + (err.message || '?'), 0xff4444)
    })
}

// Minimal protobuf field decoder — returns raw field map {fieldNum: bytes|number}
function decodeRawFields(data) {
  var fields = {}
  var offset = 0
  while (offset < data.length) {
    var tag = 0, shift = 0
    while (offset < data.length) {
      var b = data[offset++]
      tag |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    var fieldNum = tag >> 3
    var wireType = tag & 7
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

// ── button handlers ──────────────────────────────────────────────────────────
// GENKEY button: generate fresh key pair for pairing
function onGenKey() {
  console.log('[BLE] ▶ GENKEY button pressed - generating fresh key pair')
  addLog('Generating fresh key...', 0xffcc00)
  
  currentPage.request({ method: 'BLE_SYNC_KEYS', params: { forceNew: true } })
    .then(function(result) {
      if (result.success && result.publicKeyHex) {
        storage.setItem('watch_public_key', result.publicKeyHex)
        console.log('[BLE] ✓ Generated fresh watch key: ' + result.publicKeyHex.slice(0, 16) + '...')
        addLog('✓ Fresh key ready', 0x44ff44)
        addLog('Now press PAIR', 0x00cc00)
        state = 'IDLE'
        updateStatus('READY', 0x00cc44)
        updateDeviceInfo()
      } else {
        console.log('[BLE] ✗ Failed to generate key: ' + (result.error || 'unknown'))
        addLog('⚠ Key gen failed', 0xff8844)
      }
    })
    .catch(function(e) {
      console.log('[BLE] ✗ Key generation error: ' + e)
      addLog('⚠ Key error: ' + e, 0xff8844)
    })
}

// PAIR button: automatic flow - scan → connect → pair → verify
function onPair() {
  if (state === 'SCANNING' || state === 'CONNECTING' || state === 'PAIRING' || state === 'WAITING_KEYCARD') {
    addLog('Busy: ' + state, 0xff8800)
    return
  }

  if (state === 'DONE') {
    addLog('Already paired!', 0x00cc44)
    return
  }

  // Start automatic pairing flow
  console.log('[BLE] ▶ PAIR button pressed - starting auto pairing flow')
  addLog('Starting pairing...', 0xffcc00)
  autoStartPairing()
}

function autoStartPairing() {
  // Check if we have a saved MAC from previous pairing
  var savedMAC = teslaBleApi.savedMAC
  if (savedMAC) {
    console.log('[BLE] Using saved MAC: ' + savedMAC)
    addLog('Using saved MAC', 0xcccccc)
    addLog(savedMAC.slice(-17), 0xaaaaaa)
    doConnect(savedMAC, 0)
    return
  }

  // No saved MAC - start scanning
  console.log('[BLE] No saved MAC, starting scan...')
  state = 'SCANNING'
  updateStatus('SCANNING...', 0xffcc00)
  addLog('Scanning 15s...', 0xcccccc)

  teslaBleApi.scan(function(result) {
    if (result.type === 'found') {
      var dev = result.device
      foundMAC = dev.mac || null
      console.log('[BLE] Found device: ' + dev.name + ' (' + foundMAC + ')')
      addLog('FND: ' + (dev.name || '?'), 0x00cc44)
      if (foundMAC) addLog(foundMAC.slice(-17), 0x00cc44)
      teslaBleApi.stopScan()
      state = 'IDLE'
      
      // Auto-connect immediately after finding device
      console.log('[BLE] Device found, connecting...')
      setTimeout(function() {
        doConnect(foundMAC, 0)
      }, 500)
    }
    if (result.type === 'complete') {
      if (state === 'SCANNING') {
        var cnt = (result.devices && result.devices.length) || 0
        console.log('[BLE] Scan complete. Found ' + cnt + ' devices')
        if (!foundMAC) {
          state = 'IDLE'
          addLog('No device found', 0xff8800)
          updateStatus('IDLE', 0x888888)
        }
      }
    }
  }, 15000)
}

function doConnect(mac, attempt) {
  console.log('[BLE] Connecting to ' + mac + ' (attempt ' + (attempt + 1) + ')')
  state = 'CONNECTING'
  updateStatus('CONNECTING...', 0xffcc00)
  addLog('Connecting...', 0xcccccc)
  addLog(mac.slice(-17), 0xaaaaaa)

  teslaBleApi.connect(mac, function(result) {
    if (!result.success) {
      console.log('[BLE] Connection failed: ' + (result.error || 'unknown error'))
      if (attempt < 1) {
        // Auto-retry once — ZeppOS BLE stack often needs a second try
        console.log('[BLE] Retrying connection...')
        addLog('Retry ' + (attempt + 2) + '...', 0xff8800)
        setTimeout(function() { doConnect(mac, attempt + 1) }, 2000)
        return
      }
      state = 'IDLE'
      updateStatus('CONN FAIL', 0xff4444)
      addLog('Conn err: ' + (result.error || '?'), 0xff4444)
      console.log('[BLE] Connection failed after retries')
      return
    }
    console.log('[BLE] ✓ Connected to ' + mac)
    addLog('Connected!', 0x00cc44)
    updateDeviceInfo()
    doPair()
  }, storage)
}

function onClear() {
  teslaBleApi.clear(storage)
  state    = 'IDLE'
  foundMAC = null
  updateStatus('CLEARED', 0x888888)
  updateDeviceInfo()
  addLog('Cleared & disconnected', 0x888888)
}

// ── page ─────────────────────────────────────────────────────────────────────
Page(BasePage({
  build() {
    currentPage = this
    storage.load()
    teslaBleApi.init(storage)

    // Sync keys with phone (auto-generate if needed)
    console.log('[BLE] Syncing keys with phone...')
    currentPage.request({ method: 'BLE_SYNC_KEYS', params: {} })
      .then(function(result) {
        if (result.success && result.publicKeyHex) {
          storage.setItem('watch_public_key', result.publicKeyHex)
          console.log('[BLE] ✓ Synced watch public key: ' + result.publicKeyHex.slice(0, 16) + '...')
          addLog('✓ Watch key synced', 0x44ff44)
        } else {
          console.log('[BLE] ⚠ Failed to sync keys: ' + (result.error || 'unknown'))
          addLog('⚠ Key sync failed', 0xff8800)
        }
      })
      .catch(function(e) {
        console.log('[BLE] ⚠ Key sync error: ' + e)
      })

    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: 18, w: 480, h: 36,
      text: 'BLE DEBUG', text_size: 26, color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
    })

    // Top separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 54, w: 440, h: 2, color: 0x333333
    })

    // Status dot
    statusDotWidget = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 50, y: 62, w: 14, h: 14, radius: 7, color: 0x888888
    })

    // Status text
    statusTextWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 72, y: 60, w: 360, h: 22,
      text: 'IDLE', text_size: 20, color: 0x888888,
      align_h: hmUI.align.LEFT,
    })

    // Device info
    deviceInfoWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20, y: 94, w: 440, h: 24,
      text: '...', text_size: 18, color: 0x777777,
      align_h: hmUI.align.LEFT,
    })

    // Second separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 122, w: 440, h: 1, color: 0x333333
    })

    // 8 log rows (y=124, step=27)
    for (var i = 0; i < 8; i++) {
      logWidgets[i] = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 20, y: 124 + i * 27, w: 440, h: 26,
        text: '', text_size: 20, color: 0x666666,
        align_h: hmUI.align.LEFT,
      })
    }

    // Bottom separator
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 20, y: 340, w: 440, h: 1, color: 0x333333
    })

    // GENKEY button (generate fresh key before pairing)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 20, y: 350, w: 100, h: 50,
      text: 'GENKEY', text_size: 16, color: 0xffffff,
      normal_color: 0x003366, press_color: 0x001a33, radius: 12,
      click_func: onGenKey,
    })

    // PAIR button (automatic flow)
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 140, y: 350, w: 160, h: 50,
      text: 'PAIR', text_size: 20, color: 0xffffff,
      normal_color: 0x1a5c2a, press_color: 0x0d2d15, radius: 12,
      click_func: onPair,
    })

    // CLEAR button
    hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 320, y: 350, w: 140, h: 50,
      text: 'CLEAR', text_size: 16, color: 0xffffff,
      normal_color: 0x5c1a1a, press_color: 0x2d0d0d, radius: 12,
      click_func: onClear,
    })

    teslaBleApi.onDisconnect = function() {
      if (state === 'WAITING_KEYCARD' || state === 'PAIRING') {
        state = 'IDLE'
        updateStatus('DISCONNECTED', 0xff4444)
        addLog('BLE dropped - reconnect', 0xff8800)
      }
    }

    updateDeviceInfo()
    if (teslaBleApi.isConnected()) updateStatus('CONNECTED', 0x00cc44)
    addLog('BLE debug ready', 0xcccccc)
    keepScreenOn(true, 600000)
  },

  onDestroy() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
  },

  onHide() {
    keepScreenOn(false)
    teslaBleApi.disconnect()
  }
}))
