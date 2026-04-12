# BLE Key Optimization & Bug Fix Plan

Investigation compared our codebase against:
- Tesla Go SDK (`github.com/teslamotors/vehicle-command`)
- `vcsec.proto`, `signatures.proto`, `universal_message.proto`
- `@silver-zepp/easy-ble` BLEMaster API
- `@zeppos/zml` BasePage/BaseSideService

---

## Completed

### Bug #1 — `requestVehiclePublicKey`: positional args to `buildRoutableMessage`
**File:** `lib/tesla-ble/session.js` doFetch block  
**Root cause:** `buildRoutableMessage(toMsg, DOMAIN_VEHICLE_SECURITY)` used positional args; function expects a named-options object. Sent empty message silently.  
**Fix:** Switched to named-options object. Added 6 tests in `session-protocol.test.js`.

### Bug #2 — `getVehicleStatus`: `informationRequest` key silently dropped
**File:** `lib/tesla-ble/session.js`  
**Root cause:** Copilot-generated code passed `informationRequest` to `buildRoutableMessage` which doesn't recognise that key. Entire payload was missing. Also had dead `const self = this`.  
**Fix:** Rebuilt correctly: `UnsignedMessage → SignedMessage(HMAC) → ToVCSECMessage → payload`. Added 7 tests.

### Bug #3 — `page/ble/index.js` doVerify: EC key stored as wrong format
**File:** `page/ble/index.js`  
**Root cause:** Migration to binary storage updated `session.js` and `ble-crypto.js` but missed the doVerify block. `ecKey` (Uint8Array[65]) was hex-encoded before storage and passed as hex to `BLE_PRECOMPUTE_TABLE`.  
**Fix:** Added `bytesToBinaryString` import, stored key as binary string directly, passed binary to `BLE_PRECOMPUTE_TABLE`.

### Refactor — `buildDoublingsTable`: hex → binary input
**Files:** `app-side/ble-crypto.js`, `app-side/index.js`, `__tests__/ble-crypto.test.js`, `__tests__/doublings-binary-storage.test.js`  
**Root cause:** `ecKey` is already `Uint8Array[65]`; converting to 130-char hex string just to re-parse it was pointless.  
**Fix:** `buildDoublingsTable` now accepts 65-byte binary string. All tests updated.

### Bug #4 — HMAC architecture: wrong proto location, wrong key, wrong constant
**Files:** `lib/tesla-ble/protocol/vcsec.js`, `lib/tesla-ble/session.js`, `__tests__/session-protocol.test.js`

**Three compounding errors:**

1. **Wrong constant** — `SIGNATURE_TYPE_HMAC = 5`. Value 5 doesn't exist in `vcsec.proto SignatureType` enum (which only has `NONE=0`, `PRESENT_KEY=2`). Correct per `signatures.proto`: `SIGNATURE_TYPE_HMAC_PERSONALIZED = 8`.

2. **Wrong proto location** — HMAC metadata (counter, epoch, expiresAt, tag) was in `vcsec.proto SignedMessage` fields 4-7, which **do not exist** in that proto. Auth data belongs in `RoutableMessage.signature_data` (field 13) as:
   ```
   SignatureData {
     field 1: KeyIdentity { public_key = ephemeralPublicKey }
     field 8: HMAC_Personalized_data {
       field 1: epoch (bytes)
       field 2: counter (uint32 varint)
       field 3: expires_at (fixed32 little-endian)
       field 4: tag (32-byte HMAC result)
     }
   }
   ```

3. **Wrong HMAC key** — Was computing `HMAC-SHA256(sessionKey, payload)` directly. Per Tesla SDK (`native.go NewHMAC`): a sub-key is derived first, then used for the actual HMAC:
   ```
   subKey = HMAC-SHA256(sessionKey, "authenticated command")
   tag = HMAC-SHA256(subKey,
     [TAG_SIGNATURE_TYPE=0][len=1][8]    // HMAC_PERSONALIZED
     [TAG_DOMAIN=1][len=1][2]            // VEHICLE_SECURITY
     [TAG_PERSONALIZATION=2][len][VIN]   // VIN bytes
     [TAG_EPOCH=3][len][epoch]           // 16-byte epoch
     [TAG_EXPIRES_AT=4][4][uint32 BE]    // big-endian for metadata
     [TAG_COUNTER=5][4][uint32 BE]       // big-endian for metadata
     [0xFF]                              // TAG_END
     [ToVCSECMessage bytes]              // payload
   )
   ```
   Note: `expires_at` in the proto uses little-endian (fixed32), but in the HMAC metadata uses big-endian. Different encodings for the same value.

**Fix:**
- `buildSignedMessage` now only uses fields 2-3
- Added `buildKeyIdentity`, `buildHMACPersonalizedData`, `buildSignatureData` to `vcsec.js`
- `buildRoutableMessage` now accepts `signatureData` → field 13
- `_initHmacPads` pre-computes command sub-key pads: `HMAC(sessionKey, "authenticated command")`
- Added `_cmdHmac()` (sub-key HMAC) and `_buildHMACTag()` (full metadata construction)
- `buildAuthenticatedCommand` and `getVehicleStatus` produce correct wire format
- VIN infrastructure added: `this.vin`, `loadVehicleVIN()`, `setVehicleVIN()` — see VIN gap below
- Added 30 new tests covering `buildSignatureData`, `buildAuthenticatedCommand`, `_buildHMACTag`

