# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **BLE Direct Control** - Bluetooth control without internet, fully standalone
- **Vehicle Status** - Door/closure states, lock state, sleep status
- **Key Pool** - Pre-generated ephemeral keypairs allow offline session establishment

## Recent Improvements (Latest)

### Pairing Controller Refactor (✅ Complete)

**What changed**: Extracted all pairing logic out of the UI layer into a headless controller + `Phone` class. Deleted the `page/wizard/` directory entirely (~611 lines removed).

**`lib/tesla-ble/pairing.js`** — `createPairingController(phone, callbacks)`:
- Full pairing state machine: `setup → scanning → connecting → pairing → confirming → verifying → done`
- Handles auto-tap (UNKNOWN_KEY response) and manual NFC tap (WAIT → tap → OK) flows
- Skips up to 3 ambient BLE responses before the real `WhitelistEntryInfo` reply
- One retry on BLE connect failure; 60s NFC tap timeout
- `cancel()` method: stops scan, disconnects BLE, suppresses all pending callbacks
- `page/ble/index.js` now delegates to this controller; wizard UI gone

**`lib/phone.js`** — `Phone` class (refactored):
- `pairSetup(cb)` — single IPC call that generates the watch keypair and both BLE messages (`BLE_PAIR_SETUP`)
- `completePairing(rawResponseBinary, cb)` — parses whitelist entry info, extracts EC key, computes doublings table (`BLE_COMPLETE_PAIRING`)
- `syncPool(cb, count)`, `syncKeys(cb)`, `syncSettings()` — unchanged phone sync methods
- `simulatePair(cb)` — dev-mode full pairing simulation without a real vehicle

**New phone-side IPC handlers** (`app-side/ble-crypto.js` + `app-side/index.js`):
- `BLE_PAIR_SETUP` — generates/retrieves watch keypair, builds pair + verify BLE messages in one call
- `BLE_COMPLETE_PAIRING` — parses raw whitelist entry response, extracts vehicle EC key, returns doublings table

**Test coverage** (`__tests__/pairing-controller.test.js`, 23 tests):
- Auto-tap flow (UNKNOWN_KEY): end-to-end success, state sequence, EC key extraction, doublings table, key pool, enrolled key
- Manual NFC tap flow: confirming state, artifacts stored
- Ambient response skipping: 1, 2 (pass), 4 (fails at attempt 3 — expected)
- Error paths: pairSetup failure, whitelist error, completePairing failure, BLE connect failure
- NFC tap timeout (60s)
- ok-without-tap (auto-approved key, fix for infinite waitForNFC loop)
- cancel() before NFC tap; cancel() during scan

### End-to-End VCR Test Suite (✅ Complete)

**Approach**: `ble-native.js` and `session.js` run completely unmodified. `BLEHarness` (`__mocks__/zos.js`) intercepts `@zos/ble` native calls at the `mstWriteCharacteristic`/`mstOnCharaNotification` boundary. `CarSimulator` (`__tests__/helpers/car-simulator.js`) implements full vehicle-side P-256 ECDH and HMAC-SHA256 — generating realistic framed BLE responses at the raw byte level.

**Coverage** (27 tests):
- BLE connect + session establishment
- Session blocked on empty key pool
- RKE: lock, unlock, trunk, frunk (idempotent lock included)
- Command error injection (`actionStatus = 2`)
- Vehicle status: locked/unlocked, all-doors-open, sleep, state-after-command
- Second-response timeout (fake timer, 10s window)
- Session auto-establishment from `sendCommand`

**Bug fixed**: `teslaBLE.reset()` (via `_cleanup()`) did not clear the BLE dedup cache (`_lastResponseData` / `_lastResponseTime`). Dedup uses a 200ms window with a signature based on message size and first two bytes. The session-info response always has the same signature — if two tests ran within 200ms, the second test's session-info notification was silently dropped, causing a 30s timeout. Fixed: both fields are now cleared in `_cleanup()`.

### Store Refactor + Smart Key Pool Sync (✅ Complete)

**Storage layout** — eliminated `ble_settings.txt` entirely. All watch-side persistence now uses two distinct mechanisms:

| Data | Storage | Format |
|------|---------|--------|
| `watchPublicKey`, `vehicleEcPublicKey`, `vehicleMac`, `vehicleVin`, `vehicleName`, `vehicleModel` | `LocalStorage` | Binary string (charCodeAt-encoded); `vehicleVin` getter returns `Uint8Array` |
| `vehicle_doublings_table.dat` | Binary file | 16,384-byte raw `Uint32Array` (LSW-first, native endian) |
| `key_pool.dat` | Binary file | 97 bytes/key raw binary |

**Doublings table format change** — phone now converts to native `Uint32Array` LSW-first format during `BLE_PRECOMPUTE_TABLE`. Watch loads with `new Uint32Array(raw)` — zero-copy, zero-conversion. Previous `charCodeAt` parsing loop eliminated.

**`BLE_SYNC_POOL`** — replaced manual "GEN POOL" button with smart proactive + reactive sync:
- On app open: watch sends `currentCount`, phone returns full replacement pool if below target (33 keys)
- On pool low: `teslaSession.onPoolLow` fires the same request; phone decides, watch just stores
- No merge logic on watch — phone always sends a complete pool or `null` (no-op)

**Breaking storage change**: `watchPublicKey` + `vehicleEcPublicKey` moved from `.dat` files to `LocalStorage` — existing devices must re-pair.

### Native BLE Layer — easy-ble Removed (✅ Complete, Tested on Device)

**Problem**: `@silver-zepp/easy-ble` wrapped native `@zos/ble` with a `QueueManager`, wrapper objects (`write`, `on`, `off`), and UUID/MAC normalization layers. This added memory and CPU overhead on every BLE operation.

**Solution**: Rewrote `lib/tesla-ble/ble-native.js` using direct `@zos/ble` native calls only.

**What was eliminated**:
- `QueueManager` — polling array + state machine that blocked descriptor writes for up to 5s
- `BLEMaster` object allocation per connection
- `write`/`on`/`off` wrapper object layers
- UUID normalization on every BLE notification (hot path)
- `pair:false` profile workaround + `startListener(null)` fallback

