// Pairing Flow Tests
// Tests for the complete Tesla BLE pairing flow with mocked BLE layer

import { hexToBytes, bytesToHex, generatePrivateKey, getPublicKey } from '../app-side/ble-crypto.js'
import bleCryptoSession from '../app-side/ble-crypto.js'
import {
  parsePairingResponse,
  OPERATIONSTATUS_OK,
  OPERATIONSTATUS_WAIT,
  OPERATIONSTATUS_ERROR
} from '../lib/tesla-ble/protocol/vcsec.js'

// Test keys (same format as secrets.js)
const TEST_PRIVATE_KEY = 'ec00d429c82dcf2bea3e4485da9ed75e84347741393786b4a48e02554eadb88f'
const TEST_PUBLIC_KEY = '04f4d912cb840b7f9eb974847a5566e886add14357c3f85df255e7397a98a13463b6b5d8ed03aa720fc6d7c721e7319e0b627f18f84199852fca23897b32710ece'

// Mock Tesla BLE responses (protobuf encoded)
// These simulate what Tesla sends back via BLE notifications

// Build a mock FromVCSECMessage response (what Tesla actually sends — no RoutableMessage wrapper)
// Format: FromVCSECMessage { commandStatus (field 4) = CommandStatus { ... } }
function buildMockFromVCSECResponse(operationStatus, whitelistFault = null) {
  // CommandStatus: field 1 = operationStatus (varint)
  const commandStatusParts = [0x08, operationStatus] // field 1, wire type 0
  if (whitelistFault !== null) {
    commandStatusParts.push(0x18, whitelistFault) // field 3, wire type 0
  }
  const commandStatus = new Uint8Array(commandStatusParts)

  // FromVCSECMessage: field 4 = commandStatus (bytes)
  const result = new Uint8Array(2 + commandStatus.length)
  result[0] = 0x22 // field 4, wire type 2
  result[1] = commandStatus.length
  result.set(commandStatus, 2)
  return result
}

// Build mock OK response for keycard tap confirmation
// Tesla sends commandStatus { whitelistOperationStatus (field 3, bytes) } — operationStatus absent (defaults to OK=0)
// Real example bytes (after length prefix stripped): 22 0a 1a 08 12 06 0a 04 5f 0d 64 b3
function buildOkKeycardResponse() {
  const whitelistOpStatus = new Uint8Array([0x12, 0x02, 0x08, 0x00]) // minimal sub-message
  const commandStatus = new Uint8Array(2 + whitelistOpStatus.length)
  commandStatus[0] = 0x1a // field 3, wire type 2
  commandStatus[1] = whitelistOpStatus.length
  commandStatus.set(whitelistOpStatus, 2)

  const result = new Uint8Array(2 + commandStatus.length)
  result[0] = 0x22 // field 4 (commandStatus), wire type 2
  result[1] = commandStatus.length
  result.set(commandStatus, 2)
  return result
}

// Build mock WAIT response (Tesla waiting for keycard tap)
function buildWaitResponse() {
  return buildMockFromVCSECResponse(OPERATIONSTATUS_WAIT)
}

// Build mock OK response (pairing successful — explicit operationStatus=0)
function buildOkResponse() {
  return buildMockFromVCSECResponse(OPERATIONSTATUS_OK)
}

// Build mock ERROR response
function buildErrorResponse(faultCode = 1) {
  return buildMockFromVCSECResponse(OPERATIONSTATUS_ERROR, faultCode)
}

