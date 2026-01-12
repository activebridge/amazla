# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **BLE Direct Control** - Bluetooth control without internet (standalone)
- **Passive Entry** - Auto-unlock when approaching car with app open
- **HTTP API Control** - Lock, unlock, climate, trunk via Tesla Fleet API
- **Vehicle Status** - Battery level, range, charging state, door status

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM ARCHITECTURE                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐   │
│   │             │   BLE   │             │   BLE   │                     │   │
│   │    Watch    │◄───────►│    Phone    │         │       Tesla         │   │
│   │  (ZeppOS)   │  Sync   │  (Android)  │         │     (Vehicle)       │   │
│   │             │         │             │         │                     │   │
│   └──────┬──────┘         └─────────────┘         └──────────┬──────────┘   │
│          │                                                    │              │
│          │              Direct BLE Connection                 │              │
│          └────────────────────────────────────────────────────┘              │
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
│                              KEY MANAGEMENT                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENROLLED KEY (Long-term identity)                                        │
│  ════════════════════════════════════                                        │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  secrets.js                                                      │     │
│     │  ┌─────────────────────────────────────────────────────────────┐│     │
│     │  │ TESLA_PRIVATE_KEY = "abc123..." (32 bytes / 64 hex chars)   ││     │
│     │  │ TESLA_PUBLIC_KEY  = "04def..." (65 bytes / 130 hex chars)   ││     │
│     │  └─────────────────────────────────────────────────────────────┘│     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│     • Generated once, stored permanently                                     │
│     • Public key added to car's whitelist during pairing                     │
│     • Used to identify watch as authorized key                               │
│                                                                              │
│  2. SESSION KEYS (Ephemeral, for ECDH)                                       │
│  ═════════════════════════════════════                                       │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │  session_keys.txt (Pool of pre-generated keypairs)              │     │
│     │  ┌─────────────────────────────────────────────────────────────┐│     │
│     │  │ [                                                           ││     │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││     │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││     │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││     │
│     │  │   ...                                                       ││     │
│     │  │ ]                                                           ││     │
│     │  └─────────────────────────────────────────────────────────────┘│     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│     • Generated on phone (P-256 key gen is slow)                             │
│     • Synced to watch via "Sync" button                                      │
│     • One keypair consumed per session establishment                         │
│     • Used for ECDH key exchange with Tesla                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Sync Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SESSION KEY SYNC FLOW                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      Watch                                    Phone                          │
│        │                                        │                            │
│        │  ──────────────────────────────────►   │                            │
│        │     BLE_GENERATE_SESSION_KEYS          │                            │
│        │     { count: 5 }                       │                            │
│        │                                        │                            │
│        │                              ┌─────────┴─────────┐                  │
│        │                              │ For i = 1 to 5:   │                  │
│        │                              │   Generate P-256  │                  │
│        │                              │   keypair         │                  │
│        │                              │   (slow ~2-5 sec) │                  │
│        │                              └─────────┬─────────┘                  │
│        │                                        │                            │
│        │  ◄──────────────────────────────────   │                            │
│        │     { success: true, keys: [...] }     │                            │
│        │                                        │                            │
│   ┌────┴────┐                                   │                            │
│   │ Store   │                                   │                            │
│   │ keys in │                                   │                            │
│   │ file    │                                   │                            │
│   └────┬────┘                                   │                            │
│        │                                        │                            │
│        ▼                                        ▼                            │
│   Ready for standalone operation!                                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Pairing Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PAIRING FLOW                                     │
│                    (One-time setup to add watch as key)                       │
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
│   ┌────┴────┐                        │                       ┌────┴────┐    │
│   │ Display │                        │                       │ Tap key │    │
│   │ "Tap    │                        │  ◄── NFC Tap ──────   │ card on │    │
│   │ keycard"│                        │                       │ console │    │
│   └────┬────┘                        │                       └────┬────┘    │
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
│                        SESSION ESTABLISHMENT FLOW                             │
│              (Required before sending commands / passive entry)               │
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
│                              COMMAND FLOW                                     │
│                      (Lock, Unlock, Trunk, Frunk)                             │
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
│        │  ◄── CommandStatus(OK) ─────────────────────────  │                  │
│        │                                                  │                  │
│        ▼                                                  ▼                  │
│   Command executed!                                                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Passive Entry Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PASSIVE ENTRY FLOW                                  │
│              (Auto-unlock when approaching car with app open)                 │
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

## File Structure

```
keyfob/
├── secrets.js                    # Enrolled keypair (TESLA_PRIVATE_KEY, TESLA_PUBLIC_KEY)
├── page/
│   └── index.js                  # Main UI with all controls
├── lib/
│   ├── ble-service.js            # High-level BLE service
│   └── tesla-ble/
│       ├── ble.js                # Low-level BLE (scan, connect, send)
│       ├── session.js            # Session management (ECDH, commands)
│       ├── index.js              # Tesla BLE API
│       ├── crypto/
│       │   ├── p256.js           # P-256 elliptic curve (ECDH)
│       │   ├── sha256.js         # SHA-256 / SHA-1
│       │   ├── hmac.js           # HMAC-SHA256
│       │   └── aes-gcm.js        # AES-GCM encryption
│       └── protocol/
│           ├── protobuf.js       # Protobuf encoding/decoding
│           └── vcsec.js          # Tesla VCSEC message builders
├── app-side/
│   ├── index.js                  # Phone service handler
│   └── ble-crypto.js             # P-256 key generation (phone)
└── __tests__/                    # Jest tests (107 tests)
```

## Storage Files

| File | Contents | Managed By |
|------|----------|------------|
| `secrets.js` | Enrolled private/public keypair | Developer (manual) |
| `session_keys.txt` | Pool of pre-generated session keypairs | Sync button (from phone) |
| `ble_settings.txt` | Saved Tesla MAC address | Auto-saved on connect |
| `vehicle.txt` | Cached vehicle data | Auto-saved on API fetch |

## Setup Guide

### 1. Generate Enrolled Keypair

```bash
# Generate P-256 private key
openssl ecparam -genkey -name prime256v1 -noout -out private.pem

# Extract private key hex
openssl ec -in private.pem -text -noout 2>/dev/null | grep -A3 "priv:" | tail -3 | tr -d ' :\n'

# Extract public key hex (uncompressed, starts with 04)
openssl ec -in private.pem -text -noout 2>/dev/null | grep -A5 "pub:" | tail -5 | tr -d ' :\n'
```

### 2. Add Keys to secrets.js

```javascript
// 32 bytes hex (64 characters)
export const TESLA_PRIVATE_KEY = 'your_private_key_hex'

// 65 bytes hex (130 characters) - uncompressed, starts with 04
export const TESLA_PUBLIC_KEY = '04...'
```

### 3. Pair with Tesla

1. Open app on watch, go to BLE page (slide 4)
2. Tap **Setup** button
3. Watch scans and connects to Tesla
4. Watch sends pairing request
5. **Tap keycard on center console** when prompted
6. Watch is now an authorized key!

### 4. Sync Session Keys

1. Tap **Sync** button (needs phone connected)
2. Phone generates 5 P-256 keypairs
3. Keys stored on watch for offline use
4. Repeat when keys run low

### 5. Use!

- **Lock/Unlock/Trunk/Frunk** buttons work without phone
- **Passive entry**: Just open app and approach car
- Session auto-establishes when needed

## Development

### Build

```bash
zeus build     # Build for deployment
zeus preview   # Preview in simulator
```

### Test

```bash
npm test       # Run 107 Jest tests
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
