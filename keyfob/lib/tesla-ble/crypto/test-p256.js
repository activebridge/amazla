// Test P-256 implementation correctness and performance
import * as p256 from './p256.js'

// Known test vectors for P-256
const testVectors = [
  {
    // Test vector 1: NIST ECDH test
    privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
    expectedPubX: '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
    expectedPubY: '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'
  },
  {
    // Test vector 2
    privateKey: '0000000000000000000000000000000000000000000000000000000000000002',
    expectedPubX: '7cf27b188d034f7e8a52380304b51ac3c08969e277f21b35a60b48fc47669978',
    expectedPubY: '07775510db8ed040293d9ac69f7430dbba7dade63ce982299e04b79d227873d1'
  },
  {
    // Test vector 3: larger scalar
    privateKey: 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721',
    expectedPubX: '60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6',
    expectedPubY: '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299'
  }
]

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

console.log('=== P-256 Correctness Tests ===\n')

let allPassed = true

// Test getPublicKey
for (let i = 0; i < testVectors.length; i++) {
  const tv = testVectors[i]
  const privKey = hexToBytes(tv.privateKey)
  const pubKey = p256.getPublicKey(privKey)

  const gotX = bytesToHex(pubKey.slice(1, 33))
  const gotY = bytesToHex(pubKey.slice(33, 65))

  const xMatch = gotX === tv.expectedPubX
  const yMatch = gotY === tv.expectedPubY

  if (xMatch && yMatch) {
    console.log(`Test ${i + 1}: PASS`)
  } else {
    console.log(`Test ${i + 1}: FAIL`)
    console.log(`  Expected X: ${tv.expectedPubX}`)
    console.log(`  Got X:      ${gotX}`)
    console.log(`  Expected Y: ${tv.expectedPubY}`)
    console.log(`  Got Y:      ${gotY}`)
    allPassed = false
  }
}

// Test ECDH
console.log('\n=== ECDH Test ===')
const alicePriv = hexToBytes('c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721')
const bobPriv = hexToBytes('0000000000000000000000000000000000000000000000000000000000000002')

const alicePub = p256.getPublicKey(alicePriv)
const bobPub = p256.getPublicKey(bobPriv)

const aliceShared = p256.ecdh(alicePriv, bobPub)
const bobShared = p256.ecdh(bobPriv, alicePub)

const aliceSharedHex = bytesToHex(aliceShared)
const bobSharedHex = bytesToHex(bobShared)

if (aliceSharedHex === bobSharedHex) {
  console.log('ECDH: PASS (shared secrets match)')
  console.log(`  Shared: ${aliceSharedHex}`)
} else {
  console.log('ECDH: FAIL')
  console.log(`  Alice: ${aliceSharedHex}`)
  console.log(`  Bob:   ${bobSharedHex}`)
  allPassed = false
}

console.log('\n=== Performance Benchmark ===')

// Warm up
for (let i = 0; i < 3; i++) {
  p256.getPublicKey(alicePriv)
  p256.ecdh(alicePriv, bobPub)
}

// Benchmark getPublicKey
const pubIterations = 10
let pubStart = performance.now()
for (let i = 0; i < pubIterations; i++) {
  p256.getPublicKey(alicePriv)
}
let pubEnd = performance.now()
const pubAvg = (pubEnd - pubStart) / pubIterations

// Benchmark ECDH
const ecdhIterations = 10
let ecdhStart = performance.now()
for (let i = 0; i < ecdhIterations; i++) {
  p256.ecdh(alicePriv, bobPub)
}
let ecdhEnd = performance.now()
const ecdhAvg = (ecdhEnd - ecdhStart) / ecdhIterations

console.log(`getPublicKey: ${pubAvg.toFixed(2)}ms average (${pubIterations} iterations)`)
console.log(`ECDH:         ${ecdhAvg.toFixed(2)}ms average (${ecdhIterations} iterations)`)
console.log(`Total:        ${(pubAvg + ecdhAvg).toFixed(2)}ms`)

console.log('\n=== Summary ===')
console.log(allPassed ? 'All tests PASSED' : 'Some tests FAILED')
