# Amazla - Tesla Watch App

ZeppOS app for controlling Tesla vehicles from Amazfit smartwatches.

## Features

- **BLE Direct Control** - Bluetooth control without internet (standalone)
- **Passive Entry** - Auto-unlock when approaching car with app open
- **HTTP API Control** - Lock, unlock, climate, trunk via Tesla Fleet API
- **Vehicle Status** - Battery level, range, charging state, door status

## Recent Improvements (Latest)

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

**Real-World Impact** (updated):
| Scenario | Before | After Phase 1-3 | After Phase 4 | Total Saved |
|----------|--------|-----------------|---------------|-------------|
| First unlock | 18-19s | 13-14s | ~9-10s | ~9s ⚡⚡ |
| Reconnect (≤5 min) | 18-19s | <1s | <1s | 18s ⚡⚡⚡ |
| Lock + Unlock | 36-38s | 14-16s | ~10-12s | ~26s ⚡⚡⚡ |

### Connection Speed Optimization - Phase 1, 2, 3 (✅ Complete)

**Problem**: App launch → Connected took 18-19 seconds (8 sec ECDH + 5 sec stabilization + 2.5 sec delays)

**Solutions Implemented**:

#### Phase 1: Remove Artificial Delays
- Removed 1500ms unnecessary wait before BLE connect
- Reduced BLE stack stabilization from 5s to 2s
- **Savings: 4.5 seconds** → 13-14s total time

#### Phase 2: Session Persistence Across Reconnects (✨ Biggest Impact!)
- Preserve ECDH result for 5 minutes on disconnect
- On reconnect within 5 min window: Reuse cached session (skip 8-second ECDH!)
- **Savings: 18 seconds per reconnect** → <1s reconnection time
- **Example**: User opens door (13s) + closes door + sits in car → instant unlock (<1s)

#### Phase 3: Connection Keep-Alive Between Commands
- Keep BLE connection alive for 60 seconds after first command
- Each command extends timeout by 60 seconds
- Auto-disconnect after idle timeout to save battery
- **Savings: 16+ seconds per command in sequence**
- **Example**: LOCK (13s) + UNLOCK (1-2s) = 14-15s instead of 26s

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

### Navigation & Menu Structure (✅ Complete)
- **Index page is now main entry point**: Shows navigation menu with two buttons
  - **BLE DEBUG**: Access pairing, clear stored keys, manage enrollment
  - **PASSIVE**: Unlock/lock vehicle (main control interface)
- **Clear button**: Removes both stored MAC address and vehicle EC key for fresh pairing
- **HTTP temporarily disabled on index**: Focuses on BLE pairing flow

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
│                              KEY MANAGEMENT                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENROLLED KEY (Long-term identity)                                        │
│  ════════════════════════════════════                                        │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  secrets.js                                                     │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │ TESLA_PRIVATE_KEY = "abc123..." (32 bytes / 64 hex chars)   ││      │
│     │  │ TESLA_PUBLIC_KEY  = "04def..." (65 bytes / 130 hex chars)   ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Generated once, stored permanently                                     │
│     • Public key added to car's whitelist during pairing                     │
│     • Used to identify watch as authorized key                               │
│                                                                              │
│  2. SESSION KEYS (Ephemeral, for ECDH)                                       │
│  ═════════════════════════════════════                                       │
│                                                                              │
│     ┌─────────────────────────────────────────────────────────────────┐      │
│     │  session_keys.txt (Pool of pre-generated keypairs)              │      │
│     │  ┌─────────────────────────────────────────────────────────────┐│      │
│     │  │ [                                                           ││      │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││      │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││      │
│     │  │   { privateKeyHex: "...", publicKeyHex: "04..." },          ││      │
│     │  │   ...                                                       ││      │
│     │  │ ]                                                           ││      │
│     │  └─────────────────────────────────────────────────────────────┘│      │
│     └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│     • Generated on phone (P-256 key gen is slow)                             │
│     • Synced to watch via "GEN POOL" button (BLE DEBUG page)                 │
│     • One keypair consumed per session establishment                         │
│     • Used for ECDH key exchange with Tesla                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Sync Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SESSION KEY SYNC FLOW                              │
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
| `session_keys.txt` | Pool of pre-generated session keypairs | GEN POOL button (BLE DEBUG page) |
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

