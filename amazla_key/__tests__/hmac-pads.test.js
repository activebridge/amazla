import { createHmac } from '../lib/tesla-ble/crypto/hmac.js'

test('createHmac precomputes inner/outer pads correctly', () => {
  const key = new Uint8Array(16).fill(0x42)
  const { innerPad, outerPad } = createHmac(key)
  for (let i = 0; i < 64; i++) {
    const k = i < 16 ? 0x42 : 0x00
    expect(innerPad[i]).toBe(k ^ 0x36)
    expect(outerPad[i]).toBe(k ^ 0x5c)
  }
})