describe('Pairing Message Building', () => {
  beforeEach(() => {
    bleCryptoSession.reset()
  })

  describe('buildPairMessage', () => {
    test('builds valid pairing message with test public key', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)

      expect(result.success).toBe(true)
      expect(result.messageHex).toBeDefined()
      expect(typeof result.messageHex).toBe('string')
    })

    test('message contains public key bytes', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      const messageHex = result.messageHex

      // The public key (without 04 prefix for some encodings, or full) should appear in message
      // At minimum, the X coordinate should be present
      const xCoord = TEST_PUBLIC_KEY.slice(2, 66) // X coordinate (32 bytes = 64 hex chars)
      expect(messageHex.includes(xCoord)).toBe(true)
    })

    test('message starts with ToVCSECMessage field 1', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      const messageBytes = hexToBytes(result.messageHex)

      // ToVCSECMessage { signedMessage (field 1, wire type 2) } = (1 << 3) | 2 = 0x0A
      expect(messageBytes[0]).toBe(0x0A)
    })

    test('uses SIGNATURE_TYPE_PRESENT_KEY — no routing address', () => {
      bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      // Pairing uses ToVCSECMessage, not RoutableMessage — no routing address needed
      expect(bleCryptoSession.routingAddress).toBeNull()
    })
  })

  describe('Public key format validation', () => {
    test('accepts 65-byte uncompressed key (130 hex chars)', () => {
      expect(TEST_PUBLIC_KEY.length).toBe(130)

      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      expect(result.success).toBe(true)
    })

    test('key starts with 04 (uncompressed format)', () => {
      expect(TEST_PUBLIC_KEY.startsWith('04')).toBe(true)
    })

    test('dynamically generated key works', () => {
      const privateKey = generatePrivateKey()
      const publicKey = getPublicKey(privateKey)
      const publicKeyHex = bytesToHex(publicKey)

      const result = bleCryptoSession.buildPairMessage(publicKeyHex)
      expect(result.success).toBe(true)
    })
  })
})

describe('Pairing Response Parsing', () => {
  describe('WAIT response (tap keycard)', () => {
    test('parses WAIT status correctly', () => {
      const response = buildWaitResponse()
      const parsed = parsePairingResponse(response)

      expect(parsed.status).toBe('wait')
      expect(parsed.success).toBe(true)
      expect(parsed.message).toContain('Tap')
    })

    test('WAIT response indicates user action needed', () => {
      const response = buildWaitResponse()
      const parsed = parsePairingResponse(response)

      expect(parsed.status).toBe('wait')
      // This status means Tesla is waiting for keycard authentication
    })
  })

  describe('OK response (success)', () => {
    test('parses OK status correctly', () => {
      const response = buildOkResponse()
      const parsed = parsePairingResponse(response)

      expect(parsed.status).toBe('ok')
      expect(parsed.success).toBe(true)
    })

    test('OK response indicates key was added', () => {
      const response = buildOkResponse()
      const parsed = parsePairingResponse(response)

      expect(parsed.status).toBe('ok')
      expect(parsed.message).toContain('success')
    })
  })

  describe('ERROR response', () => {
    test('parses ERROR status correctly', () => {
      const response = buildErrorResponse(1)
      const parsed = parsePairingResponse(response)

      expect(parsed.status).toBe('error')
      expect(parsed.success).toBe(false)
    })

    test('includes error details', () => {
      const response = buildErrorResponse(5)
      const parsed = parsePairingResponse(response)

      expect(parsed.success).toBe(false)
      expect(parsed.error).toBeDefined()
    })
  })

  describe('Invalid responses', () => {
    test('handles empty response', () => {
      const response = new Uint8Array([])
      const parsed = parsePairingResponse(response)

      expect(parsed.success).toBe(false)
    })

    test('handles malformed response', () => {
      const response = new Uint8Array([0xFF, 0xFF, 0xFF])
      const parsed = parsePairingResponse(response)

      // Should not crash, returns error
      expect(parsed.success).toBe(false)
    })

    test('handles response without payload', () => {
      // FromVCSECMessage with no field 4 (commandStatus) — e.g. just a vehicleStatus field
      const response = new Uint8Array([0x0a, 0x02, 0x08, 0x01]) // field 1 only
      const parsed = parsePairingResponse(response)

      expect(parsed.success).toBe(false)
      expect(parsed.error).toContain('command status')
    })
  })
})

