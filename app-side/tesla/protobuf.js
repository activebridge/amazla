// Tesla Protobuf Encoder/Decoder - Pure ES6 JavaScript
// Implements protobuf encoding for Tesla vehicle commands

class TeslaProtobuf {
  constructor() {
    // Wire types for protobuf
    this.WIRE_TYPE_VARINT = 0
    this.WIRE_TYPE_64BIT = 1
    this.WIRE_TYPE_LENGTH_DELIMITED = 2
    this.WIRE_TYPE_START_GROUP = 3
    this.WIRE_TYPE_END_GROUP = 4
    this.WIRE_TYPE_32BIT = 5
  }

  // Encode varint (variable-length integer)
  encodeVarint(value) {
    const result = []
    let num = BigInt(value)
    
    while (num >= 0x80n) {
      result.push(Number((num & 0x7fn) | 0x80n))
      num >>= 7n
    }
    result.push(Number(num & 0x7fn))
    
    return new Uint8Array(result)
  }

  // Decode varint
  decodeVarint(bytes, offset = 0) {
    let result = 0n
    let shift = 0n
    let pos = offset
    
    while (pos < bytes.length) {
      const byte = bytes[pos++]
      result |= BigInt(byte & 0x7f) << shift
      
      if ((byte & 0x80) === 0) {
        return { value: Number(result), nextPos: pos }
      }
      shift += 7n
    }
    
    throw new Error('Invalid varint')
  }

  // Encode field key (field number + wire type)
  encodeKey(fieldNumber, wireType) {
    return this.encodeVarint((fieldNumber << 3) | wireType)
  }

  // Encode string field
  encodeString(fieldNumber, value) {
    const stringBytes = new TextEncoder().encode(value)
    const key = this.encodeKey(fieldNumber, this.WIRE_TYPE_LENGTH_DELIMITED)
    const length = this.encodeVarint(stringBytes.length)
    
    const result = new Uint8Array(key.length + length.length + stringBytes.length)
    result.set(key, 0)
    result.set(length, key.length)
    result.set(stringBytes, key.length + length.length)
    
    return result
  }

  // Encode bytes field
  encodeBytes(fieldNumber, value) {
    const key = this.encodeKey(fieldNumber, this.WIRE_TYPE_LENGTH_DELIMITED)
    const length = this.encodeVarint(value.length)
    
    const result = new Uint8Array(key.length + length.length + value.length)
    result.set(key, 0)
    result.set(length, key.length)
    result.set(value, key.length + length.length)
    
    return result
  }

  // Encode uint32 field
  encodeUint32(fieldNumber, value) {
    const key = this.encodeKey(fieldNumber, this.WIRE_TYPE_VARINT)
    const valueBytes = this.encodeVarint(value)
    
    const result = new Uint8Array(key.length + valueBytes.length)
    result.set(key, 0)
    result.set(valueBytes, key.length)
    
    return result
  }

  // Encode enum field (same as uint32)
  encodeEnum(fieldNumber, value) {
    return this.encodeUint32(fieldNumber, value)
  }

  // Encode message field
  encodeMessage(fieldNumber, messageBytes) {
    const key = this.encodeKey(fieldNumber, this.WIRE_TYPE_LENGTH_DELIMITED)
    const length = this.encodeVarint(messageBytes.length)
    
    const result = new Uint8Array(key.length + length.length + messageBytes.length)
    result.set(key, 0)
    result.set(length, key.length)
    result.set(messageBytes, key.length + length.length)
    
    return result
  }

  // Combine multiple field encodings
  combineFields(...fields) {
    const totalLength = fields.reduce((sum, field) => sum + field.length, 0)
    const result = new Uint8Array(totalLength)
    
    let offset = 0
    for (const field of fields) {
      result.set(field, offset)
      offset += field.length
    }
    
    return result
  }

  // Tesla-specific message builders
  