**Current test count:** 290 passing (0 failing)

---

## Remaining

### VIN gap — HMAC personalization empty until wired up
**Priority: HIGH — commands will fail with `MESSAGEFAULT_ERROR_WRONG_PERSONALIZATION`**  
**Files:** `page/ble/index.js`, `app-side/index.js` or settings page  
Infrastructure exists (`setVehicleVIN`, `loadVehicleVIN`, storage key `vehicle_vin`) but VIN is never set.  
**Options:**
- Extract from BLE advertisement name (Tesla broadcasts last 8 chars of VIN in device name)
- Add VIN input field to the BLE setup page (`page/ble/index.js`)
- Fetch from phone-side Tesla API if user is logged in

### Bug #5 — `RKE_ACTION_OPEN_TRUNK=2`, `OPEN_FRUNK=3`: wrong command type
**Priority: HIGH**  
**File:** `lib/tesla-ble/protocol/vcsec.js`, `page/index.js`  
Tesla SDK uses `ClosureMoveRequest` (not RKE action enum) for trunk/frunk. RKE enum value 2 is `RKE_ACTION_OPEN_CHARGE_PORT`, not trunk. Opening trunk requires `UnsignedMessage.closureMoveRequest` with `ClosureMoveRequest { closureId: CLOSURE_REAR_TRUNK(5), moveType: CLOSURE_MOVE_TYPE_MOVE(0) }`.  
Fix: Add `buildClosureMoveRequest` to `vcsec.js`, update trunk/frunk handlers in `page/index.js`.

### Bug #6 — Duplicate protobuf helpers in `app-side/ble-crypto.js` (RESOLVED)
**Priority: LOW**  
Duplicate encoders removed; app-side now imports canonical helpers from `lib/tesla-ble/protocol/protobuf.js`.

### Bug #7 — Dead stubs in `app-side/index.js`
**Priority: LOW**  
`DOOR_LOCK` and `DOOR_UNLOCK` actions return hardcoded success without sending any BLE command. The actual BLE lock/unlock is done watch-side in `page/index.js` via `teslaSession.sendRKECommand`. These stubs are dead code that could mislead.  
Fix: Either remove or document as intentional no-ops.

### Bug #8 — Dead `newPool` variable in `page/ble/index.js`
**Priority: LOW**  
`newPool` is assigned but never used after being declared. Dead code left from a refactor.

### Bug #9 — `_waitingForSecondResponse` state leak
**Priority: MEDIUM**  
**File:** `lib/tesla-ble/session.js` `sendCommand`  
If the first response triggers the `_waitingForSecondResponse = true` path but the second response never arrives (timeout, BLE drop), the flag stays `true`. Next `sendCommand` call sees stale state. Needs timeout clear or reset on session teardown.

### Bug #10 — easy-ble `off` method misuse; potential double subscription on `TESLA_READ_UUID`
**Priority: MEDIUM**  
**File:** `lib/tesla-ble/ble.js`  
BLEMaster's `off` API signature differs from how it's being called. Also: on reconnect, `subscribe(TESLA_READ_UUID)` may be called again without unsubscribing first, leading to duplicate notification callbacks and doubled response handling.

---

## Architecture notes

- **Session key derivation** (SHA1 of ECDH shared secret, take 16 bytes) is correct per Tesla SDK `native.go`.
- **`expires_at` calculation** (`clockTime + 60`) is correct: vehicle clock time from SessionInfo + 60s lifetime.
- **Doublings table** (precomputed 256-entry fixed-base ECDH table) is correct. Binary storage (16384 bytes) saves 50% vs hex.
- **Key pool** (binary string, 97 bytes/key: 32 priv + 65 pub) format is correct.
- **`buildPairMessage` / `buildWhitelistQueryMessage`** in `app-side/ble-crypto.js` match vcsec.proto exactly (verified by tests).

## Updates (2026-04-12)

- Deduplicated protobuf helpers: removed duplicate encoders in app-side/ble-crypto.js; now imports canonical helpers from `lib/tesla-ble/protocol/protobuf.js`.
- Fixed page/index import path for buildClosureMoveRequest (avoids Rollup UNRESOLVED_IMPORT).
- Fixed test import in `__tests__/session-protocol.test.js` (added missing import).
- Ran full test suite: 11 suites, 290 tests — all passing locally.

## Immediate next steps

1. Audit easy-ble listener lifecycle (off/subscribe) and add reconnect tests to ensure no duplicate callbacks.
2. Make timers injectable (timer factory) to simplify unit tests and avoid global timer patching.
3. Remove or document dead stubs (app-side/index.js DOOR_*), and remove unused vars (page/ble/index.js `newPool`) where safe.
4. Validate HMAC end-to-end with a physical vehicle when available.

Last updated: 2026-04-12T07:22:39Z
