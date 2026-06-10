import { createHash, createCipheriv } from 'crypto'
import {
  buildAesGcmMetadataInput,
  buildAesGcmSignatureData,
} from '../lib/tesla-ble/protocol/vcsec.js'
import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'
import { gcmEncrypt } from '../lib/tesla-ble/crypto/aes-gcm.js'
import { sha256 } from '../lib/tesla-ble/crypto/sha256.js'

const hex = (u) => Buffer.from(u).toString('hex')

describe('AES-GCM signing (infotainment domain)', () => {
  const vin = new Uint8Array(17).fill(0x41) // 'AAAA…'
  const epoch = new Uint8Array(16).fill(0x07)
  const DOMAIN_INFOTAINMENT = 3
  const counter = 1
  const expiresAt = 0x12345678

  test('metadata TLV matches the exact Tesla extractMetadata byte layout', () => {
    const tlv = buildAesGcmMetadataInput(vin, DOMAIN_INFOTAINMENT, epoch, counter, expiresAt)
    const expected = [
      0x00, 0x01, 0x05, // TAG_SIGNATURE_TYPE = AES_GCM_PERSONALIZED(5)
      0x01, 0x01, 0x03, // TAG_DOMAIN = INFOTAINMENT(3)
      0x02, 0x11, ...new Array(17).fill(0x41), // TAG_PERSONALIZATION = VIN(17)
      0x03, 0x10, ...new Array(16).fill(0x07), // TAG_EPOCH(16)
      0x04, 0x04, 0x12, 0x34, 0x56, 0x78, // TAG_EXPIRES_AT (uint32 BE)
      0x05, 0x04, 0x00, 0x00, 0x00, 0x01, // TAG_COUNTER (uint32 BE)
      0xff, // TAG_END (no payload — encrypted)
    ]
    expect(hex(tlv)).toBe(hex(new Uint8Array(expected)))
  })

  test('AAD = SHA256(metadata TLV) — our sha256 matches Node', () => {
    const tlv = buildAesGcmMetadataInput(vin, DOMAIN_INFOTAINMENT, epoch, counter, expiresAt)
    const ours = sha256(tlv)
    const node = new Uint8Array(createHash('sha256').update(Buffer.from(tlv)).digest())
    expect(hex(ours)).toBe(hex(node))
  })

  test('end-to-end: command encrypts under the metadata-derived AAD (matches Node GCM)', () => {
    const sessionKey = new Uint8Array(16).fill(0x2a) // stand-in for sha1(ECDH)[:16]
    const nonce = new Uint8Array(12).fill(0x09)
    const plaintext = new Uint8Array(Buffer.from('open charge port', 'utf-8'))

    const tlv = buildAesGcmMetadataInput(vin, DOMAIN_INFOTAINMENT, epoch, counter, expiresAt)
    const aad = sha256(tlv)

    const ours = gcmEncrypt(sessionKey, nonce, plaintext, aad)

    const c = createCipheriv('aes-128-gcm', Buffer.from(sessionKey), Buffer.from(nonce))
    c.setAAD(Buffer.from(aad))
    const refCt = Buffer.concat([c.update(Buffer.from(plaintext)), c.final()])
    const refTag = c.getAuthTag()

    expect(hex(ours.ciphertext)).toBe(hex(new Uint8Array(refCt)))
    expect(hex(ours.tag)).toBe(hex(new Uint8Array(refTag)))
  })

  test('SignatureData protobuf: signer_identity(1) + AES_GCM_Personalized_data(5) fields', () => {
    const pub = new Uint8Array(65).fill(0x04)
    const nonce = new Uint8Array(12).fill(0x09)
    const tag = new Uint8Array(16).fill(0xab)
    const sd = buildAesGcmSignatureData(pub, epoch, nonce, counter, expiresAt, tag)

    const fields = decodeMessage(sd)
    // field 1 = KeyIdentity { public_key(1) }
    const keyId = decodeMessage(fields[1])
    expect(keyId[1].length).toBe(65)
    // field 5 = AES_GCM_Personalized_Signature_Data
    const gcm = decodeMessage(fields[5])
    expect(gcm[1].length).toBe(16) // epoch
    expect(gcm[2].length).toBe(12) // nonce
    expect(gcm[3]).toBe(1) // counter (varint)
    // field 4 = expires_at, fixed32 LE → 0x12345678 little-endian bytes
    expect(hex(gcm[4])).toBe('78563412')
    expect(gcm[5].length).toBe(16) // tag
  })
})
