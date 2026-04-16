import { TeslaSession } from '../lib/tesla-ble/session.js'

describe('TeslaSession edge cases', () => {
  test('_buildHMACTag throws when _cmdHmacFn not initialized', () => {
    const s = new TeslaSession()
    s._cmdHmacFn = null
    expect(() => s._buildHMACTag(new Uint8Array(), 0, 0, new Uint8Array())).toThrow(/Command HMAC not initialized/)
  })
})
