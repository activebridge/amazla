# Tesla BLE Library for ZeppOS

Pure JavaScript implementation of Tesla BLE protocol for ZeppOS smartwatches.

## Performance

ECDH performance on ZeppOS watch:
- **Cold ECDH with precomputed table (Phase 4)**: ~3.5–4s (fixed-base binary method, 0 doublings)
- **Cold ECDH without table (fallback)**: ~7.7s (wNAF-4, 8 dynamically precomputed points)
- **Warm ECDH (reconnect ≤5 min)**: <50ms (Phase 2 session cache)

### Phase 4: Fixed-base scalar multiplication via precomputed doublings table

The vehicle's public key Q is its **long-term VCSEC identity key** — it never changes between
sessions. This is enforced by the Tesla protocol: the official
[vehicle-command Go SDK](https://github.com/teslamotors/vehicle-command) explicitly rejects any
`SessionInfo` where `publicKey` differs from the value used at initialization
(`signer.go: UpdateSessionInfo`).

Because Q is fixed, the phone precomputes `table[i] = 2^i * Q` for i = 0..255 during pairing
and stores the result (16 KB) on the watch. Every subsequent ECDH replaces 256 point doublings
with ~128 mixed additions using the precomputed table:

```
k * Q = Σ table[i]  for each bit i where k_i = 1
```

No doublings are needed at ECDH time — they were all done once, offline, on the phone.

### Optimizations applied (all active)

- **Fixed-base doublings table** (Phase 4): eliminates all point doublings from ECDH hot path
- wNAF-4 scalar multiplication fallback with 8 dynamically precomputed points (~1.5KB)
- Batch inversion for precomputed points (single modular inverse)
- Specialized squaring (36 vs 64 multiplications)
- NIST P-256 fast reduction without BigInt
- Reciprocal multiplication for carry propagation (avoids slow division)
- Unrolled carry propagation loops
- No Math.floor/modulo in hot paths
- Float64 intermediate arithmetic for 32-bit carry propagation

### Historical context

Previous versions had separate optimizations for different operations:
- `getPublicKey()` used static wNAF-8 table for generator G (~4s) - no longer used on watch
- `ECDH` used dynamic wNAF-4 for arbitrary points (~7.7s) - current fallback path

## Structure

```
tesla-ble/
  index.js        - Main entry point
  ble.js          - BLE communication layer
  keys.js         - Key management and storage
  session.js      - Session handling
  crypto/
    p256.js       - P-256 elliptic curve (ECDH, key generation)
    sha256.js     - SHA-256 hash
    hmac.js       - HMAC-SHA256
    aes-gcm.js    - AES-128-GCM encryption
    tables/
      g-wnaf8.js  - Precomputed wNAF-8 table for G
    test-p256.js  - P-256 correctness tests
  protocol/
    ...           - Tesla protocol messages
```

## Constraints

- No BigInt support in ZeppOS QuickJS runtime
- Memory limited (~42KB max for precomputed tables)
- All crypto implemented in pure JavaScript

## Testing

```bash
cd crypto
node test-p256.js
```

## Usage

```javascript
import { checkBigInt, generatePrivateKey, getPublicKey, ecdh } from './crypto/p256.js'

// Generate key pair
const privateKey = generatePrivateKey()
const publicKey = getPublicKey(privateKey)

// ECDH shared secret
const sharedSecret = ecdh(privateKey, otherPublicKey)
```
