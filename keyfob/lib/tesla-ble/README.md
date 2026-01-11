# Tesla BLE Library for ZeppOS

Pure JavaScript implementation of Tesla BLE protocol for ZeppOS smartwatches.

## Performance

Current ECDH performance on ZeppOS watch:
- **getPublicKey**: ~4s
- **ECDH**: ~4.6s
- **Total**: ~12s

Optimizations applied:
- wNAF-9 scalar multiplication with 128 precomputed G points (~42KB table)
- Specialized squaring (36 vs 64 multiplications)
- NIST P-256 fast reduction without BigInt
- Reciprocal multiplication for carry propagation (avoids slow division)
- Unrolled carry propagation loops
- No Math.floor/modulo in hot paths

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