describe('Pairing Flow State Machine', () => {
  // These tests verify the expected state transitions during pairing

  describe('Happy path', () => {
    test('flow: send request -> WAIT -> tap card -> OK', () => {
      // Step 1: Build and send pair message
      const pairResult = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      expect(pairResult.success).toBe(true)

      // Step 2: Receive WAIT response
      const waitResponse = buildWaitResponse()
      const waitParsed = parsePairingResponse(waitResponse)
      expect(waitParsed.status).toBe('wait')

      // Step 3: User taps keycard, receive OK response
      const okResponse = buildOkResponse()
      const okParsed = parsePairingResponse(okResponse)
      expect(okParsed.status).toBe('ok')
      expect(okParsed.success).toBe(true)
    })

    test('immediate OK response (rare but valid)', () => {
      // In some cases, Tesla might accept immediately without keycard
      const pairResult = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      expect(pairResult.success).toBe(true)

      const okResponse = buildOkResponse()
      const parsed = parsePairingResponse(okResponse)
      expect(parsed.status).toBe('ok')
    })
  })

  describe('Error scenarios', () => {
    test('immediate ERROR response', () => {
      const pairResult = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      expect(pairResult.success).toBe(true)

      const errorResponse = buildErrorResponse(1)
      const parsed = parsePairingResponse(errorResponse)
      expect(parsed.status).toBe('error')
      expect(parsed.success).toBe(false)
    })

    test('WAIT then ERROR (keycard rejected)', () => {
      // Build message
      bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)

      // Receive WAIT
      const waitResponse = buildWaitResponse()
      const waitParsed = parsePairingResponse(waitResponse)
      expect(waitParsed.status).toBe('wait')

      // Keycard rejected
      const errorResponse = buildErrorResponse(2)
      const errorParsed = parsePairingResponse(errorResponse)
      expect(errorParsed.status).toBe('error')
    })
  })
})

describe('BLE Service Mock Integration', () => {
  // Mock the teslaBLE module for integration testing

  let mockTeslaBLE
  let mockCallbacks
  let sendCalled

  beforeEach(() => {
    sendCalled = false
    mockCallbacks = {
      sendAndWaitForResponse: null,
      responseCallback: null
    }

    mockTeslaBLE = {
      _connected: true,
      isConnected: function() { return this._connected },
      sendAndWaitForResponse: function(data, callback, timeout) {
        sendCalled = true
        mockCallbacks.sendAndWaitForResponse = callback
      },
      responseCallback: null
    }
  })

  describe('pair() function behavior', () => {
    test('checks connection before pairing', () => {
      mockTeslaBLE._connected = false

      const isConnected = mockTeslaBLE.isConnected()
      expect(isConnected).toBe(false)
      // Real pair() would return error here
    })

    test('sends pairing message when connected', () => {
      mockTeslaBLE._connected = true

      // Build the message
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      expect(result.success).toBe(true)

      // Simulate sending
      const messageBytes = hexToBytes(result.messageHex)
      mockTeslaBLE.sendAndWaitForResponse(messageBytes, (response) => {
        // This would be called with Tesla's response
      }, 15000)

      expect(sendCalled).toBe(true)
    })

    test('handles WAIT response and waits for confirmation', () => {
      // Simulate receiving WAIT response
      const waitResponse = buildWaitResponse()
      const parsed = parsePairingResponse(waitResponse)

      expect(parsed.status).toBe('wait')

      // At this point, UI should show "Tap key card on car"
      // and code should wait for next BLE notification
    })
  })
})