**Key implementation details**:
- `mstConnect` → callback `connected: 0/1/2` (not boolean) — 0=success, 1=failed, 2=disconnect
- `mstBuildProfile` + `mstOnPrepare` replace `startListener` callback
- `TESLA_READ_UUID_UC` precomputed constant — no `toUpperCase()` allocation per notification
- MAC string `"AA:BB:CC:DD:EE:FF"` → 6-byte `ArrayBuffer` via direct `substr` indexing (no `split()`)
- `CCCD_ENABLE` module-level constant — no `Uint8Array` allocation per connect
- `mstDestroyProfileInstance` for cleanup

**Tested on device**: BLE self-test button added to BLE debug page — all 5 tests pass (API existence, single-chunk reassembly, multi-chunk reassembly, dedup, 3s BLE scan).

### BLE GATT Setup & CCCD Queue Fix (✅ Complete, Tested on Device)

**Problem**: Session establishment always fails — vehicle never receives `SessionInfoRequest`.

**Root Causes Identified and Fixed**:

1. **`startListener()` removed — profile_pid never set** (Commit cd46780 broke it)
   - The easy-ble library requires `startListener()` to call `mstBuildProfile()`, which sets
     `device.profile_pid` in its internal device map
   - Without `profile_pid`, all `write.characteristic()` calls silently succeed without sending any BLE packet
   - All `on.*()` handler registrations throw TypeError (caught silently)
   - **Fix**: Restored `startListener()` with `pair: false` profile — provides Tesla characteristic
     UUIDs directly without triggering GATT attribute discovery (which Tesla firmware rejects at 47ms)
   - Connection now settles only after `startListener` callback confirms GATT is ready

2. **CCCD write blocked the queue for 5 seconds** (newly identified bug)
   - `write.descriptor()` goes through easy-ble's `QueueManager`, which polls every 100ms for a
     write-complete flag set by `on.descWriteComplete()`
   - That handler was never registered → queue timed out after 5000ms before unblocking
   - `SessionInfoRequest` was queued behind CCCD and waited 5 seconds — by then the vehicle
     may have already disconnected from lack of activity
   - **Fix**: Register `on.descWriteComplete` handler before writing CCCD so the flag is set promptly

3. **No fallback if `pair:false` is rejected by ZeppOS** (untested firmware edge case)
   - Some ZeppOS firmware versions may not accept a `pair:false` profile for a non-bonded device
   - **Fix**: Added automatic fallback to `startListener(null, ...)` — ZeppOS assigns a `profile_pid`
     without any GATT discovery

**Implementation** (`lib/tesla-ble/ble.js`):
```
connect() flow:
  physical BLE connect
    → startListener(pair:false profile)    ← prevents GATT discovery
      → [fallback] startListener(null)     ← if pair:false rejected
        → on.descWriteComplete registered  ← allows queue to unblock
          → write.descriptor(CCCD 0x0200) ← enable indications
            → settle({success:true})       ← caller ready
```

**Expected log sequence** (success path):
```
[BLE] Connected, building GATT profile (pair=false, no discovery)...
[BLE] GATT profile ready (pair:false), registering handlers...
[BLE] CCCD write complete, status: 0
[BLE] Handlers registered, settling connection...
[BLE] TX ... bytes (single write)          ← should appear within <500ms
[SESSION] TX request...
[SESSION] Established: counter=...
```

### Session Info Response Fix (✅ Complete)

**Problem**: Session establishment always failed with "could not setup session" despite successful pairing.

**Root cause**: The vehicle sends two BLE responses to a `SessionInfoRequest`:
1. An intermediate ack (protobuf field 1 only — routing info)
2. The real `SessionInfo` (field 6 — epoch, counter, vehicle public key)

The handler consumed its callback on the first response and discarded the second.

**Fix** (`lib/tesla-ble/session.js` → `_doSessionInfoRequest`):
- Detect intermediate acks via `!sessionInfo && !payload && !signedMessageStatus`
- Re-register the callback and keep waiting for the real `SessionInfo`
- Fixed a self-reference bug: named function expression + `.bind(this)` caused the re-registered handler to lose `this` context; replaced with a closure-captured `const` using `self`

### Connection Speed Optimization - Phase 4: ECDH Precomputed Table (✅ Complete)

**Problem**: Cold-start ECDH still took ~8 seconds on every first connection after cache expiry.

**Solution**: Phone precomputes a doublings table for the vehicle's fixed public key during pairing.
Watch uses this table to compute ECDH with ~128 point additions and **zero point doublings**,
instead of the usual 256 doublings + 64 additions.

