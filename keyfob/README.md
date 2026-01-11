# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **HTTP API Control** - Control via Tesla Fleet API (requires internet)
- **BLE Direct Control** - Control via Bluetooth (no internet needed)

## BLE Setup

### Prerequisites

1. Generate a P-256 keypair for BLE authentication
2. Add keys to `secrets.js`:

```javascript
// 32 bytes hex (64 characters)
export const TESLA_PRIVATE_KEY = 'your_private_key_hex'

// 65 bytes hex (130 characters) - uncompressed public key
export const TESLA_PUBLIC_KEY = '04...'
```

### Pairing (One-time setup)

The watch key must be enrolled on the car's whitelist before BLE commands work.

1. Open the app and go to BLE controls page (slide 4)
2. Press **Connect** to establish BLE connection with car
3. Press **Pair** button (green)
4. On the car's center console, tap your existing key card when prompted
5. The car will confirm the new key has been added

After pairing, you only need to Connect before sending commands.

### Usage

Once paired, the flow is:

1. **Connect** - Establish BLE connection (required each time)
2. **Lock/Unlock/Trunk/Frunk** - Send commands directly via Bluetooth

### Architecture

```
┌─────────────┐     BLE      ┌─────────────┐
│    Watch    │◄────────────►│    Tesla    │
│  (ZeppOS)   │   Direct     │   Vehicle   │
└─────────────┘              └─────────────┘
```

No internet required. Commands are authenticated using:
- ECDH key exchange (P-256)
- HMAC-SHA256 signatures
- Session-based counter for replay protection

### Files

- `lib/tesla-ble/` - BLE protocol implementation
  - `ble.js` - Low-level BLE communication
  - `session.js` - Session management, key exchange, command signing
  - `protocol/vcsec.js` - Tesla VCSEC message encoding/decoding
  - `crypto/` - P-256, AES-GCM, HMAC, SHA implementations
- `lib/ble-service.js` - High-level BLE service wrapper

### Memory Considerations

ZeppOS devices have limited memory. The P-256 crypto module (~62KB) cannot be loaded alongside the main page. Use the separate crypto page (`page/crypto/index`) for key generation.

## Building

```bash
zeus preview   # Preview in simulator
zeus build     # Build for deployment
```

## License

MIT