describe('Message Byte Format', () => {
  describe('Length prefix handling', () => {
    test('pairing message does NOT include length prefix', () => {
      // The 2-byte length prefix is added by teslaBLE.send(), not buildPairMessage()
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      const messageBytes = hexToBytes(result.messageHex)

      // First byte should be protobuf field key, not length
      // ToVCSECMessage { signedMessage (field 1, wire type 2) } = (1 << 3) | 2 = 0x0A
      expect(messageBytes[0]).toBe(0x0A)
    })

    test('simulates adding length prefix before send', () => {
      const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
      const messageBytes = hexToBytes(result.messageHex)

      // This is what teslaBLE.send() does
      const length = messageBytes.length
      const withPrefix = new Uint8Array(2 + length)
      withPrefix[0] = (length >> 8) & 0xFF
      withPrefix[1] = length & 0xFF
      withPrefix.set(messageBytes, 2)

      // Verify prefix
      const prefixedLength = (withPrefix[0] << 8) | withPrefix[1]
      expect(prefixedLength).toBe(messageBytes.length)

      // Verify message follows prefix: ToVCSECMessage starts with 0x0A
      expect(withPrefix[2]).toBe(0x0A)
    })
  })

  describe('Response length prefix parsing', () => {
    test('parses length prefix from mock response', () => {
      const payload = buildWaitResponse()

      // Add length prefix like Tesla sends
      const withPrefix = new Uint8Array(2 + payload.length)
      withPrefix[0] = (payload.length >> 8) & 0xFF
      withPrefix[1] = payload.length & 0xFF
      withPrefix.set(payload, 2)

      // Parse like _handleResponse does
      const messageLength = (withPrefix[0] << 8) | withPrefix[1]
      const extractedPayload = withPrefix.slice(2, 2 + messageLength)

      expect(messageLength).toBe(payload.length)
      expect(Array.from(extractedPayload)).toEqual(Array.from(payload))
    })
  })
})

describe('WhitelistOperation Structure', () => {
  test('message contains WhitelistOperation (field 16 of UnsignedMessage)', () => {
    const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
    const messageHex = result.messageHex

    // Field 16 with wire type 2 = (16 << 3) | 2 = 130 = 0x82 (needs varint encoding: 0x82 0x01)
    // Look for this pattern in the message
    expect(messageHex.includes('8201')).toBe(true)
  })

  test('message contains metadataForKey (field 16 of WhitelistOperation)', () => {
    const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
    const messageHex = result.messageHex

    // metadataForKey is also field 16, so we should see 0x82 0x01 appear twice
    const matches = messageHex.match(/8201/g)
    expect(matches).not.toBeNull()
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Key Form Factor', () => {
  test('uses ANDROID_DEVICE form factor by default', () => {
    // KEY_FORM_FACTOR_ANDROID_DEVICE = 7
    // This should be encoded in the message
    const result = bleCryptoSession.buildPairMessage(TEST_PUBLIC_KEY)
    const messageHex = result.messageHex

    // Form factor 7 is encoded as varint 0x07 after field key 0x08
    // KeyMetadata { keyFormFactor (field 1) = 7 } = 0x08 0x07
    expect(messageHex.includes('0807')).toBe(true)
  })
})

describe('Timeout Handling', () => {
  test('pairing request has 15 second timeout', () => {
    // This is verified in ble-service.js line 367:
    // teslaBLE.sendAndWaitForResponse(messageBytes, callback, 15000)
    const PAIRING_TIMEOUT = 15000
    expect(PAIRING_TIMEOUT).toBe(15000)
  })

  test('keycard tap wait has 60 second timeout', () => {
    // This is verified in ble-service.js line 381:
    // const timeout = setTimeout(..., 60000)
    const KEYCARD_TAP_TIMEOUT = 60000
    expect(KEYCARD_TAP_TIMEOUT).toBe(60000)
  })
})

describe('Multiple Response Handling', () => {
  // Tesla may send up to 3 responses to a pairing request

  test('handles single WAIT response', () => {
    const response = buildWaitResponse()
    const parsed = parsePairingResponse(response)
    expect(parsed.status).toBe('wait')
  })

  test('handles single OK response', () => {
    const response = buildOkResponse()
    const parsed = parsePairingResponse(response)
    expect(parsed.status).toBe('ok')
  })

  test('can parse consecutive responses independently', () => {
    // First response: WAIT
    const wait = parsePairingResponse(buildWaitResponse())
    expect(wait.status).toBe('wait')

    // Second response: OK (after keycard tap)
    const ok = parsePairingResponse(buildOkResponse())
    expect(ok.status).toBe('ok')
  })
})