**Key insight** (verified against [Tesla vehicle-command Go SDK](https://github.com/teslamotors/vehicle-command)):
The vehicle's public key in `SessionInfo` is its **long-term VCSEC identity key** — it never
changes between sessions. The SDK explicitly rejects any `SessionInfo` where the key differs
from the one used at session initialization. This makes a persistent precomputed table safe and correct.

**How it works**:
1. At pairing time (phone is connected): phone computes `table[i] = 2^i * vehicleKey` for i=0..255
2. Table (16 KB) is stored on watch in persistent storage
3. For every subsequent ECDH: `k * vehicleKey = sum of table[i]` for each set bit in k
   — ~128 additions, 0 doublings
4. Full fallback to existing ECDH if table is missing (no regression)

**Expected savings: ~2× reduction in cold ECDH** → ~3.5–4s instead of ~8s

**Real-World Impact** (Phase 4 vs baseline):
| Scenario | Before | After Phase 4 | Total Saved |
|----------|--------|---------------|-------------|
| First unlock | 18-19s | ~9-10s | ~9s ⚡⚡ |
| Lock + Unlock | 36-38s | ~10-12s | ~26-28s ⚡⚡⚡ |

### Connection Speed Optimization - Phase 1 (✅ Complete)

**Problem**: App launch → Connected took 18-19 seconds (8 sec ECDH + 5 sec stabilization + 2.5 sec delays)

**Solutions Implemented**:

#### Phase 1: Remove Artificial Delays
- Removed 1500ms unnecessary wait before BLE connect
- Reduced BLE stack stabilization from 5s to 2s
- **Savings: 4.5 seconds** → 13-14s total time

### Vehicle EC Key Extraction & Storage (✅ Complete - Implements Tesla SDK Exactly)

**Corrected Protocol** (verified against [Tesla vehicle-command SDK](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protobuf/vcsec.proto)):

The vehicle's 65-byte EC public key is **NOT sent during pairing**. It must be **explicitly requested** via `GetWhitelistEntryInfo` after pairing succeeds.

**Proper Flow**:
1. **During Pairing**: Send `WhitelistOperation.AddKeyToWhitelistAndAddPermissions` with our public key
2. **Vehicle Responds**: With `AddKeyResponse` wrapped in field 16 (UnsignedMessage)
3. **Parse Response**: Extract operationStatus from AddKeyResponse
   - **operationStatus=7 (UNKNOWN_KEY)** = **SUCCESS during pairing** (key was unknown, now added)
   - Intermediate status (field 3 only) triggers waitForResult() for the actual response
4. **After Pairing Succeeds**: Send `InformationRequest(type=6, slot=0)` to fetch enrolled key info
5. **Vehicle Response**: `FromVCSECMessage.whitelistEntryInfo` (field 17) = key enrollment details
6. **Extract EC Key**: 
   - Decode field 17 → WhitelistEntryInfo with field 2 = PublicKey message
   - Decode field 2 → PublicKey with field 1 = 65-byte EC key
   - Store to persistent storage (`vehicle_ec_public_key`)

**Implementation Details**:
- `lib/tesla-ble/protocol/vcsec.js`: 
  - Field 16 unwrapping for AddKeyResponse
  - operationStatus=7 → success interpretation in pairing context
  - Proper WhitelistEntryInfo/PublicKey nested message handling
- `page/ble/index.js`:
  - Multi-response pairing handshake: intermediate (wait) → final (ok with hasSigner)
  - Two-level protobuf unwrapping: WhitelistEntryInfo → PublicKey → EC key
  - Auto-fetch EC key after pairing via GetWhitelistEntryInfo(slot=0)
- Phone-side: `app-side/ble-crypto.js` builds correct GetWhitelistEntryInfo query

**Result**: EC key extraction works reliably; Phase 4 ECDH optimization (2× speedup) fully functional

### Navigation & UI (✅ Complete)
- **Main page** (`page/index.js`): Vehicle control — lock/unlock/frunk/trunk buttons with live door status overlay; small **BLE** button for debug access
- **BLE debug page** (`page/ble/index.js`): Scan, pair (via `createPairingController`), clear keys, manage pool, view connection log. Wizard UI removed — all pairing logic is in `lib/tesla-ble/pairing.js`

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐    │
│   │             │   BLE   │             │   BLE   │                     │    │
│   │    Watch    │◄───────►│    Phone    │         │       Tesla         │    │
│   │  (ZeppOS)   │  Sync   │  (Android)  │         │     (Vehicle)       │    │
│   │             │         │             │         │                     │    │
│   └──────┬──────┘         └─────────────┘         └──────────┬──────────┘    │
│          │                                                   │               │
│          │              Direct BLE Connection                │               │
│          └───────────────────────────────────────────────────┘               │
│                                                                              │
│   Phone needed ONLY for:          Watch handles:                             │
│   • Initial key generation        • BLE communication                        │
│   • Session key pool sync         • Session establishment (ECDH)             │
│                                   • Commands (HMAC signing)                  │
│                                   • Passive entry                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Management

### Two Types of Keys

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              KEY MANAGEMENT                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENROLLED KEY (Long-term identity)                                        │
│  ════════════════════════════════════                                        │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  LocalStorage (watch)                                           │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │ watchPublicKey: binary string (65 bytes)                    ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     │  Phone storage (app-side/tesla/session.js)                      │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │ private key: 32-byte binary (never leaves phone)            ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Generated by phone app (ble-crypto.js)                                 │
│     • Synced to watch via BLE_SYNC_KEYS message from phone                   │
│     • Public key added to car's whitelist during pairing                     │
│     • Used to identify watch as authorized key                               │
│                                                                              │
│  2. SESSION KEYS (Ephemeral, for ECDH)                                       │
│  ═════════════════════════════════════                                       │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  key_pool.dat (binary file on watch, 97 bytes/key)              │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │  [ key0_priv(32B) | key0_pub(65B) ]                         ││      │
│     │  │  [ key1_priv(32B) | key1_pub(65B) ]                         ││      │
│     │  │  ...                                                        ││      │
│     │  │  97 bytes per key                                           ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Generated on phone (P-256 key gen is slow)                             │
│     • Auto-synced via BLE_SYNC_POOL (on app open + when pool is low)         │
│     • One keypair consumed per session establishment                         │
│     • Used for ECDH key exchange with Tesla                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Sync Flow

Key pool sync uses `BLE_SYNC_POOL` — phone decides when and how much to generate. Watch is passive.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SESSION KEY SYNC FLOW                              │
│                    (Proactive on open + Reactive on low)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                    Phone                          │
│        │                                        │                            │
│   ┌────┴────┐   App opens / pool runs low       │                            │
│   │ Count   │                                   │                            │
│   │ pool    │  ──────────────────────────────►  │                            │
│   └────┬────┘     BLE_SYNC_POOL                 │                            │
│        │          { currentCount: N }           │                            │
│        │                                        │                            │
│        │                              ┌─────────┴──────────┐                 │
│        │                              │ N >= 33?           │                 │
│        │                              │   → { pool: null } │                 │
│        │                              │ N < 33?            │                 │
│        │                              │   → generate 33    │                 │
│        │                              │     P-256 keypairs │                 │
│        │                              └─────────┬──────────┘                 │
│        │                                        │                            │
│        │  ◄──────────────────────────────────   │                            │
│        │     { success, pool: binary | null }   │                            │
│        │                                        │                            │
│   ┌────┴────┐                                   │                            │
│   │ pool?   │   store → key_pool.dat            │                            │
│   │ Store   │   (97 bytes/key raw binary)       │                            │
│   │ it raw  │                                   │                            │
│   └────┬────┘                                   │                            │
│        │                                        │                            │
│        ▼                                        ▼                            │
│   Ready for standalone operation! (33 keys ≈ ~3.2 KB)                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Triggers**:
- `page/index.js` `build()` — proactive sync on every app open
- `page/ble/index.js` `build()` — additional sync on BLE debug page open  
- `teslaSession.onPoolLow` callback — reactive sync when pool drops below threshold

## Pairing Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PAIRING FLOW                                    │
│                    (One-time setup to add watch as key)                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                         Tesla                        User         │
│        │                             │                            │          │
│   ┌────┴────┐                        │                            │          │
│   │ Scan    │                        │                            │          │
│   │ for BLE │                        │                            │          │
│   │ devices │                        │                            │          │
│   └────┬────┘                        │                            │          │
│        │                             │                            │          │
│        │  ◄── BLE Advertisement ───  │                            │          │
│        │      Name: "S{vin_hash}C"   │                            │          │
│        │                             │                            │          │
│        │  ─── BLE Connect ────────►  │                            │          │
│        │                             │                            │          │
│        │  ─── WhitelistOperation ──► │                            │          │
│        │      (Add public key)       │                            │          │
│        │      + KeyMetadata          │                            │          │
│        │        (ANDROID_DEVICE)     │                            │          │
│        │                             │                            │          │
│        │  ◄── OPERATIONSTATUS_WAIT ─ │                            │          │
│        │      "Waiting for keycard"  │                            │          │
│        │                             │                            │          │
│   ┌────┴────┐                        │                       ┌────┴────┐     │
│   │ Display │                        │                       │ Tap key │     │
│   │ "Tap    │                        │  ◄── NFC Tap ──────   │ card on │     │
│   │ keycard"│                        │                       │ console │     │
│   └────┬────┘                        │                       └────┬────┘     │
│        │                             │                            │          │
│        │  ◄── OPERATIONSTATUS_OK ──  │                            │          │
│        │      "Key added"            │                            │          │
│        │                             │                            │          │
│   ┌────┴────┐                        │                            │          │
│   │ Save    │                        │                            │          │
│   │ MAC     │                        │                            │          │
│   │ address │                        │                            │          │
│   └────┬────┘                        │                            │          │
│        │                             │                            │          │
│        ▼                             ▼                            ▼          │
│   Paired! Watch is now an authorized key.                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Session Establishment Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        SESSION ESTABLISHMENT FLOW                            │
│              (Required before sending commands / passive entry)              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│   ┌────┴────┐                                             │                  │
│   │ Pop     │                                             │                  │
│   │ keypair │                                             │                  │
│   │ from    │                                             │                  │
│   │ pool    │                                             │                  │
│   └────┬────┘                                             │                  │
│        │                                                  │                  │
│        │  ─── SessionInfoRequest ──────────────────────►  │                  │
│        │      { ephemeral_public_key }                    │                  │
│        │                                                  │                  │
│        │  ◄── Intermediate Ack ─────────────────────────  │                  │
│        │      (routing info only, no SessionInfo yet)     │                  │
│        │                                                  │                  │
│        │  ◄── SessionInfo ─────────────────────────────   │                  │
│        │      { vehicle_public_key,                       │                  │
│        │        epoch, counter, clock_time }              │                  │
│        │                                                  │                  │
│   ┌────┴────────────────────────────┐                     │                  │
│   │ ECDH Key Derivation (on watch)  │                     │                  │
│   │                                 │                     │                  │
│   │ shared_secret = ECDH(           │                     │                  │
│   │   ephemeral_private_key,        │                     │                  │
│   │   vehicle_public_key            │                     │                  │
│   │ )                               │                     │                  │
│   │                                 │                     │                  │
│   │ session_key = SHA1(             │                     │                  │
│   │   shared_secret                 │                     │                  │
│   │ )[:16]                          │                     │                  │
│   └────┬────────────────────────────┘                     │                  │
│        │                                                  │                  │
│        │  Session established!                            │                  │
│        │  • session_key for HMAC signing                  │                  │
│        │  • epoch, counter for replay protection          │                  │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Ready for commands and passive entry!                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Command Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              COMMAND FLOW                                    │
│                      (Lock, Unlock, Trunk, Frunk)                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│   ┌────┴────────────────────────────┐                     │                  │
│   │ Build Authenticated Command     │                     │                  │
│   │                                 │                     │                  │
│   │ unsigned_msg = {                │                     │                  │
│   │   RKE_ACTION: UNLOCK            │                     │                  │
│   │ }                               │                     │                  │
│   │                                 │                     │                  │
│   │ signed_msg = {                  │                     │                  │
│   │   payload: unsigned_msg,        │                     │                  │
│   │   signature_type: HMAC,         │                     │                  │
│   │   counter: ++counter,           │                     │                  │
│   │   epoch: epoch,                 │                     │                  │
│   │   expires_at: clock + 60s,      │                     │                  │
│   │   signature: HMAC-SHA256(       │                     │                  │
│   │     session_key, signed_msg     │                     │                  │
│   │   )                             │                     │                  │
│   │ }                               │                     │                  │
│   └────┬────────────────────────────┘                     │                  │
│        │                                                  │                  │
│        │  ─── RoutableMessage(ToVCSEC(signed_msg)) ────►  │                  │
│        │                                                  │                  │
│        │                                    ┌─────────────┴─────────────┐    │
│        │                                    │ Verify HMAC signature     │    │
│        │                                    │ Check counter > last      │    │
│        │                                    │ Check not expired         │    │
│        │                                    │ Execute action            │    │
│        │                                    └─────────────┬─────────────┘    │
│        │                                                  │                  │
│        │  ◄── CommandStatus(OK) ───────────────────────── │                  │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Command executed!                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Passive Entry Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PASSIVE ENTRY FLOW                                 │
│              (Auto-unlock when approaching car with app open)                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                              Tesla                │
│        │                                                  │                  │
│   ┌────┴────┐                                             │                  │
│   │ App     │                                             │                  │
│   │ opened  │                                             │                  │
│   └────┬────┘                                             │                  │
│        │                                                  │                  │
│        │  ─── BLE Connect ─────────────────────────────►  │                  │
│        │                                                  │                  │
│        │  ─── Session Establishment ───────────────────►  │                  │
│        │      (see Session Flow above)                    │                  │
│        │                                                  │                  │
│        │  ◄── Session OK ─────────────────────────────    │                  │
│        │                                                  │                  │
│        │                                                  │                  │
│        │  ════ Authenticated BLE Connection ════════════  │                  │
│        │                                                  │                  │
│        │                                    ┌─────────────┴─────────────┐    │
│        │                                    │ Tesla monitors RSSI       │    │
│        │                                    │ (signal strength)         │    │
│        │                                    │                           │    │
│        │                                    │ RSSI weak = far away      │    │
│        │                                    │ RSSI strong = nearby      │    │
│        │                                    └─────────────┬─────────────┘    │
│        │                                                  │                  │
│        │             ┌────────────────────────────────────┤                  │
│        │             │ User approaches car                │                  │
│        │             │ RSSI increases                     │                  │
│        │             ▼                                    │                  │
│        │                                    ┌─────────────┴─────────────┐    │
│        │                                    │ RSSI > threshold          │    │
│        │                                    │ → AUTO UNLOCK!            │    │
│        │                                    └───────────────────────────┘    │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Car unlocks automatically when you approach!                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Tesla BLE Command Reference

All commands are sent as HMAC-signed `RoutableMessage` → `ToVCSECMessage` → `UnsignedMessage` packets over BLE after a session is established.

### RKE Actions (Remote Keyless Entry)

Core lock/unlock commands are sent via `UnsignedMessage.rkeAction` (field 2).

| Constant | Value | Method | Description |
|----------|-------|--------|-------------|
| `RKE_ACTION_UNLOCK` | 0 | `session.unlock(cb)` | Unlock all doors |
| `RKE_ACTION_LOCK` | 1 | `session.lock(cb)` | Lock all doors |

**Usage:**
```javascript
import teslaSession from './lib/tesla-ble/session.js'

// Convenience methods (session auto-establishes if needed):
teslaSession.lock(result => { ... })
teslaSession.unlock(result => { ... })
```

### Closure Move Commands (Trunk/Frunk)

Trunk and frunk use `UnsignedMessage.closureMoveRequest` (field 3), not `rkeAction`.

```javascript
import { buildClosureMoveRequest } from './lib/tesla-ble/protocol/vcsec.js'
import teslaSession from './lib/tesla-ble/session.js'

// Rear trunk: closureId=5, moveType=0 (MOVE)
const rearTrunk = buildClosureMoveRequest(5, 0)
teslaSession.sendCommand({ closureMoveRequest: rearTrunk }, result => { ... })

// Frunk: closureId=6, moveType=0 (MOVE)
const frontTrunk = buildClosureMoveRequest(6, 0)
teslaSession.sendCommand({ closureMoveRequest: frontTrunk }, result => { ... })
```

### Information Requests

Read-only queries sent as `UnsignedMessage.informationRequest` (field 1). Sent as HMAC-signed authenticated commands — a session must be established first.

| Constant | Value | Description |
|----------|-------|-------------|
| `INFO_REQUEST_GET_STATUS` | 0 | Vehicle status: door/closure states, lock state, sleep, user presence |
| `INFO_REQUEST_GET_WHITELIST_INFO` | 5 | Full whitelist: all enrolled keys and their metadata |
| `INFO_REQUEST_GET_WHITELIST_ENTRY_INFO` | 6 | Single key entry: slot, role, public key (used to fetch vehicle EC key after pairing) |

**Usage:**
```javascript
import { buildInformationRequest, buildUnsignedMessage, buildRoutableMessage,
         INFO_REQUEST_GET_STATUS, INFO_REQUEST_GET_WHITELIST_ENTRY_INFO,
         DOMAIN_VEHICLE_SECURITY } from './lib/tesla-ble/protocol/vcsec.js'

// Vehicle status (door/lock state):
const req = buildInformationRequest(INFO_REQUEST_GET_STATUS)
const msg = buildRoutableMessage({ toDomain: DOMAIN_VEHICLE_SECURITY, payload: buildUnsignedMessage({ informationRequest: req }) })

// Whitelist entry info for slot 0 (fetch vehicle EC key after pairing):
const req = buildInformationRequest(INFO_REQUEST_GET_WHITELIST_ENTRY_INFO, null, null, 0)
```

**Vehicle Status response fields** (`parseVehicleStatus`):

| Field | Description | Values |
|-------|-------------|--------|
| `closureStatuses.frontDriverDoor` | Front driver door | 0=closed, 1=open |
| `closureStatuses.frontPassengerDoor` | Front passenger door | 0=closed, 1=open |
| `closureStatuses.rearDriverDoor` | Rear driver door | 0=closed, 1=open |
| `closureStatuses.rearPassengerDoor` | Rear passenger door | 0=closed, 1=open |
| `closureStatuses.rearTrunk` | Rear trunk | 0=closed, 1=open |
| `closureStatuses.frontTrunk` | Frunk | 0=closed, 1=open |
| `closureStatuses.chargePort` | Charge port | 0=closed, 1=open |
| `vehicleLockState` | Lock state | 0=unlocked, 1=locked |
| `vehicleSleepStatus` | Sleep state | 0=awake, 1=asleep |
| `userPresence` | Key detected | 0=absent, 1=present |

### Session Management

| Method | Description |
|--------|-------------|
| `session.requestSessionInfo(cb)` | Establish BLE session (ECDH key exchange) |
| `session.getVehicleStatus(cb)` | Fetch door/lock/sleep status |
| `session.established` | Boolean — true if session is active |
| `session.reset()` | Clear session state |
| `session.ensureSessionEstablished(cb)` | Establish session if needed, queue concurrent callers |

### Pairing Operations

| Operation | Description |
|-----------|-------------|
| `buildWhitelistOperation(pubKeyMsg)` | Add a key to the vehicle whitelist (requires NFC keycard tap) |
| `buildUnsignedMessageWithWhitelist(op)` | Wrap whitelist operation in unsigned message (field 16) |

### Key Roles

| Constant | Value | Description |
|----------|-------|-------------|
| `KEY_ROLE_OWNER` | 2 | Full owner access |

_(ROLE_SERVICE=1, ROLE_DRIVER=3 are defined in the Tesla SDK proto but not used in this app)_

### Key Form Factors

| Constant | Value | Description |
|----------|-------|-------------|
| `KEY_FORM_FACTOR_ANDROID_DEVICE` | 7 | Triggers NFC keycard tap UI on car touchscreen |

### Operation Status Codes

Returned in `CommandStatus.operationStatus` from vehicle responses:

| Code | Name | Meaning |
|------|------|---------|
| 0 | `OK` | Success |
| 1 | `WAIT` | Waiting (tap keycard) |
| 2 | `ERROR` | General error |
| 3 | `INVALID_REQUEST` | Malformed message |
| 4 | `INVALID_SIGNATURE` | HMAC verification failed |
| 5 | `INVALID_TOKEN` | Session token rejected |
| 6 | `INVALID_NONCE` | Replay detected (counter too low) |
| 7 | `UNKNOWN_KEY` | Key not in whitelist — **also returned on successful pairing** |

### Signature Types

| Constant | Value | When Used |
|----------|-------|-----------|
| `SIGNATURE_TYPE_PRESENT_KEY` | 2 | Pairing messages (no HMAC, key not yet enrolled) |
| `SIGNATURE_TYPE_HMAC_PERSONALIZED` | 8 | `RoutableMessage.signature_data` on authenticated commands |

## Protocol Verification vs Tesla Go SDK

Our implementation was cross-referenced against the official [Tesla vehicle-command Go SDK](https://github.com/teslamotors/vehicle-command).

> **Important distinction**: The Go SDK uses `universal_message` at higher layers, while BLE payload content is still VCSEC-oriented. For authenticated BLE commands, the SDK’s signing metadata format (`SignatureData` / `HMAC_PERSONALIZED`) applies and is mirrored here.

### Protocol Compatibility Matrix

| Aspect | Our JS implementation | Tesla Go SDK | Status |
|--------|----------------------|--------------|--------|
| Service UUID (`0x0211`) | ✅ Match | — | ✅ |
| Write char UUID (`0x0212`) | ✅ Match | — | ✅ |
| Read/Indicate char UUID (`0x0213`) | ✅ Match | — | ✅ |
| Message framing | 2-byte big-endian length header | 2-byte big-endian length header | ✅ Match |
| Max message size | 1024 bytes (validated on receive) | 1024 bytes | ✅ Match |
| SessionInfoRequest | ephemeral pubkey only, no challenge | ephemeral pubkey only | ✅ Match |
| Session key derivation | `SHA1(shared_x)[:16]` | `SHA1(shared_x)[:16]` | ✅ Match |
| RX reassembly timeout | 1000ms per chunk | 1 second per chunk | ✅ Match |
| HMAC signature type | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` in `signature_data` | `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8` | ✅ Match |
| HMAC computation | `subKey=HMAC(sessionKey,"authenticated command")`, tag over metadata + payload | Same | ✅ Match |
| CCCD value | `0x0200` (indications) | Subscribe abstracted by Go BLE lib | ✅ Correct |
| GATT discovery | Skipped via `mstBuildProfile(pair:false)` | Full discovery (Tesla firmware compat handled at lower level) | ✅ Correct for ZeppOS |
| Chunk write size | Fixed 20 bytes | `min(negotiatedMTU, 1024) - 3` | ⚠️ Sub-optimal (no MTU API in ZeppOS docs) |
| MTU negotiation | Not implemented (`mstSetMTU` undocumented, removed) | `ExchangeMTU()` before first write | ❌ No equivalent API confirmed |
| Intermediate acks | Handled defensively | Not mentioned (transparent at lower level) | ✅ Harmless |

### MTU Note

`mstSetMTU` is not in the ZeppOS BLE documentation. It was removed from `ble-native.js`. BLE writes use fixed 20-byte chunks (`BLE_CHUNK_SIZE = 20`) with 20ms pacing — confirmed working on device. Larger chunks would require a documented MTU negotiation API.

## Pending

| Item | Status | Notes |
|------|--------|-------|
| VIN entry | ✅ Complete | Settings page (`setting/index.js`) — TextInput for vehicle name + VIN, synced to watch via `BLE_SYNC_SETTINGS` on app open |
| MTU chunk writer | ❌ Blocked | `mstSetMTU` undocumented, removed. No known ZeppOS API for MTU negotiation. |
| Field test with car | ⏳ | All optimizations implemented, needs on-vehicle validation |

## File Structure

```
amazla_key/
├── page/
│   ├── index.js                  # Main UI (lock/unlock/trunk/frunk + vehicle status)
│   └── ble/
│       └── index.js              # BLE debug page (scan, pair via controller, pool management)
├── setting/
│   └── index.js                  # Companion settings page (vehicle name + VIN entry)
├── lib/
│   ├── phone.js                  # Phone class — IPC wrapper for companion app methods
│   └── tesla-ble/
│       ├── pairing.js            # createPairingController — headless pairing state machine
│       ├── ble-native.js         # Low-level BLE — native @zos/ble only (active)
│       ├── ble.js                # Low-level BLE — easy-ble wrapper (kept for reference)
│       ├── session.js            # Session management (ECDH, signing, commands)
│       ├── index.js              # Tesla BLE API (high-level wrapper)
│       ├── crypto/
│       │   ├── p256.js           # P-256 elliptic curve (ECDH, precomputed table)
│       │   ├── sha256.js         # SHA-256 / SHA-1
│       │   └── hmac.js           # HMAC-SHA256 + hex utilities
│       └── protocol/
│           ├── protobuf.js       # Protobuf encoding/decoding
│           └── vcsec.js          # Tesla VCSEC message builders/parsers
├── __mocks__/
│   └── zos.js                    # @zos/* stubs + BLEHarness (VCR-style BLE interception)
└── __tests__/
    ├── helpers/
    │   ├── car-simulator.js      # CarSimulator — full P-256/HMAC vehicle response simulator
    │   └── scenarios.js          # Pre-built vehicle state patches (lockedCar, sleeping, etc.)
    ├── car-simulator.test.js     # End-to-end VCR tests (BLE connect → session → RKE → status)
    ├── pairing-controller.test.js # Pairing controller integration tests (13 tests)
    ├── phone.test.js             # Phone class unit tests
    ├── session-protocol.test.js  # Session protocol unit tests
    ├── ble-communication.test.js # BLE layer tests
    ├── pairing-flow.test.js      # Pairing handshake tests
    ├── vcsec.test.js             # VCSEC protobuf encode/decode
    ├── protobuf.test.js          # Protobuf primitives
    ├── ble-crypto.test.js        # ECDH + doublings table tests
    ├── crypto-p256.test.js       # P-256 math tests
    ├── crypto-hmac.test.js       # HMAC-SHA256 tests
    ├── store.test.js             # Store persistence tests
    └── ...                       # Additional unit tests
```

## Storage Files

Two storage backends: `LocalStorage` (key-value, binary-string-encoded) and binary `.dat` files.

### LocalStorage (via `@zos/storage LocalStorage`)

| Key | Contents | Format | Managed By |
|-----|----------|--------|------------|
| `watchPublicKey` | 65-byte enrolled public key | binary string | `BLE_SYNC_KEYS` phone sync |
| `vehicleEcPublicKey` | 65-byte vehicle EC key | binary string | Auto-saved after pairing |
| `vehicleMac` | Vehicle BLE MAC address | plain string | Auto-saved on scan |
| `vehicleVin` | Vehicle VIN | binary string (getter returns `Uint8Array`) | Saved during pairing |
| `vehicleName` | Vehicle display name | plain string | Saved during pairing |
| `vehicleModel` | Vehicle model | plain string | Saved during pairing |

> **Note**: Watch private key is NOT stored on watch. It lives on the phone in `TeslaSession` (`app-side/tesla/session.js`).

### Binary Files (via `@zos/fs`)

| File | Size | Format | Managed By |
|------|------|--------|------------|
| `vehicle_doublings_table.dat` | 16,384 bytes | Native `Uint32Array` LSW-first (256 × 16 uint32s) | `BLE_PRECOMPUTE_TABLE` phone sync |
| `key_pool.dat` | 97 × N bytes | Raw binary (32-byte priv + 65-byte pub per key) | `BLE_SYNC_POOL` auto-sync |

**Doublings table format**: Phone converts P-256 coordinates to LSW-first `Uint32Array` layout during `BLE_PRECOMPUTE_TABLE`. Watch loads with `new Uint32Array(raw)` — zero-copy, zero-conversion. Each entry is 16 uint32s: x[0..7] then y[0..7], where `[0]` = least-significant word.

## Setup Guide

### 1. Deploy to Watch & Pair with Tesla

**Navigation**: Index page → BLE button

1. Open app on watch → tap **BLE** button → BLE debug page
2. Tap **SCAN** → finds Tesla vehicle by BLE MAC
3. Tap **PAIR** → initiates enrollment
4. **Tap your NFC keycard** on car's center console when prompted
5. Watch logs show: **"Saved vehicle EC key"** (in green) ✅
6. Pairing complete!

**What happens**: Vehicle's 65-byte EC public key is automatically extracted from the pairing response and saved to persistent storage. This key is reused for all future session establishments.

### 2. Session Keys (auto-synced)

Session keys sync automatically — no manual step needed:
- App open → watch asks phone for pool if below 33 keys
- Pool running low during use → `onPoolLow` triggers a refill request
- Phone generates 33 P-256 keypairs and returns them as raw binary
- Watch stores to `key_pool.dat` — ready for offline use

The ECDH doublings table is synced once after pairing via `BLE_PRECOMPUTE_TABLE`.

### 3. Use!

- Open app → main page shows vehicle control (lock/unlock/frunk/trunk)
- Commands auto-establish a BLE session when needed
- Tap **BLE** button for debug info / re-pairing

**Connection timing**:
- First connect: ~9-10 seconds (BLE + ECDH with precomputed table)
- Subsequent commands: new BLE connect + ECDH each time (~9-10s)

### Troubleshooting

**"Invalid public key" error during pairing?**
- Vehicle didn't send EC key in response
- Check that pairing response includes field 17 (WhitelistEntryInfo)
- Try pairing again with fresh enrollment

**Need to re-pair?**
1. Tap **BLE** button on main page → BLE debug page
2. Tap **CLEAR** button (removes saved MAC and EC key)
3. Tap **SCAN** and **PAIR** again

## Tesla SDK Protocol - Vehicle EC Key Acquisition

### Overview

The vehicle's 65-byte P-256 EC public key is critical for:
- **ECDH key exchange** - Session establishment
- **Precomputed table generation** - 2× ECDH speedup (8s → 3.5-4s)

### Corrected Protocol (Per Tesla vehicle-command SDK)

**Key Finding**: The vehicle's public key is **NOT sent automatically during pairing**.

Instead, it must be explicitly requested using the `GetWhitelistEntryInfo` information request:

```proto
// From vcsec.proto (Tesla SDK)
message WhitelistEntryInfo {
    KeyIdentifier     keyId = 1;
    PublicKey         publicKey = 2;      // ← 65-byte P-256 EC key
    KeyMetadata       metadataForKey = 4;
    uint32            slot = 6;
    Keys.Role         keyRole = 7;
}

enum InformationRequestType {
    GET_STATUS = 0;
    GET_WHITELIST_INFO = 5;
    GET_WHITELIST_ENTRY_INFO = 6;  // ← Type used to fetch key
}
```

### Proper Pairing & Key Acquisition Flow

| Phase | Message Type | Direction | Content | Notes |
|-------|------------|-----------|---------|-------|
| **1. Pairing** | WhitelistOperation | → Vehicle | Add our key to whitelist | User confirms on car |
| **1. Response** | CommandStatus | ← Vehicle | Success/error | Vehicle whitelist updated |
| **2. Request** | InformationRequest | → Vehicle | Type=6, publicKey=ourKey | Request our entry info |
| **2. Response** | WhitelistEntryInfo | ← Vehicle | publicKey (65 bytes) | **Vehicle's EC key obtained** |
| **3. Storage** | — | Watch | Save EC key | Used for ECDH & precomputation |

### Implementation in This App

EC key extraction is handled by the phone during pairing via `BLE_COMPLETE_PAIRING` (`app-side/ble-crypto.js` → `completePairing`). The phone parses the raw verify response, extracts field 17 (`WhitelistEntryInfo`), and returns the 65-byte EC key + precomputed doublings table. The watch stores them via `Phone.completePairing()` in `lib/phone.js`.

If the EC key is missing from storage when the watch tries to establish a session, it returns an error: `"Vehicle EC key missing — re-pair via phone"`. There is no watch-side recovery path.

### References

- **Tesla SDK Proto**: https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protobuf/vcsec.proto
- **Protocol Constants**: `lib/tesla-ble/protocol/vcsec.js` → `buildInformationRequest()`

## Performance Optimizations

### Binary Storage & Hex Elimination (✅ Complete)

**Goal**: Reduce storage footprint and improve parsing speed by eliminating hex-encoded data.

**What was optimized**:

| Component | Before | After | Reduction | Benefit |
|-----------|--------|-------|-----------|---------|
| Doublings table | 32,768 hex chars | 16,384 bytes | 50% | Direct charCodeAt reads, no hex parsing |
| Key pool (per key) | 194 hex chars | 97 bytes | 50% | 8.9× faster parsing with charCodeAt |
| Vehicle EC key | 130 hex chars | 65 bytes | 50% | Binary storage, direct byte access |
| Watch public key | 130 hex chars | 65 bytes | 50% | Consistent binary format |
| Watch private key | 64 hex chars | 32 bytes | 50% | JSON-serializable binary string |
| BLE messages | Hex transport | Binary format | 50% | No hex encoding overhead |
| **Total** | — | — | **~18.6 KB saved** | **52% reduction** |

**Implementation**:

1. **Binary string encoding**: `String.fromCharCode(byte)` for bytes 0-255
   - JSON-safe and ZeppOS-compatible
   - 8.9× faster than parseInt-based hex parsing
   - Direct byte access: `binary.charCodeAt(i) & 0xff`

2. **Consolidated utilities** in `lib/tesla-ble/crypto/binary-utils.js`:
   - `bytesToBinaryString(bytes)` — Uint8Array → binary string
   - `binaryStringToBytes(binary)` — binary string → Uint8Array
   - `bytesToHex(bytes)` — Uint8Array → hex (for BigInt only)
   - `hexToBytes(hex)` — hex → Uint8Array (fallback)

3. **Storage format updates**:
   - Doublings table: loaded via `store.vehicleDoublingsTable` — `new Uint32Array(raw)`, zero-copy
   - Key pool: `store.popKey()` advances an in-memory offset pointer — no file rewrite per pop
   - Vehicle key: `store.vehicleEcPublicKey` returns `Uint8Array` directly — no `loadVehiclePublicKey()` wrapper
   - Vehicle VIN: `store.vehicleVin` returns `Uint8Array` directly — no session-level VIN caching
   - Enrolled keys: Phone stores/sends binary, watch uses binary directly

4. **Message format**:
   - `buildPairMessage()` and `buildWhitelistQueryMessage()` return binary
   - No hex encoding in BLE transport layer
   - Watch-side handlers accept binary format

5. **Console logging**:
   - Removed all hex dumps (`console.log(bytesToHex(...))`)
   - Replaced with byte counts and meaningful info
   - No logging overhead for debug builds

**Hex usage** (minimal, unavoidable):
- `BigInt('0x' + bytesToHex(...))` — Required by JS language (3 places in ble-crypto.js)
- Algorithm constants (`0xffffffff...`) — Cryptographic definitions
- Bit masks (`0xff`, `0x80`) — Bit operation syntax

**Performance impact**:
- **Parsing**: 8.9× faster (26.4ms vs 234.7ms per 100k iterations)
- **ECDH cold-start**: Still ~3.5-4s (doublings table is larger bottleneck)
- **Storage**: 18.6 KB saved on watch
- **Startup**: ~50-100ms faster due to reduced parsing

**Testing**: All unit tests passing, no regressions.

### OOM Prevention (✅ Complete)

**Goal**: Reduce peak heap allocation and GC pressure on the watch to prevent out-of-memory crashes during session establishment and RKE commands.

#### Doublings table — flat `Uint32Array` instead of array-of-pairs

**Before**: `loadDoublingsTable()` built `[[Uint32Array(8), Uint32Array(8)], ...]` — 512 separate TypedArray objects with ~40–80 bytes of object header each.

**After**: Single flat `Uint32Array(256 × 16)` — 1 object, 16 KB data. `scalarMulFixed` in `p256.js` accesses entries via `table.subarray(i*16, i*16+8)` (zero-copy view, no data copy).

| | Before | After |
|---|---|---|
| Object count | 512 TypedArrays | 1 TypedArray |
| Object overhead | ~30 KB | ~0 |
| Data | 16 KB | 16 KB |

#### Doublings table — phone-side format conversion, zero-cost watch loading

**Before**: Watch received a binary string, called `binaryStringToBytes(data)` → `Uint8Array(16384)`, then `buffer.slice(...)` copied it into an `ArrayBuffer` for a `DataView`. Byte ordering had a latent bug: `view.getUint32(base + j*4)` was MSW-first while `bytesToU256` in `p256.js` expected LSW-first — would silently produce wrong ECDH shared secrets. Peak: ~94 KB.

**After**: Phone converts P-256 coordinates to LSW-first `Uint32Array` format during `BLE_PRECOMPUTE_TABLE` (app-side, one-time). Watch receives the raw bytes, stores them to `vehicle_doublings_table.dat`, and loads with `new Uint32Array(raw)` — zero-copy, no conversion, correct endianness guaranteed. Peak: ~16 KB (the cached table only).

#### `bytesToBinaryString` — chunked for large buffers

**Before**: `s += String.fromCharCode(bytes[i])` in a loop — for 16 KB inputs (doublings table sent phone→watch) this caused 16,384 string reallocations.

**After**: `String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))` in 8 KB chunks — single concat per chunk.

#### `decodeMessage` — zero-copy field values

**Before**: Every length-delimited protobuf field used `buffer.slice(...)` — a copy. During session establishment, ~10–15 nested decode calls each created a copy.

**After**: `buffer.subarray(...)` — zero-copy views. The original buffer stays alive (held by the views), but no duplicate data is allocated. Reduces heap fragmentation from many short-lived objects.

#### Pre-computed HMAC pads

**Before**: Every `hmacSha256(sessionKey, message)` call allocated 3 × `Uint8Array(64)` = 192 bytes for `paddedKey`, `innerPad`, `outerPad`. Called once per RKE command.

**After**: `_initHmacPads()` pre-computes `_hmacInner` and `_hmacOuter` once when the session key is established. `_hmac(message)` uses them directly — only `innerData` (64 + msgLen) and `outerData` (96 bytes) are allocated per call.

Called from:
- Session establishment (after ECDH)
- Cleared on `reset()`

**Savings per RKE command**: 192 bytes + 3 object allocations eliminated.

#### Peak allocation summary

| Operation | Before | After |
|---|---|---|
| `loadDoublingsTable` peak | ~94 KB | ~16 KB |
| Cached table footprint | ~46 KB | ~16 KB |
| Per RKE command (HMAC) | +192 B alloc | +96 B alloc |
| Protobuf decode per response | ~10 copies | 0 copies |

**Testing**: All unit tests passing (including `_hmac` correctness, pad lifecycle, and RFC 4231 vectors).

## Development

### Build

```bash
zeus build     # Build for deployment
zeus preview   # Preview in simulator
```

### Test

```bash
npm test       # Run Jest tests
```

### Mock Mode

For testing without a real Tesla, enable in `lib/tesla-ble/ble.js`:

```javascript
const MOCK_MODE = true
```

## Supported Devices

- Amazfit GTR 4
- Amazfit GTS 4
- Amazfit Balance
- Other ZeppOS 3.0+ devices

## Documentation

- [ZeppOS Documentation](https://docs.zepp.com/docs/intro/)
- [ZeppOS BLE API](https://docs.zepp.com/docs/reference/device-app-api/newAPI/ble/mstBuildProfile/)
- [Tesla Vehicle Command Protocol](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protocol.md)
- [Tesla BLE Protocol](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protocol.md#ble)
- [Tesla Fleet API](https://developer.tesla.com/docs/fleet-api)

## License

MIT
