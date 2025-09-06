# Tesla BLE Keyfob Implementation Guide

## Overview
This ZeppOS app now implements Tesla's official BLE protocol for vehicle commands, based on specifications from Tesla's official `vehicle-command` repository.

## Tesla BLE Specifications

### Service and Characteristic UUIDs
- **Service UUID**: `00000211-b2d1-43f0-9b88-960cebf8b91e`
- **Write Characteristic**: `00000212-b2d1-43f0-9b88-960cebf8b91e` (write with response)
- **Read Characteristic**: `00000213-b2d1-43f0-9b88-960cebf8b91e`

### BLE Advertisement Pattern
Tesla vehicles advertise with local name pattern: `S + <VIN_SHA1_8bytes> + C`
- Example: `S1a87a5a75f3df858C` for VIN `5YJS0000000000000`
- The ID is the lower-case hex encoding of first 8 bytes of SHA1 digest of VIN

### Message Format
- All messages are preceded by 2-byte big-endian length encoding
- Format: `[length_high_byte, length_low_byte, ...message_data]`

## Authentication Requirements

Tesla's BLE protocol requires **end-to-end authentication**:

1. **Private Key**: Generate using `tesla-keygen` or equivalent
2. **Public Key Enrollment**: Must be enrolled on vehicle via Tesla app
3. **Command Authentication**: Each command must be cryptographically signed

### Current Implementation Status

✅ **Implemented:**
- Correct Tesla BLE service UUIDs
- Tesla device discovery pattern
- Message length prefixing
- Basic command structure

⚠️ **TODO - Authentication:**
- Generate/store private keys
- Implement protobuf message encoding
- Add command signatures
- Handle session management

## Security Note

The current implementation provides a **framework** but lacks Tesla's required authentication. Real Tesla vehicles will reject unauthenticated commands.

To make this functional, you need to:

1. Implement Tesla's protobuf message format
2. Add cryptographic command signing
3. Enroll your public key on the target vehicle
4. Handle Tesla's session management

## References

- [Tesla vehicle-command repository](https://github.com/teslamotors/vehicle-command)
- [Tesla BLE Protocol Documentation](https://github.com/teslamotors/vehicle-command/blob/main/pkg/protocol/protocol.md)
- [Tesla Developer API Guide](https://shankarkumarasamy.blog/2024/01/28/tesla-developer-api-guide-ble-key-pair-auth-and-vehicle-commands-part-3/)

## Files Modified

1. `app-side/tesla/keyfob.js` - Core BLE implementation
2. `app-side/tesla/ble-api.js` - API wrapper
3. `app-side/index.js` - Message dispatch handlers
4. `keyfob/page/index.js` - UI integration

## Usage

The app now includes a 5th slide with Bluetooth controls:
- **🔒 LOCK** / **🔓 UNLOCK** - Send commands via BLE
- **📡 SCAN** - Discover Tesla vehicles
- **🔗 CONNECT** - Connect to Tesla
- **❌ DISCONNECT** - Disconnect from Tesla

Navigate to slide 5 to access Bluetooth keyfob functionality.