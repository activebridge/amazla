import {
  DOMAIN_VEHICLE_SECURITY,
  SIGNATURE_TYPE_HMAC,
  RKE_ACTION_UNLOCK,
  RKE_ACTION_LOCK,
  RKE_ACTION_OPEN_TRUNK,
  KEY_ROLE_OWNER,
  KEY_FORM_FACTOR_ANDROID_DEVICE,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR,
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
  parseCommandStatus,
  parsePairingResponse,
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
      // RKE action is now field 2 (not field 1)
      expect(decoded[2]).toBe(RKE_ACTION_UNLOCK)
    })

    test('builds lock message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_LOCK })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBe(RKE_ACTION_LOCK)
    })

    test('builds trunk message', () => {
      const message = buildUnsignedMessage({ rkeAction: RKE_ACTION_OPEN_TRUNK })

      const decoded = decodeMessage(message)
      expect(decoded[2]).toBe(RKE_ACTION_OPEN_TRUNK)
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
    test('builds PublicKey message with raw key bytes', () => {
      const publicKey = new Uint8Array(65)
      publicKey[0] = 0x04

      const keyToAdd = buildKeyToAdd(publicKey)

      // Now buildKeyToAdd creates a proper PublicKey message with just PublicKeyRaw (field 1)
      const decoded = decodeMessage(keyToAdd)
      expect(decoded[1].length).toBe(65) // PublicKeyRaw field
      // Role and formFactor are no longer included (they belong in PermissionChange message)
      expect(decoded[2]).toBeUndefined()
      expect(decoded[6]).toBeUndefined()
    })

    test('ignores role and formFactor parameters (deprecated)', () => {
      const publicKey = new Uint8Array(65)
      // These params are now ignored - buildKeyToAdd just creates PublicKey message
      const keyToAdd = buildKeyToAdd(publicKey, 1, KEY_FORM_FACTOR_ANDROID_DEVICE)

      const decoded = decodeMessage(keyToAdd)
      expect(decoded[1].length).toBe(65)
      // Role/formFactor not included
      expect(decoded[2]).toBeUndefined()
    })
  })

  describe('buildWhitelistOperation', () => {
    test('wraps key in whitelist operation with metadata', () => {
      const keyToAdd = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])
      const operation = buildWhitelistOperation(keyToAdd)

      const decoded = decodeMessage(operation)
      expect(decoded[1]).toBeDefined() // addPublicKeyToWhitelist
      expect(decoded[16]).toBeDefined() // metadataForKey with keyFormFactor
    })

    test('includes KeyMetadata with keyFormFactor', () => {
      const keyToAdd = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])
      const operation = buildWhitelistOperation(keyToAdd, KEY_FORM_FACTOR_ANDROID_DEVICE)

      const decoded = decodeMessage(operation)
      // metadataForKey field 16 should contain KeyMetadata
      const metadata = decodeMessage(decoded[16])
      expect(metadata[1]).toBe(KEY_FORM_FACTOR_ANDROID_DEVICE) // keyFormFactor is field 1
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
      // Correct field numbers from universal_message.proto
      expect(decoded[6]).toBeDefined() // to_destination (field 6)
      expect(decoded[50]).toBeDefined() // request_uuid (field 50)
    })

    test('builds message with routing address', () => {
      const routingAddress = new Uint8Array(16).fill(0xab)

      const message = buildRoutableMessage({
        routingAddress,
        payload: new Uint8Array([0x01, 0x02])
      })

      const decoded = decodeMessage(message)
      expect(decoded[7]).toBeDefined() // from_destination (field 7)
      expect(decoded[10]).toBeDefined() // protobuf_message_as_bytes (field 10)
    })

    test('builds message with session info request', () => {
      const sessionInfoRequest = new Uint8Array([0x0a, 0x41, ...new Array(65).fill(0)])

      const message = buildRoutableMessage({
        toDomain: DOMAIN_VEHICLE_SECURITY,
        sessionInfoRequest
      })

      const decoded = decodeMessage(message)
      expect(decoded[14]).toBeDefined() // session_info_request (field 14)
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

      // Use correct field numbers: payload=10, uuid=50
      const message = concat(
        encodeBytes(10, payload),
        encodeBytes(50, uuid)
      )

      const parsed = parseRoutableMessage(message)
      expect(Array.from(parsed.payload)).toEqual([0x01, 0x02, 0x03])
      expect(parsed.uuid.length).toBe(16)
    })
  })

  describe('parseCommandStatus', () => {
    test('parses OPERATIONSTATUS_WAIT', async () => {
      const { concat, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // CommandStatus { operationStatus (field 1) = WAIT (1) }
      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)

      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_WAIT)
    })

    test('parses OPERATIONSTATUS_OK', async () => {
      const { encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_OK)
      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_OK)
    })

    test('parses OPERATIONSTATUS_ERROR with fault', async () => {
      const { concat, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // CommandStatus with error and whitelist fault
      const commandStatus = concat(
        encodeEnum(1, OPERATIONSTATUS_ERROR),
        encodeEnum(3, 5) // whitelistOperationFault
      )

      const parsed = parseCommandStatus(commandStatus)
      expect(parsed.operationStatus).toBe(OPERATIONSTATUS_ERROR)
      expect(parsed.whitelistOperationFault).toBe(5)
    })
  })

  describe('parsePairingResponse', () => {
    test('parses wait response', async () => {
      const { concat, encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      // Build FromVCSECMessage { commandStatus (field 4) = CommandStatus { operationStatus = WAIT } }
      const commandStatus = encodeEnum(1, OPERATIONSTATUS_WAIT)
      const fromVcsec = encodeBytes(4, commandStatus)

      // Build RoutableMessage { payload (field 10) = FromVCSECMessage }
      const routableMessage = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routableMessage)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('wait')
      expect(parsed.message).toBe('Tap key card on car')
    })

    test('parses ok response', async () => {
      const { encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = encodeEnum(1, OPERATIONSTATUS_OK)
      const fromVcsec = encodeBytes(4, commandStatus)
      const routableMessage = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routableMessage)
      expect(parsed.success).toBe(true)
      expect(parsed.status).toBe('ok')
      expect(parsed.message).toBe('Key added successfully')
    })

    test('parses error response', async () => {
      const { concat, encodeBytes, encodeEnum } = await import('../lib/tesla-ble/protocol/protobuf.js')

      const commandStatus = concat(
        encodeEnum(1, OPERATIONSTATUS_ERROR),
        encodeEnum(3, 10) // whitelistOperationFault
      )
      const fromVcsec = encodeBytes(4, commandStatus)
      const routableMessage = encodeBytes(10, fromVcsec)

      const parsed = parsePairingResponse(routableMessage)
      expect(parsed.success).toBe(false)
      expect(parsed.status).toBe('error')
    })

    test('handles missing payload', () => {
      const emptyMessage = new Uint8Array(0)
      const parsed = parsePairingResponse(emptyMessage)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('No payload in response')
    })
  })
})
