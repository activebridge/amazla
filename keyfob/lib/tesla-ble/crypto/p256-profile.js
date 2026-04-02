// P-256 ECDH with operation counting for profiling
import { ecdh as ecdhOriginal, bytesToBigInt, bigIntToBytes } from './p256.js'

let opCounts = {
  mul: 0,
  sqr: 0,
  add: 0,
  sub: 0,
  inv: 0
}

const ecdhWithCounting = (privBytes, pubBytes) => {
  opCounts = { mul: 0, sqr: 0, add: 0, sub: 0, inv: 0 }
  
  // We can't easily instrument without rewriting, but we can estimate:
  // - 1 ECDH = 1 scalarMul(256-bit)
  // - wNAF-4: ~256/4 = 64 precomputed doublings + ~64 mixed adds
  // - Each doubling: ~2 sqr + 5 mul
  // - Each add: ~7 mul + 2 sqr + 1 inv
  // - Final conversion: ~1 inv + 2 mul
  
  const t0 = Date.now()
  const result = ecdhOriginal(privBytes, pubBytes)
  const elapsed = Date.now() - t0
  
  // Estimate operation counts
  const doublings = 64
  const additions = 64
  
  opCounts.sqr = doublings * 2 + additions * 2 + 10
  opCounts.mul = doublings * 5 + additions * 7 + 5
  opCounts.inv = additions + 1
  
  console.log('[Profile] ECDH took:', elapsed + 'ms')
  console.log('[Profile] Estimated operations:')
  console.log('[Profile]   Multiplications:', opCounts.mul)
  console.log('[Profile]   Squarings:', opCounts.sqr)
  console.log('[Profile]   Inversions:', opCounts.inv)
  console.log('[Profile]   Avg per operation:', (elapsed / (opCounts.mul + opCounts.sqr * 0.5)).toFixed(1) + 'µs')
  
  return result
}

export { ecdhWithCounting as ecdh }
