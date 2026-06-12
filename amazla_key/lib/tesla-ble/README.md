# Tesla BLE Library for ZeppOS

Pure JavaScript implementation of Tesla BLE protocol for ZeppOS smartwatches.

## Session key (no on-watch ECDH)

The session key is a **constant** for a paired watch+vehicle:

```
sessionKey = sha1( ECDH(enrolledPrivateKey, vehiclePublicKey) )[:16]
```

Both inputs are long-term, static keys — the enrolled key and the vehicle's VCSEC identity key.
**Key custody:** the enrolled *private* key lives only on the phone (companion `settingsStorage`).
The watch stores just the enrolled *public* key (`watchPublicKey`) — all it needs for the
`SessionInfoRequest` identity — and never holds, receives, or uses a private key. The vehicle's
public key Q never changes between sessions; the official
[vehicle-command Go SDK](https://github.com/teslamotors/vehicle-command) enforces this by
rejecting any `SessionInfo` whose `publicKey` differs from the value used at initialization
(`signer.go: UpdateSessionInfo`). Per-session freshness (epoch / counter / clock_time) rides in
each message's HMAC, **not** in the key — so the key has no expiry.

Because the key is constant, the watch **never runs ECDH at runtime**:

- **At pairing / first connect** (phone present), the phone computes the ECDH directly with its
  BigInt P-256 — using the enrolled private key it holds — (`app-side/ble-crypto.js → computeSharedSecret`,
  IPC `BLE_COMPUTE_SHARED_SECRET`) and returns just the **32-byte shared secret**. The watch does
  `sha1(...)[:16]` and persists the 16-byte key (`session_key.dat`).
- **Every later connect** reuses the cached key — no phone, no ECDH, no table. The fast path is
  guarded by the stored vehicle pubkey matching the live `SessionInfo` pubkey; a mismatch (vehicle
  re-key) falls back to re-derivation via the phone. The SessionInfo HMAC is verified on every
  connect, so a stale/wrong key can never silently pass.

This replaced an earlier design where the phone precomputed a 16 KB fixed-base doublings table
(`table[i] = 2^i·Q`) and shipped it to the watch, which then ran a ~3.5–4 s fixed-base scalar
multiplication on each cold connect. **That table no longer crosses BLE or lives on the watch.**
The phone-side ECDH is proven bit-identical to the old `ecdhFixed(priv, table)` path by
`__tests__/crypto-p256.test.js`.

### Recovery

A missing/corrupted cached key (or a vehicle re-key) needs the phone to re-derive — i.e. re-pair.
There is no standalone on-watch ECDH fallback anymore (that was the point of dropping the table).

## Infotainment domain (AES-128-GCM) — one key per domain

The infotainment domain (`DOMAIN_INFOTAINMENT = 3`, charge port etc.) runs on a **different ECU
with its own P-256 key pair** — its `SessionInfo.publicKey` is not the VCSEC one, so it gets its
**own** session key:

```
infotainmentKey = sha1( ECDH(enrolledPrivateKey, d3PublicKey) )[:16]
```

Same derivation, same phone-side ECDH, same caching discipline (`inf_session_key.dat` guarded by
`inf_ec_public_key.dat`; cached only after the d3 SessionInfo HMAC tag verifies with it). Device
lesson 2026-06-11: reusing the VCSEC key for domain 3 is rejected with
`MESSAGEFAULT_ERROR_INVALID_SIGNATURE` (fault 5). Unlike VCSEC's HMAC subkeys, AES-GCM uses the
session key **directly**; the GCM AAD is `SHA256(metadata TLV ‖ 0xFF)`. Charge port over this
path is device-confirmed (2026-06-11), including standalone repeats on the cached key.

## Structure

```
tesla-ble/
  index.js          - Main entry point
  ble.js            - BLE transport (scan/connect, serialized chunked TX, reassembly)
  ble-name.js       - VIN → Tesla BLE local-name derivation
  session.js        - Session establishment, key caches (VCSEC + d3), command signing
  infotainment.js   - AES-GCM RoutableMessage assembly for domain-3 commands
  pairing.js        - Pairing / key enrollment flow
  crypto/
    p256.js         - P-256 (ecdhFixed — retained for the equivalence test only)
    sha256.js       - SHA-1 / SHA-256
    hmac.js         - HMAC-SHA256
    aes-gcm.js      - Pure-JS AES-128-GCM (verified byte-for-byte vs Node aes-128-gcm)
    binary-utils.js - byte/binary-string/hex helpers
  protocol/
    ...             - Tesla VCSEC / carserver / RoutableMessage encode + decode
```

The vehicle's session key is derived on the phone (`app-side/ble-crypto.js`), not here.

## Constraints

- No BigInt support in the ZeppOS QuickJS runtime (BigInt P-256 lives on the phone/companion side)
- Memory limited; pure-JavaScript crypto
- The watch performs SHA-1/SHA-256/HMAC and key handling, but **not** ECDH at runtime — that's
  done once on the phone (see "Session key" above). `crypto/p256.js`'s `ecdhFixed` is retained only
  for the cross-implementation equivalence test.

## Testing

```bash
npm test
```

Key crypto coverage: `__tests__/crypto-p256.test.js` (P-256 + the phone≡watch shared-secret
equivalence), `__tests__/session-edge.test.js`, `__tests__/car-simulator.test.js` (end-to-end
session establishment against a simulated vehicle).
