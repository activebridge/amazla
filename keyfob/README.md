# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **HTTP API Control** - Lock, unlock, climate, trunk via Tesla Fleet API
- **BLE Direct Control** - Bluetooth control without internet (standalone)
- **Session Key Pool** - Pre-generated keys for fast standalone operation
- **Vehicle Status** - Battery level, range, charging state, door status
- **Climate Control** - Start/stop HVAC, seat heaters, defrost

## Pages

1. **Vehicle Overview** - Top-down view showing doors, trunk, frunk status
2. **Main Dashboard** - Battery, range, odometer, charging status
3. **Climate Control** - Temperature, seat heaters, defrost
4. **BLE Controls** - Direct Bluetooth control (no internet required)

## BLE Setup

### Prerequisites

1. Generate a P-256 keypair for BLE authentication
2. Add keys to `secrets.js`:

```javascript
// 32 bytes hex (64 characters)
export const TESLA_PRIVATE_KEY = 'your_private_key_hex'

// 65 bytes hex (130 characters) - uncompressed public key starting with 04
export const TESLA_PUBLIC_KEY = '04...'
```

### Pairing (One-time setup)

1. Open the app and go to BLE controls page (slide 4)
2. Press **Setup** button (green) - this will:
   - Scan for nearby Tesla vehicles
   - Connect to the first Tesla found
   - Send pairing request
3. **Tap your key card on the car's center console** when prompted
4. The car will confirm the new key has been added
5. Press **Sync** button (blue) to generate session keys

### Session Key Sync

The watch needs session keys for standalone BLE operation. These are generated on the phone (P-256 crypto is too heavy for watch) and stored on watch.

- Press **Sync** to generate 5 session keys from phone
- Keys are stored in `session_keys.txt` on watch
- Status shows "Ready (X keys)" when keys are available
- Sync again when keys run low

### Usage

Once paired and synced:

1. **Setup** - Reconnect to car (uses saved MAC address)
2. **Sync** - Generate more session keys from phone
3. **Lock/Unlock/Trunk/Frunk** - Direct BLE control

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     STANDALONE OPERATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Watch                                            Tesla     │
│    │                                                │       │
│    │ 1. Pop session key from pool                   │       │
│    │ 2. ECDH handshake ────────────────────────────►│       │
│    │ 3. Send commands (HMAC signed) ───────────────►│       │
│    │                                                │       │
│    │ Works without phone!                           │       │
│    ▼                                                ▼       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      KEY SYNC (when needed)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Watch                          Phone                       │
│    │                              │                         │
│    │ BLE_GENERATE_SESSION_KEYS   │                         │
│    │─────────────────────────────►│ Generate P-256 keypairs │
│    │◄─────────────────────────────│                         │
│    │                              │                         │
│    │ Store keys locally           │                         │
│    ▼                              ▼                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Watch**: BLE communication, UI, stores session keys
- **Phone**: P-256 crypto for key generation (more memory)
- **Main key**: Stored in secrets.js, enrolled on car whitelist
- **Session keys**: Pre-generated pool for standalone operation

### Files

```
keyfob/
├── page/index.js          # Main UI with all controls
├── lib/
│   ├── ble-service.js     # BLE service with session key pool
│   └── tesla-ble/
│       ├── ble.js         # Low-level BLE communication
│       ├── session.js     # Session management and crypto
│       ├── index.js       # Tesla BLE API
│       ├── crypto/        # P-256, SHA-256, HMAC, AES-GCM
│       └── protocol/
│           ├── protobuf.js  # Protobuf encoding/decoding
│           └── vcsec.js     # Tesla VCSEC message builders
├── app-side/
│   ├── index.js           # Phone-side service handler
│   └── ble-crypto.js      # P-256 crypto for key generation
└── __tests__/             # Jest test suite (73 tests)
    ├── protobuf.test.js
    ├── vcsec.test.js
    └── ble-crypto.test.js
```

### Storage Files

- `session_keys.txt` - Pre-generated session keypairs (JSON)
- `ble_settings.txt` - BLE settings (saved MAC address)
- `vehicle.txt` - Cached vehicle data

## Development

### Building

```bash
zeus build     # Build for deployment
zeus preview   # Preview in simulator
```

### Testing

```bash
npm test       # Run Jest tests (73 tests)
```

### Mock Mode

For testing without a real Tesla, enable mock mode in `lib/tesla-ble/ble.js`:

```javascript
const MOCK_MODE = true  // Simulates BLE scan/connect/send
```

### Clear BLE State

If connection issues occur, use the **Clear** button on the BLE page to reset saved MAC address and session keys.

## Supported Devices

- Amazfit GTR 4
- Amazfit GTS 4
- Amazfit Balance
- Other ZeppOS 3.0+ devices

## License

MIT
