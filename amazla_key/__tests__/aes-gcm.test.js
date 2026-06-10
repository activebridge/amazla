import { createCipheriv, randomBytes } from 'crypto'
import { gcmEncrypt, gcmDecrypt } from '../lib/tesla-ble/crypto/aes-gcm.js'

const u8 = (buf) => new Uint8Array(buf)
const hex = (u) => Buffer.from(u).toString('hex')

// Reference AES-128-GCM via Node's crypto.
function nodeEncrypt(key, iv, pt, aad) {
  const c = createCipheriv('aes-128-gcm', Buffer.from(key), Buffer.from(iv))
  if (aad.length) c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(Buffer.from(pt)), c.final()])
  return { ct: u8(ct), tag: u8(c.getAuthTag()) }
}

describe('aes-gcm vs Node crypto', () => {
  test('matches Node ciphertext + tag across random sizes', () => {
    for (let trial = 0; trial < 200; trial++) {
      const key = u8(randomBytes(16))
      const nonce = u8(randomBytes(12))
      const ptLen = Math.floor(Math.random() * 80) // spans 0, sub-block, multi-block, non-aligned
      const aadLen = Math.floor(Math.random() * 40)
      const pt = u8(randomBytes(ptLen))
      const aad = u8(randomBytes(aadLen))

      const ref = nodeEncrypt(key, nonce, pt, aad)
      const ours = gcmEncrypt(key, nonce, pt, aad)

      expect(hex(ours.ciphertext)).toBe(hex(ref.ct))
      expect(hex(ours.tag)).toBe(hex(ref.tag))
    }
  })

  test('round-trips: our decrypt recovers our-encrypted plaintext', () => {
    for (let trial = 0; trial < 50; trial++) {
      const key = u8(randomBytes(16))
      const nonce = u8(randomBytes(12))
      const pt = u8(randomBytes(1 + Math.floor(Math.random() * 100)))
      const aad = u8(randomBytes(Math.floor(Math.random() * 20)))
      const { ciphertext, tag } = gcmEncrypt(key, nonce, pt, aad)
      const back = gcmDecrypt(key, nonce, ciphertext, aad, tag)
      expect(back).not.toBeNull()
      expect(hex(back)).toBe(hex(pt))
    }
  })

  test('our decrypt accepts Node-encrypted payloads', () => {
    const key = u8(randomBytes(16))
    const nonce = u8(randomBytes(12))
    const pt = u8(Buffer.from('charge port open over infotainment', 'utf-8'))
    const aad = u8(randomBytes(13))
    const ref = nodeEncrypt(key, nonce, pt, aad)
    const back = gcmDecrypt(key, nonce, ref.ct, aad, ref.tag)
    expect(hex(back)).toBe(hex(pt))
  })

  test('tampered tag → null (auth failure, not garbage plaintext)', () => {
    const key = u8(randomBytes(16))
    const nonce = u8(randomBytes(12))
    const pt = u8(randomBytes(40))
    const aad = u8(randomBytes(10))
    const { ciphertext, tag } = gcmEncrypt(key, nonce, pt, aad)
    const badTag = tag.slice()
    badTag[0] ^= 0x01
    expect(gcmDecrypt(key, nonce, ciphertext, aad, badTag)).toBeNull()
  })

  test('tampered AAD → null', () => {
    const key = u8(randomBytes(16))
    const nonce = u8(randomBytes(12))
    const pt = u8(randomBytes(24))
    const aad = u8(randomBytes(16))
    const { ciphertext, tag } = gcmEncrypt(key, nonce, pt, aad)
    const badAad = aad.slice()
    badAad[3] ^= 0xff
    expect(gcmDecrypt(key, nonce, ciphertext, badAad, tag)).toBeNull()
  })

  test('NIST GCM test vector (key/iv/pt/aad → ct/tag)', () => {
    // NIST gcmEncryptExtIV128 sample (16-byte key, 96-bit IV, with AAD).
    const h2u = (s) => u8(Buffer.from(s, 'hex'))
    const key = h2u('feffe9928665731c6d6a8f9467308308')
    const iv = h2u('cafebabefacedbaddecaf888')
    const pt = h2u(
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
    )
    const aad = h2u('feedfacedeadbeeffeedfacedeadbeefabaddad2')
    const { ciphertext, tag } = gcmEncrypt(key, iv, pt, aad)
    expect(hex(ciphertext)).toBe(
      '42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091',
    )
    expect(hex(tag)).toBe('5bc94fbc3221a5db94fae95ae7121a47')
  })
})
