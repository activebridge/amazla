# Codebase vs Tesla Go SDK Report

Comparison against `github.com/teslamotors/vehicle-command` (main branch).

## Completed

- **SessionInfo HMAC validation** — `session.js` verifies tag per `labelSessionInfo` +
  `TAG_SIGNATURE_TYPE(HMAC)` + VIN + request UUID after ECDH derivation.
  Matches Go SDK `UpdateSignedSessionInfo`. Rejects unauthenticated or
  tampered responses.
- **Single BLE indication handler** — dropped `mstOnCharaValueArrived` +
  RX dedup. Matches Go SDK `client.Subscribe(rxChar, true, ...)`.
- **Sessioninfo parser simplified** — only reads RoutableMessage field 15
  (dropped field 3/6 dead paths).
- **Concurrent session race guarded** — `sendCommand` routes through
  `ensureSessionEstablished` so pending callers queue on a single handshake.
- **Post-command refresh race** — busy-check before the 1 s refresh timer.
- **Pairing ambient skip cap** — bumped 3 → 5 after real-car traces.
- **Pool refresh gate** — main page `build()` syncs when `keyPoolCount < 10`;
  removed redundant `onPoolLow` reactive path.

## Bugs

### 1. Command response status ignored
**Files:** `lib/tesla-ble/session.js:281-309`, `lib/tesla-ble/protocol/vcsec.js:165-242`

`parseRoutableMessage` extracts `signedMessageStatus` (field 12) but
`sendCommand` never checks it. Any `signed_message_fault != 0` still returns
`success: true`. Lock/unlock failures appear successful in the UI.

### 2. `actionStatus` field number is wrong
**File:** `lib/tesla-ble/protocol/vcsec.js:237`

Spec reserves fields 1-5 in `RoutableMessage` (`universal_message.proto`). Real
action status lives inside `FromVCSECMessage`, which is nested in payload
field 10. Our extraction always returns null. The multi-response gating in
`sendCommand` relies on absent `actionStatus`, so the logic accidentally works
but for the wrong reason.

### 3. Non-CSPRNG for key pool + UUIDs
**Files:** `app-side/ble-crypto.js:74`, `lib/tesla-ble/protocol/vcsec.js:140,245`

`Math.random()` is used for P-256 private keys and routing/UUID nonces.
Predictable seeds mean potential key recovery risk. Use
`crypto.getRandomValues` / Web Crypto on the companion.

### 4. No command retry on transient errors
Go SDK has `ShouldRetry` + `RetryInterval` for counter mismatch, busy, and
epoch change. We fail hard and force the user to retry.

### 5. Clock drift not handled
`expiresAt = this.clockTime + 60` uses the frozen `clockTime` from the last
sessionInfo. Long-lived sessions (if we added session caching) would reject
commands as the car clock advances.

## Verified Correct vs SDK

- HMAC metadata: tags 0-5 + `0xff`, BE u32 encoding for counter/expiresAt
- Session key derivation: `sha1(sharedSecret)[:16]`
- Command subkey: `HMAC(sessionKey, "authenticated command")`
- SessionInfo subkey: `HMAC(sessionKey, "session info")`, signature type HMAC=6
- SignatureType `HMAC_PERSONALIZED = 8`
- `RoutableMessage` field numbers (6, 7, 10, 13, 14, 15, 50)
- Framing: 2-byte big-endian length prefix, 20-byte chunking, 1s RX reassembly
  timeout (matches `ble.go`)

## Improvements (no car needed)

### Priority
1. Parse + surface `signedMessageStatus` faults. Map to user-friendly errors.
2. Fix `actionStatus` extraction - parse `FromVCSECMessage` from field 10.
3. Swap `Math.random` -> companion CSPRNG for key pool and nonces.
4. Add retry logic (counter mismatch -> refresh session, clock drift ->
   refresh, busy -> backoff).

### Code quality
- `lib/tesla-ble/ble.js` and `ble-native.js` duplicate ~70% of logic. `ble.js`
  uses `@silver-zepp/easy-ble`, `ble-native.js` uses raw `@zos/ble`. Only native
  is imported by `session.js`. Delete `ble.js` or document why both exist.
- `_requeue` pattern leaks through callback chains
  (`session.js` -> `ble-native.js` -> UI). Replace with a proper state machine
  or a promise pipeline.
- `parsePairingResponse` is ~150 lines of pattern matching. Extract into
  strategies per field layout.

## Implementable Without Car

### High value
- **Tonneau commands** (Cybertruck): closure_ids 7-9 via existing
  `ClosureMoveRequest`. Add to `lib/tesla.js` + simulator scenarios.
- **Key management UI**: `AddKey`, `RemoveKey`, `KeySummary`, `KeyInfoBySlot`.
  All VCSEC, all HMAC-auth, all unit-testable. Enables key sharing between
  watches.
- **Status fault mapping** - enrich `parseVehicleStatus` + error codes.
- **Session caching** across page reloads (persist counter/epoch/sessionKey
  for the ~5min window) -> instant reconnect like Go SDK.
- **ECDH performance harness** - `__tests__/sha256-benchmark.js` already
  scaffolded, extend to full session timing.

### Infotainment domain (lights, horn, windows, sunroof, charge port)
Requires AES-GCM + separate handshake with domain 3. ~2x code, fully testable
via extended simulator. Flash/honk are crowd-pleasers for a watch app.

### Lower value / skip
- Wakeup RKE (needs BLE advertisement, low return)
- Fleet API bridge (we're BLE-only)

## Recommended Order

1. Bugs #1 + #2 (status checking) - users blame the watch when commands
   silently fail.
2. Key management (biggest feature ROI, fully offline-testable).
3. CSPRNG swap.
4. Retry / clock-drift handling.
