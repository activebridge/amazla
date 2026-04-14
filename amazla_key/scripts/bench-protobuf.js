(async function(){
  const mod = await import('../lib/tesla-ble/protocol/protobuf.js')
  const { encodeVarint: newEncodeVarint, decodeVarint: newDecodeVarint } = mod

  // Old implementations (pre-refactor) for comparison
  const oldEncodeVarint = (value) => {
    const bytes = []
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80)
      value >>>= 7
    }
    bytes.push(value & 0x7f)
    return new Uint8Array(bytes)
  }
  const oldDecodeVarint = (buffer, offset) => {
    let value = 0
    let shift = 0
    let pos = offset
    while (pos < buffer.length) {
      const byte = buffer[pos++]
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return { value, bytesRead: pos - offset }
      shift += 7
      if (shift > 35) throw new Error('Varint too long')
    }
    throw new Error('Unexpected end of buffer')
  }

  function bench(name, fn, iterations) {
    const start = Date.now()
    for (let i = 0; i < iterations; i++) fn()
    const ms = Date.now() - start
    console.log(`${name}: ${ms}ms (${iterations} it)`) 
    return ms
  }

  const values = [0,1,127,128,300,16383,16384,65535,1000000]
  console.log('Bench encodeVarint:')
  for (const v of values) {
    bench(`old.encodeVarint ${v}`, () => { oldEncodeVarint(v) }, 20000)
    bench(`new.encodeVarint ${v}`, () => { newEncodeVarint(v) }, 20000)
    console.log('---')
  }

  console.log('\nBench decodeVarint:')
  const bufSamples = values.map(v => ({ v, buf: new Uint8Array(oldEncodeVarint(v)) }))
  for (const s of bufSamples) {
    bench(`old.decodeVarint ${s.v}`, () => { oldDecodeVarint(s.buf, 0) }, 20000)
    bench(`new.decodeVarint ${s.v}`, () => { newDecodeVarint(s.buf, 0) }, 20000)
    console.log('---')
  }

  // Decode message benchmark
  const { encodeVarintField, encodeBytes, concat, decodeMessage } = mod
  const encoded = concat(
    encodeVarintField(1, 100),
    encodeBytes(2, new Uint8Array([0xab,0xcd])),
    encodeVarintField(3, 200)
  )
  console.log('\nBench decodeMessage (complex message)')
  bench('decodeMessage', () => { decodeMessage(encoded) }, 20000)

  console.log('\nDone')
})()
