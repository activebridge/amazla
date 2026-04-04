# How to Save Vehicle Public Key (One-Time Setup)

## Your Vehicle's Public Key
```
048182f275a4eef98382745d43d8bf86cf1931910343e2c75337a01adf6d58ee953424543b3fec74cfff934e0db68b9514700396c646df19a171caa3290d837be4
```

## Method 1: Via Watch Console (EASIEST)

1. Deploy app to watch: `zeus build && zeus preview`
2. Open BLE debugging page on watch
3. Open browser console (Chrome DevTools)
4. Run this command:

```javascript
// Save vehicle public key to watch storage
var storage = { data: {} };
try {
  var json = readFileSync({ path: 'ble_settings.txt', options: { encoding: 'utf8' } });
  storage.data = json ? JSON.parse(json) : {};
} catch (e) { storage.data = {}; }

storage.data['vehicle_ec_public_key'] = '048182f275a4eef98382745d43d8bf86cf1931910343e2c75337a01adf6d58ee953424543b3fec74cfff934e0db68b9514700396c646df19a171caa3290d837be4';

writeFileSync({ 
  path: 'ble_settings.txt', 
  data: JSON.stringify(storage.data), 
  options: { encoding: 'utf8' } 
});

console.log('✓ Saved vehicle EC key to storage');
```

5. Done! Now sessions will work.

## Method 2: Add to BLE Page UI (PERMANENT)

Add a button to the BLE page that saves the key from logs.

Would need to:
1. Add text input for vehicle key
2. Add "Save Vehicle Key" button
3. Store to ble_settings.txt

## Method 3: Auto-Extract from Pairing Logs (FUTURE)

The vehicle key appears in ZeppOS BLE messaging logs but not in the VCSEC response.
Could modify app-side to capture and return it.

## Verification

After saving, check that it worked:

1. Open passive page
2. Watch logs should show:
   ```
   [SESSION] Loaded vehicle public key from storage: 048182f275a4...
   [SESSION] ECDH: Using standard path (~8 seconds)
   [SESSION] Session established successfully
   ```

3. Status should change to "READY"
4. Unlock/lock should work!

## Why This Approach?

- ✅ Vehicle key is per-vehicle, not hardcoded
- ✅ Stored on watch, just like MAC address
- ✅ One-time setup, works forever
- ✅ Can pair with multiple vehicles (each has its own key)
- ✅ No secrets in source code

## Security Note

The vehicle's PUBLIC key is not sensitive data:
- It's already broadcast over BLE during pairing
- It's like the vehicle's "identity" - public information
- Your watch's PRIVATE key stays secure in device storage
- Each session uses NEW ephemeral keys (forward secrecy)