  // Build CarServer.Action message
  buildAction(vehicleAction) {
    // action_msg = 1, vehicleAction = 2
    const actionMsg = this.encodeMessage(1, vehicleAction)
    return this.combineFields(actionMsg)
  }

  // Build VehicleAction message for door lock/unlock
  buildVehicleAction(command) {
    // Field numbers for VehicleAction
    // closures_action = 3
    const closuresAction = this.buildClosuresAction(command)
    const closuresField = this.encodeMessage(3, closuresAction)
    
    return this.combineFields(closuresField)
  }

  // Build ClosuresAction message
  buildClosuresAction(command) {
    // Field numbers for ClosuresAction
    // action = 1 (CLOSURES_LOCK = 1, CLOSURES_UNLOCK = 2)
    const actionValue = command === 'LOCK' ? 1 : 2
    const actionField = this.encodeEnum(1, actionValue)
    
    return this.combineFields(actionField)
  }

  // Build complete Tesla command message
  buildTeslaCommand(command, sessionInfo = null) {
    // Build the vehicle action
    const vehicleAction = this.buildVehicleAction(command)
    
    // Build the main action
    const action = this.buildAction(vehicleAction)
    
    // If we have session info, we would wrap this in a Session message
    // For now, return the action directly
    return action
  }

  // Build Session message (simplified)
  buildSessionMessage(sessionId, counter, action, hmac) {
    const fields = []
    
    // session_id = 1
    if (sessionId) {
      fields.push(this.encodeBytes(1, sessionId))
    }
    
    // counter = 2
    if (counter !== undefined) {
      fields.push(this.encodeUint32(2, counter))
    }
    
    // action = 3
    if (action) {
      fields.push(this.encodeMessage(3, action))
    }
    
    // hmac = 4
    if (hmac) {
      fields.push(this.encodeBytes(4, hmac))
    }
    
    return this.combineFields(...fields)
  }

  // Build complete authenticated message
  buildAuthenticatedMessage(command, sessionId, counter, hmacKey) {
    // Build the action
    const action = this.buildTeslaCommand(command)
    
    // Build session without HMAC first
    const sessionWithoutHmac = this.buildSessionMessage(sessionId, counter, action, null)
    
    // Calculate HMAC if key provided
    let hmac = null
    if (hmacKey) {
      // In a real implementation, you'd calculate HMAC over the session message
      // For now, create a placeholder
      hmac = new Uint8Array(32) // 32-byte HMAC-SHA256
    }
    
    // Build final session with HMAC
    return this.buildSessionMessage(sessionId, counter, action, hmac)
  }

  // Decode protobuf message (basic implementation)
  decodeMessage(bytes) {
    const fields = {}
    let pos = 0
    
    while (pos < bytes.length) {
      const keyResult = this.decodeVarint(bytes, pos)
      const key = keyResult.value
      pos = keyResult.nextPos
      
      const fieldNumber = key >> 3
      const wireType = key & 0x7
      
      switch (wireType) {
        case this.WIRE_TYPE_VARINT:
          const varintResult = this.decodeVarint(bytes, pos)
          fields[fieldNumber] = varintResult.value
          pos = varintResult.nextPos
          break
          
        case this.WIRE_TYPE_LENGTH_DELIMITED:
          const lengthResult = this.decodeVarint(bytes, pos)
          const length = lengthResult.value
          pos = lengthResult.nextPos
          
          const data = bytes.slice(pos, pos + length)
          fields[fieldNumber] = data
          pos += length
          break
          
        default:
          throw new Error(`Unsupported wire type: ${wireType}`)
      }
    }
    
    return fields
  }

  // Helper to convert hex string to bytes
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
  }

  // Helper to convert bytes to hex string
  bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }
}

// Tesla command constants
export const TeslaCommands = {
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  TRUNK: 'TRUNK',
  FRUNK: 'FRUNK',
  CLIMATE_ON: 'CLIMATE_ON',
  CLIMATE_OFF: 'CLIMATE_OFF'
}

export default TeslaProtobuf