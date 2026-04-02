# Tesla BLE Library for ZeppOS

Pure JavaScript implementation of Tesla BLE protocol for ZeppOS smartwatches.

## Performance

Current ECDH performance on ZeppOS watch:
- **ECDH (arbitrary point, dynamic precomputation)**: ~7.7s (with wNAF-4, 8 precomputed points)

Optimizations applied:
- wNAF-4 scalar multiplication with 8 dynamically precomputed points (~1.5KB)
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
- `ECDH` used dynamic wNAF-4 for arbitrary points (~7.7s) - current approach

Note: Vehicle's public key is ephemeral (changes per session), so static precomputation won't help.

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
