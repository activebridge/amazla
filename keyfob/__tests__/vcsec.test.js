import {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_OPEN_TRUNK,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  buildRoutableMessage,
  buildSessionInfoRequest,
  buildUnsignedMessage,
  buildSignedMessage,
  buildToVCSECMessage,
  buildKeyToAdd,
  buildWhitelistOperation,
  buildUnsignedMessageWithWhitelist,
  parseSessionInfo,
  parseRoutableMessage,
  generateUUID,
  generateRoutingAddress
} from '../lib/tesla-ble/protocol/vcsec.js'

import { decodeMessage } from '../lib/tesla-ble/protocol/protobuf.js'

describe('VCSEC Protocol', () => {
  describe('Constants', () => {
    test('domain constants are defined', () => {
      expect(DOMAIN_VEHICLE_SECURITY).toBe(2)
    })

    test('RKE action constants are defined', () => {
      expect(RKE_ACTION_UNLOCK).toBe(0)
      expect(RKE_ACTION_LOCK).toBe(1)
      expect(RKE_ACTION_OPEN_TRUNK).toBe(2)
    })

    test('key role constants are defined', () => {
      expect(KEY_ROLE_OWNER).toBe(0)
    })
  })

  describe('generateUUID', () => {
    test('generates 16 bytes', () => {
      const uuid = generateUUID()
      expect(uuid).toBeInstanceOf(Uint8Array)
      expect(uuid.length).toBe(16)
    })

    test('generates different values', () => {
      const uuid1 = generateUUID()
      const uuid2 = generateUUID()
      expect(Array.from(uuid1)).not.toEqual(Array.from(uuid2))
    })
  })

  describe('generateRoutingAddress', () => {
    test('generates 16 bytes', () => {
      const addr = generateRoutingAddress()
      expect(addr).toBeInstanceOf(Uint8Array)
      expect(addr.length).toBe(16)
    })
  })

  describe('buildSessionInfoRequest', () => {
    test('builds request with public key', () => {
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04 // Uncompressed point marker
      const challenge = new Uint8Array(16)

      const request = buildSessionInfoRequest(publicKey, challenge)
      expect(request).toBeInstanceOf(Uint8Array)
      expect(request.length).toBeGreaterThan(0)

      // Decode and verify structure
      const decoded = decodeMessage(request)
      expect(decoded[1]).toBeDefined() // public key field
      expect(decoded[2]).toBeDefined() // challenge field
      expect(decoded[1].length).toBe(65)
      expect(decoded[2].length).toBe(16)
    })

    test('builds request with only public key', () => {
      const publicKey = new Uint8Array(65)
      const request = buildSessionInfoRequest(publicKey, null)

      const decoded = decodeMessage(request)
      expect(decoded[1]).toBeDefined()
      expect(decoded[2]).toBeUndefined()
    })
  })

  describe('buildUnsignedMessage', () => {
    test('builds unlock message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_UNLOCK })
      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBe(RKE_ACTION_UNLOCK)
    })

    test('builds lock message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_LOCK })

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBe(RKE_ACTION_LOCK)
    })

    test('builds trunk message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_OPEN_TRUNK })

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBe(RKE_ACTION_OPEN_TRUNK)
    })
  })

  describe('buildSignedMessage', () => {
    test('builds signed message with all fields', () => {
      const payload = new Uint8Array([0x08, 0x01]) // RKE unlock
      const signature = new Uint8Array(32)
      const epoch = new Uint8Array(16)

      const message = buildSignedMessage({
        payload,
        signatureType: SIGNATURE_TYPE_HMAC,
        signature,
        counter: 1,
        epoch,
        expiresAt: 1234567890
      })

      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBeDefined() // payload
      expect(decoded[2]).toBe(SIGNATURE_TYPE_HMAC) // signatureType
      expect(decoded[5]).toBeDefined() // signature
      expect(decoded[8]).toBe(1) // counter
      expect(decoded[9]).toBeDefined() // epoch
      expect(decoded[10]).toBe(1234567890) // expiresAt
    })

    test('builds message without optional fields', () => {
      const payload = new Uint8Array([0x08, 0x00])

      const message = buildSignedMessage({ payload })

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBeDefined()
      expect(decoded[2]).toBeUndefined()
      expect(decoded[5]).toBeUndefined()
    })
  })

  describe('buildToVCSECMessage', () => {
    test('wraps signed message in field 1', () => {
      const signedMessage = new Uint8Array([0x01, 0x02, 0x03])
      const wrapped = buildToVCSECMessage(signedMessage)

      const decoded = decodeMessage(wrapped)
      expect(Array.from(decoded[1])).toEqual([0x01, 0x02, 0x03])
    })
  })

  describe('buildKeyToAdd', () => {
    test('builds key with default role and form factor', () => {
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const keyToAdd = buildKeyToAdd(publicKey)

      const decoded = decodeMessage(keyToAdd)
      expect(decoded[1].length).toBe(65) // public key
      expect(decoded[2]).toBe(KEY_ROLE_OWNER) // role
      expect(decoded[6]).toBe(KEY_FORM_FACTOR_ANDROID_DEVICE) // form factor
    })

    test('builds key with custom role', () => {
      const publicKey = new Uint8Array(65)
      const keyToAdd = buildKeyToAdd(publicKey, 1, KEY_FORM_FACTOR_ANDROID_DEVICE) // DRIVER role

      const decoded = decodeMessage(keyToAdd)
      expect(decoded[2]).toBe(1)
    })
  })

  describe('buildWhitelistOperation', () => {
    test('wraps key in whitelist operation', () => {
      const keyToAdd = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])
      const operation = buildWhitelistOperation(keyToAdd)

      const decoded = decodeMessage(operation)
      expect(decoded[1]).toBeDefined()
    })
  })

  describe('buildUnsignedMessageWithWhitelist', () => {
    test('wraps whitelist in field 16', () => {
      const whitelist = new Uint8Array([0x0a, 0x03, 0x01, 0x02, 0x03])
      const message = buildUnsignedMessageWithWhitelist(whitelist)

      const decoded = decodeMessage(message)
      expect(decoded[16]).toBeDefined()
    })
  })

  describe('buildRoutableMessage', () => {
    test('builds message with domain destination', () => {
      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        uuid: new Uint8Array(16)
      })

      expect(message).toBeInstanceOf(Uint8Array)

      const decoded = decodeMessage(message)
      expect(decoded[1]).toBeDefined() // to_destination
      expect(decoded[12]).toBeDefined() // uuid
    })

    test('builds message with routing address', () => {
      const routingAddress = new Uint8Array(16).fill(0xab)

      const message = buildRoutableMessage({
        routingAddress,
        payload: new Uint8Array([0x01, 0x02])
      })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBeDefined() // from_destination
      expect(decoded[3]).toBeDefined() // payload
    })

    test('builds message with session info request', () => {
      const sessionInfoRequest = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])

      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        sessionInfoRequest
      })

      const decoded = decodeMessage(message)
      expect(decoded[6]).toBeDefined() // session_info_request
    })

    test('builds complete pairing message structure', () => {
      // Simulate building a complete pairing message
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const keyToAdd = buildKeyToAdd(publicKey, KEY_ROLE_OWNER, KEY_FORM_FACTOR_ANDROID_DEVICE)
      const whitelistOp = buildWhitelistOperation(keyToAdd)
      const unsignedMessage = buildUnsignedMessageWithWhitelist(whitelistOp)

      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        routingAddress: generateRoutingAddress(),
        payload: unsignedMessage,
        uuid: generateUUID()
      })

      expect(message).toBeInstanceOf(Uint8Array)
      expect(message.length).toBeGreaterThan(80) // Should be substantial
    })
  })

  describe('parseSessionInfo', () => {
    test('parses session info response', async () => {
      // Build a mock session info message
      const { concat, encodeBytes, encodeVarintField } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const publicKey = new Uint8Array(65)
      const epoch = new Uint8Array(16)

      const sessionInfo = concat(
        encodeBytes(1, publicKey),
        encodeBytes(2, epoch),
        encodeVarintField(3, 1234567890),
        encodeVarintField(4, 42)
      )

      const parsed = parseSessionInfo(sessionInfo)
      expect(parsed.publicKey.length).toBe(65)
      expect(parsed.epoch.length).toBe(16)
      expect(parsed.clockTime).toBe(1234567890)
      expect(parsed.counter).toBe(42)
    })
  })

  describe('parseRoutableMessage', () => {
    test('parses routable message response', async () => {
      const { concat, encodeBytes } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const payload = new Uint8Array([0x01, 0x02, 0x03])
      const uuid = new Uint8Array(16)

      const message = concat(
        encodeBytes(3, payload),
        encodeBytes(12, uuid)
      )

      const parsed = parseRoutableMessage(message)
      expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03])
      expect(parsed.uuid.length).toBe(16)
    })
  })
})
