import { sha1 } from './crypto/sha256.js'
import { bytesToHex } from './crypto/binary-utils.js'

// Tesla vehicles advertise as `S<sha1(VIN)[:8] hex>C` — 16 lowercase hex chars
// between an 'S' prefix and 'C' suffix. Identical derivation to Tesla's
// vehicle-command Go SDK `VehicleLocalName` in pkg/connector/ble/ble.go:
//
//   digest := sha1.Sum([]byte(vin))
//   return fmt.Sprintf("S%02xC", digest[:8])
//
// We must NEVER cache the BLE MAC and dial it directly: Tesla advertises
// under a random resolvable address that rotates every ~15 minutes. Scan
// by exact local name on every connect is the only reliable way to find
// the current MAC.
function computeTeslaBLEName(vinBytes) {
  if (!vinBytes || vinBytes.length === 0) return null
  const digest = sha1(vinBytes)
  return 'S' + bytesToHex(digest.subarray(0, 8)).toLowerCase() + 'C'
}

export { computeTeslaBLEName }
