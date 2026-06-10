import { createDecipheriv } from 'crypto'
import { buildAesGcmCommand, buildNonce, aesGcmAad } from '../lib/tesla-ble/infotainment.js'
import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'
import { gcmDecrypt } from '../lib/tesla-ble/crypto/aes-gcm.js'

const hex = (u) => Buffer.from(u).toString('hex')

describe('infotainment AES-GCM command assembly', () => {
  const sessionKey = new Uint8Array(16).fill(0x2a)
  const vin = new Uint8Array(Buffer.from('5YJ3E1EA0JF154426', 'utf-8'))
  const pub = new Uint8Array(65).fill(0x04)
  const epoch = new Uint8Array(16).fill(0x07)
  const counter = 5
  const expiresAt = 0x0000a1b2
  const routingAddress = new Uint8Array(16).fill(0x33)
  const uuid = new Uint8Array(16).fill(0x44)
  const plaintext = new Uint8Array(Buffer.from('VehicleAction:ChargePortDoorOpen', 'utf-8'))

  function build(extra = {}) {
    return buildAesGcmCommand({
      sessionKey, vin, signerPublicKey: pub, epoch, counter, expiresAt, routingAddress, uuid, plaintext, ...extra,
    })
  }

  test('RoutableMessage carries domain=3, ciphertext payload (field 10), sig (field 13)', () => {
    const { message } = build()
    const fields = decodeMessage(message)
    // field 6 = Destination { domain(1) = 3 }
    expect(decodeMessage(fields[6])[1]).toBe(3)
    // field 10 = payload (ciphertext) — same length as plaintext (GCM is a stream cipher)
    expect(fields[10].length).toBe(plaintext.length)
    expect(hex(fields[10])).not.toBe(hex(plaintext)) // actually encrypted
    // field 13 = signature_data
    expect(fields[13]).toBeDefined()
    // field 51 = uuid
    expect(hex(fields[51])).toBe(hex(uuid))
  })

  test('round-trips: decrypting the wire payload with the metadata AAD recovers the command', () => {
    const { message, nonce } = build()
    const fields = decodeMessage(message)
    const ciphertext = fields[10]
    const sig = decodeMessage(fields[13])
    const gcm = decodeMessage(sig[5])
    const sigNonce = gcm[2]
    const tag = gcm[5]
    expect(hex(sigNonce)).toBe(hex(nonce)) // nonce in sig matches the one used to encrypt

    const aad = aesGcmAad(vin, 3, epoch, counter, expiresAt)
    const back = gcmDecrypt(sessionKey, sigNonce, ciphertext, aad, tag)
    expect(back).not.toBeNull()
    expect(hex(back)).toBe(hex(plaintext))
  })

  test('a Tesla-side verifier (Node GCM) would authenticate + decrypt it', () => {
    const { message } = build()
    const fields = decodeMessage(message)
    const ciphertext = fields[10]
    const gcm = decodeMessage(decodeMessage(fields[13])[5])
    const nonce = gcm[2]
    const tag = gcm[5]
    const aad = aesGcmAad(vin, 3, epoch, counter, expiresAt)

    const d = createDecipheriv('aes-128-gcm', Buffer.from(sessionKey), Buffer.from(nonce))
    d.setAAD(Buffer.from(aad))
    d.setAuthTag(Buffer.from(tag))
    const pt = Buffer.concat([d.update(Buffer.from(ciphertext)), d.final()])
    expect(hex(new Uint8Array(pt))).toBe(hex(plaintext))
  })

  test('nonce: last 4 bytes = counter (BE), guaranteeing per-message uniqueness', () => {
    const n = buildNonce(0x01020304)
    expect(hex(n.subarray(8))).toBe('01020304')
    // different counters → different nonces (uniqueness within a session)
    expect(hex(buildNonce(1).subarray(8))).not.toBe(hex(buildNonce(2).subarray(8)))
  })

  test('wrong AAD (tampered counter) fails authentication', () => {
    const { message, nonce } = build()
    const ciphertext = decodeMessage(message)[10]
    const tag = decodeMessage(decodeMessage(decodeMessage(message)[13])[5])[5]
    const wrongAad = aesGcmAad(vin, 3, epoch, counter + 1, expiresAt) // counter mismatch
    expect(gcmDecrypt(sessionKey, nonce, ciphertext, wrongAad, tag)).toBeNull()
  })
})