### 3. Deploy to Watch & Pair with Tesla

**Navigation**: Index page → BLE DEBUG button

1. Open app on watch → **INDEX PAGE** (main menu)
2. Tap **BLE DEBUG** button → Pairing interface
3. Tap **SCAN** button → Finds Tesla vehicle by BLE MAC
4. Tap **PAIR** button → Initiates enrollment
5. **Tap your NFC keycard** on car's center console when prompted
6. Watch logs show: **"Saved vehicle EC key"** (in green) ✅
7. Pairing complete!

**What happens**: Vehicle's 65-byte EC public key is automatically extracted from the pairing response and saved to persistent storage. This key is reused for all future session establishments.

### 4. Sync Session Keys

1. Still in BLE DEBUG page, tap **GEN POOL** button (needs phone connected)
2. Phone generates 5 P-256 keypairs
3. Keys stored on watch for offline use
4. Repeat when keys run low

### 5. Use!

**Navigation**: Index page → PASSIVE button

- Tap **PASSIVE** button → Main control interface
- **CONNECT** button: Establishes BLE session with vehicle
- **UNLOCK/LOCK/TRUNK** buttons: Send commands (works without phone)
- **Passive entry**: Just open app and approach car
- Session auto-establishes when needed

**Connection timing** (optimized with Phase 1-3):
- First connect: 13-14 seconds (app launch → ready)
- Reconnect (within 5 min): <1 second (uses cached session!)
- Commands in sequence: 1-2 seconds each (connection kept alive)
- Failure (car off): ~10 seconds (fast feedback)
- Multiple retries: Up to 3 attempts with adaptive timeouts

### Troubleshooting

**"Invalid public key" error during pairing?**
- Vehicle didn't send EC key in response
- Check that pairing response includes field 17 (WhitelistEntryInfo)
- Try pairing again with fresh enrollment

**Need to re-pair?**
1. Go to **BLE DEBUG** page
2. Tap **CLEAR** button (removes saved MAC and EC key)
3. Tap **SCAN** and **PAIR** again
4. This ensures fresh enrollment with new vehicle EC key

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

**File**: `lib/tesla-ble/session.js`

```javascript
// After pairing completes, call:
session.requestVehiclePublicKey((result) => {
  if (result.success) {
    // Vehicle public key obtained and saved to storage
    // Phone can now precompute ECDH doublings table
  }
})
```

**What happens**:
1. Builds `InformationRequest` with `GET_WHITELIST_ENTRY_INFO` (type 6)
2. Sends to vehicle via signed/encrypted BLE message
3. Parses `WhitelistEntryInfo` response
4. Extracts `publicKey` field (65 bytes)
5. Saves to persistent storage (`vehicle_ec_public_key`)
6. Triggers phone-side table precomputation

### Why This Matters

**Before this fix**:
- Code looked for field 17 in pairing completion response ❌
- Field 17 never appeared (wrong phase of protocol)
- EC key was never saved
- Precomputation table couldn't be generated
- ECDH always took 8 seconds

**After this fix**:
- Explicit `GetWhitelistEntryInfo` request ✅
- Vehicle responds with field 17 reliably
- EC key saved to storage
- Precomputation table generated on first connection
- Subsequent ECDH: 3.5-4 seconds (2× speedup)

### References

- **Tesla SDK Proto**: https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protobuf/vcsec.proto
- **Session Class**: `lib/tesla-ble/session.js` → `requestVehiclePublicKey()`
- **Protocol Constants**: `lib/tesla-ble/protocol/vcsec.js` → `buildInformationRequest()`

## Development

### Build

```bash
zeus build     # Build for deployment
zeus preview   # Preview in simulator
```

### Test

```bash
npm test       # Run 181 Jest tests
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
