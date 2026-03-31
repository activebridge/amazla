// P-256 with wNAF-9 for getPublicKey using precomputed table
// 128 odd multiples of G: 1G, 3G, 5G, ..., 255G (~42KB)
// getPublicKey: ~28 additions + 256 doublings

import { G_WNAF8_X, G_WNAF8_Y, G_WNAF8_NY } from './tables/g-wnaf8.js'

const P = new Uint32Array([0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0, 0, 0, 1, 0xFFFFFFFF])
const N = new Uint32Array([0xFC632551, 0xF3B9CAC2, 0xA7179E84, 0xBCE6FAAD, 0xFFFFFFFF, 0xFFFFFFFF, 0, 0xFFFFFFFF])

// Basic 256-bit operations (unrolled)
const cmp = (a, b) => {
  if (a[7] < b[7]) return -1; if (a[7] > b[7]) return 1
  if (a[6] < b[6]) return -1; if (a[6] > b[6]) return 1
  if (a[5] < b[5]) return -1; if (a[5] > b[5]) return 1
  if (a[4] < b[4]) return -1; if (a[4] > b[4]) return 1
  if (a[3] < b[3]) return -1; if (a[3] > b[3]) return 1
  if (a[2] < b[2]) return -1; if (a[2] > b[2]) return 1
  if (a[1] < b[1]) return -1; if (a[1] > b[1]) return 1
  if (a[0] < b[0]) return -1; if (a[0] > b[0]) return 1
  return 0
}
const isZero = (a) => !(a[0]|a[1]|a[2]|a[3]|a[4]|a[5]|a[6]|a[7])
const copy = (d, s) => { d[0]=s[0];d[1]=s[1];d[2]=s[2];d[3]=s[3];d[4]=s[4];d[5]=s[5];d[6]=s[6];d[7]=s[7] }
const add = (r, a, b) => {
  let c, s
  s=a[0]+b[0];r[0]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[1]+b[1]+c;r[1]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[2]+b[2]+c;r[2]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[3]+b[3]+c;r[3]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[4]+b[4]+c;r[4]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[5]+b[5]+c;r[5]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[6]+b[6]+c;r[6]=s>>>0;c=s>0xFFFFFFFF?1:0
  s=a[7]+b[7]+c;r[7]=s>>>0;c=s>0xFFFFFFFF?1:0
  return c
}
const sub = (r, a, b) => {
  let c, d
  d=a[0]-b[0];r[0]=d>>>0;c=d<0?1:0
  d=a[1]-b[1]-c;r[1]=d>>>0;c=d<0?1:0
  d=a[2]-b[2]-c;r[2]=d>>>0;c=d<0?1:0
  d=a[3]-b[3]-c;r[3]=d>>>0;c=d<0?1:0
  d=a[4]-b[4]-c;r[4]=d>>>0;c=d<0?1:0
  d=a[5]-b[5]-c;r[5]=d>>>0;c=d<0?1:0
  d=a[6]-b[6]-c;r[6]=d>>>0;c=d<0?1:0
  d=a[7]-b[7]-c;r[7]=d>>>0;c=d<0?1:0
  return c
}
const modAdd = (r, a, b) => { if (add(r, a, b) || cmp(r, P) >= 0) sub(r, r, P) }
const modSub = (r, a, b) => { if (sub(r, a, b)) add(r, r, P) }

// 256x256 -> 512 bit multiplication - no Math.floor/modulo in hot path
const _m = new Uint32Array(16)
const _t = new Float64Array(17)
const M32 = 2.3283064365386963e-10  // 1/2^32
const mul256 = (r, a, b) => {
  _t.fill(0)
  for (let i = 0; i < 8; i++) {
    const ai = a[i], al = ai & 0xFFFF, ah = ai >>> 16
    for (let j = 0; j < 8; j++) {
      const bj = b[j], bl = bj & 0xFFFF, bh = bj >>> 16
      const ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh
      // Split mid = lh + hl using bitwise ops (each < 2^32)
      const lhL = lh & 0xFFFF, lhH = lh >>> 16
      const hlL = hl & 0xFFFF, hlH = hl >>> 16
      let mL = lhL + hlL
      const mH = lhH + hlH + (mL >>> 16)
      mL &= 0xFFFF
      _t[i + j] += ll + mL * 65536
      _t[i + j + 1] += hh + mH
    }
  }
  // Carry propagation (unrolled)
  let c = 0, v
  v = _t[0]; r[0] = v >>> 0; c = (v * M32) | 0
  v = _t[1] + c; r[1] = v >>> 0; c = (v * M32) | 0
  v = _t[2] + c; r[2] = v >>> 0; c = (v * M32) | 0
  v = _t[3] + c; r[3] = v >>> 0; c = (v * M32) | 0
  v = _t[4] + c; r[4] = v >>> 0; c = (v * M32) | 0
  v = _t[5] + c; r[5] = v >>> 0; c = (v * M32) | 0
  v = _t[6] + c; r[6] = v >>> 0; c = (v * M32) | 0
  v = _t[7] + c; r[7] = v >>> 0; c = (v * M32) | 0
  v = _t[8] + c; r[8] = v >>> 0; c = (v * M32) | 0
  v = _t[9] + c; r[9] = v >>> 0; c = (v * M32) | 0
  v = _t[10] + c; r[10] = v >>> 0; c = (v * M32) | 0
  v = _t[11] + c; r[11] = v >>> 0; c = (v * M32) | 0
  v = _t[12] + c; r[12] = v >>> 0; c = (v * M32) | 0
  v = _t[13] + c; r[13] = v >>> 0; c = (v * M32) | 0
  v = _t[14] + c; r[14] = v >>> 0; c = (v * M32) | 0
  v = _t[15] + c; r[15] = v >>> 0
}

// Specialized squaring - exploits symmetry for ~1.5x speedup
const sqr256 = (r, a) => {
  _t.fill(0)
  for (let i = 0; i < 8; i++) {
    const ai = a[i], al = ai & 0xFFFF, ah = ai >>> 16
    // Diagonal: a[i] * a[i]
    const ll = al * al, lh = al * ah, hh = ah * ah
    const mL = (lh & 0xFFFF) * 2, mH = (lh >>> 16) * 2 + (mL >>> 16)
    _t[i * 2] += ll + (mL & 0xFFFF) * 65536
    _t[i * 2 + 1] += hh + mH
    // Off-diagonal: 2 * a[i] * a[j] for j > i
    for (let j = i + 1; j < 8; j++) {
      const bj = a[j], bl = bj & 0xFFFF, bh = bj >>> 16
      const ll2 = al * bl, lh2 = al * bh, hl2 = ah * bl, hh2 = ah * bh
      const lhL = lh2 & 0xFFFF, lhH = lh2 >>> 16
      const hlL = hl2 & 0xFFFF, hlH = hl2 >>> 16
      let mL2 = lhL + hlL
      const mH2 = lhH + hlH + (mL2 >>> 16)
      mL2 &= 0xFFFF
      // Multiply by 2 for symmetry
      _t[i + j] += (ll2 + mL2 * 65536) * 2
      _t[i + j + 1] += (hh2 + mH2) * 2
    }
  }
  // Carry propagation (unrolled)
  let c = 0, v
  v = _t[0]; r[0] = v >>> 0; c = (v * M32) | 0
  v = _t[1] + c; r[1] = v >>> 0; c = (v * M32) | 0
  v = _t[2] + c; r[2] = v >>> 0; c = (v * M32) | 0
  v = _t[3] + c; r[3] = v >>> 0; c = (v * M32) | 0
  v = _t[4] + c; r[4] = v >>> 0; c = (v * M32) | 0
  v = _t[5] + c; r[5] = v >>> 0; c = (v * M32) | 0
  v = _t[6] + c; r[6] = v >>> 0; c = (v * M32) | 0
  v = _t[7] + c; r[7] = v >>> 0; c = (v * M32) | 0
  v = _t[8] + c; r[8] = v >>> 0; c = (v * M32) | 0
  v = _t[9] + c; r[9] = v >>> 0; c = (v * M32) | 0
  v = _t[10] + c; r[10] = v >>> 0; c = (v * M32) | 0
  v = _t[11] + c; r[11] = v >>> 0; c = (v * M32) | 0
  v = _t[12] + c; r[12] = v >>> 0; c = (v * M32) | 0
  v = _t[13] + c; r[13] = v >>> 0; c = (v * M32) | 0
  v = _t[14] + c; r[14] = v >>> 0; c = (v * M32) | 0
  v = _t[15] + c; r[15] = v >>> 0
}

const reduce = (r, t) => {
  const c8=t[8], c9=t[9], c10=t[10], c11=t[11], c12=t[12], c13=t[13], c14=t[14], c15=t[15]

  // Combined NIST terms
  const a0 = t[0] + c8 + c9 - c11 - c12 - c13 - c14
  const a1 = t[1] + c9 + c10 - c12 - c13 - c14 - c15
  const a2 = t[2] + c10 + c11 - c13 - c14 - c15
  const a3 = t[3] + 2*(c11 + c12) + c13 - c8 - c9 - c15
  const a4 = t[4] + 2*(c12 + c13) + c14 - c9 - c10
  const a5 = t[5] + 2*(c13 + c14) + c15 - c10 - c11
  const a6 = t[6] + 3*c14 + 2*c15 + c13 - c8 - c9
  const a7 = t[7] + 3*c15 + c8 - c10 - c11 - c12 - c13

  // Carry propagation using reciprocal
  const M = 2.3283064365386963e-10
  let c, v
  v = a0; c = (v * M) | 0; if (v < 0) c--; r[0] = (v - c * 0x100000000) >>> 0
  v = a1 + c; c = (v * M) | 0; if (v < 0) c--; r[1] = (v - c * 0x100000000) >>> 0
  v = a2 + c; c = (v * M) | 0; if (v < 0) c--; r[2] = (v - c * 0x100000000) >>> 0
  v = a3 + c; c = (v * M) | 0; if (v < 0) c--; r[3] = (v - c * 0x100000000) >>> 0
  v = a4 + c; c = (v * M) | 0; if (v < 0) c--; r[4] = (v - c * 0x100000000) >>> 0
  v = a5 + c; c = (v * M) | 0; if (v < 0) c--; r[5] = (v - c * 0x100000000) >>> 0
  v = a6 + c; c = (v * M) | 0; if (v < 0) c--; r[6] = (v - c * 0x100000000) >>> 0
  v = a7 + c; c = (v * M) | 0; if (v < 0) c--; r[7] = (v - c * 0x100000000) >>> 0

  // Final adjustment
  while (c > 0) { c -= sub(r, r, P) }
  while (c < 0) { c += add(r, r, P) }
  if (cmp(r, P) >= 0) sub(r, r, P)
}

const modMul = (r, a, b) => { mul256(_m, a, b); reduce(r, _m) }
const modSqr = (r, a) => { sqr256(_m, a); reduce(r, _m) }

// Right shift by 1 (unrolled)
const shr1 = (a) => {
  a[0]=(a[0]>>>1)|((a[1]&1)<<31);a[1]=(a[1]>>>1)|((a[2]&1)<<31)
  a[2]=(a[2]>>>1)|((a[3]&1)<<31);a[3]=(a[3]>>>1)|((a[4]&1)<<31)
  a[4]=(a[4]>>>1)|((a[5]&1)<<31);a[5]=(a[5]>>>1)|((a[6]&1)<<31)
  a[6]=(a[6]>>>1)|((a[7]&1)<<31);a[7]>>>=1
}

// ModInv using binary extended GCD
const _inv_u = new Uint32Array(8), _inv_v = new Uint32Array(8)
const _inv_x1 = new Uint32Array(8), _inv_x2 = new Uint32Array(8)

const modInv = (r, a) => {
  copy(_inv_u, a); copy(_inv_v, P)
  _inv_x1[0]=1;_inv_x1[1]=_inv_x1[2]=_inv_x1[3]=_inv_x1[4]=_inv_x1[5]=_inv_x1[6]=_inv_x1[7]=0
  _inv_x2[0]=_inv_x2[1]=_inv_x2[2]=_inv_x2[3]=_inv_x2[4]=_inv_x2[5]=_inv_x2[6]=_inv_x2[7]=0
  while (!isZero(_inv_u) && !isZero(_inv_v)) {
    while (!(_inv_u[0] & 1)) {
      shr1(_inv_u)
      let c = 0
      if (_inv_x1[0] & 1) c = add(_inv_x1, _inv_x1, P)
      shr1(_inv_x1)
      if (c) _inv_x1[7] |= 0x80000000
    }
    while (!(_inv_v[0] & 1)) {
      shr1(_inv_v)
      let c = 0
      if (_inv_x2[0] & 1) c = add(_inv_x2, _inv_x2, P)
      shr1(_inv_x2)
      if (c) _inv_x2[7] |= 0x80000000
    }
    if (cmp(_inv_u, _inv_v) >= 0) { sub(_inv_u, _inv_u, _inv_v); modSub(_inv_x1, _inv_x1, _inv_x2) }
    else { sub(_inv_v, _inv_v, _inv_u); modSub(_inv_x2, _inv_x2, _inv_x1) }
  }
  copy(r, isZero(_inv_u) ? _inv_x2 : _inv_x1)
}

// Point operations in Jacobian coordinates
const _dbl_A = new Uint32Array(8), _dbl_B = new Uint32Array(8)
const _dbl_C = new Uint32Array(8), _dbl_D = new Uint32Array(8), _dbl_t = new Uint32Array(8)

const jacDbl = (RX, RY, RZ, X, Y, Z) => {
  if (isZero(Z)) { for (let i = 0; i < 8; i++) RZ[i] = 0; return }
  // A = Y^2, B = 4*X*Y^2, C = 8*Y^4
  modSqr(_dbl_A, Y); modMul(_dbl_B, X, _dbl_A); modAdd(_dbl_B, _dbl_B, _dbl_B); modAdd(_dbl_B, _dbl_B, _dbl_B)
  modSqr(_dbl_C, _dbl_A); modAdd(_dbl_C, _dbl_C, _dbl_C); modAdd(_dbl_C, _dbl_C, _dbl_C); modAdd(_dbl_C, _dbl_C, _dbl_C)
  // D = 3*(X-Z^2)*(X+Z^2) for a=-3
  modSqr(_dbl_t, Z); modSub(_dbl_D, X, _dbl_t); modAdd(_dbl_t, X, _dbl_t)
  modMul(_dbl_D, _dbl_D, _dbl_t); modAdd(_dbl_t, _dbl_D, _dbl_D); modAdd(_dbl_D, _dbl_t, _dbl_D)
  // X' = D^2 - 2*B, Y' = D*(B-X') - C, Z' = 2*Y*Z
  modSqr(RX, _dbl_D); modSub(RX, RX, _dbl_B); modSub(RX, RX, _dbl_B)
  modSub(_dbl_t, _dbl_B, RX); modMul(RY, _dbl_D, _dbl_t); modSub(RY, RY, _dbl_C)
  modMul(RZ, Y, Z); modAdd(RZ, RZ, RZ)
}

const _madd_t = new Uint32Array(8), _madd_t2 = new Uint32Array(8)
const _madd_H = new Uint32Array(8), _madd_R = new Uint32Array(8), _madd_V = new Uint32Array(8)

const jacAddAffine = (RX, RY, RZ, X1, Y1, Z1, X2, Y2) => {
  if (isZero(Z1)) { copy(RX, X2); copy(RY, Y2); RZ[0] = 1; for (let i = 1; i < 8; i++) RZ[i] = 0; return }
  modSqr(_madd_t, Z1); modMul(_madd_t2, X2, _madd_t)
  modSub(_madd_H, _madd_t2, X1)
  modMul(_madd_t, _madd_t, Z1); modMul(_madd_t2, Y2, _madd_t)
  modSub(_madd_R, _madd_t2, Y1)
  if (isZero(_madd_H)) { if (isZero(_madd_R)) { jacDbl(RX, RY, RZ, X1, Y1, Z1) } else { for (let i = 0; i < 8; i++) RZ[i] = 0 } return }
  modSqr(_madd_t, _madd_H)
  modMul(_madd_V, X1, _madd_t)
  modMul(_madd_t2, _madd_t, _madd_H)
  modSqr(RX, _madd_R); modSub(RX, RX, _madd_t2); modSub(RX, RX, _madd_V); modSub(RX, RX, _madd_V)
  modSub(_madd_t, _madd_V, RX); modMul(RY, _madd_R, _madd_t); modMul(_madd_t, Y1, _madd_t2); modSub(RY, RY, _madd_t)
  modMul(RZ, Z1, _madd_H)
}

// Buffers for scalar multiplication
const _RX = new Uint32Array(8), _RY = new Uint32Array(8), _RZ = new Uint32Array(8)
const _TX = new Uint32Array(8), _TY = new Uint32Array(8), _TZ = new Uint32Array(8)
const _zi = new Uint32Array(8), _zi2 = new Uint32Array(8), _zi3 = new Uint32Array(8)

// ============================================
// wNAF-9 for G multiplication using precomputed table
// 128 odd multiples: 1G, 3G, 5G, ..., 255G
// ~28 additions + 256 doublings
// ============================================
const _wnaf9 = new Int16Array(257)
const _wnaf9_w = new Uint32Array(9)

const toWNAF9 = (k) => {
  for (let i = 0; i < 8; i++) _wnaf9_w[i] = k[i]
  _wnaf9_w[8] = 0
  const w = _wnaf9_w
  let len = 0
  while (w[0] || w[1] || w[2] || w[3] || w[4] || w[5] || w[6] || w[7] || w[8]) {
    if (w[0] & 1) {
      let digit = w[0] & 0x1FF
      if (digit >= 256) digit -= 512
      _wnaf9[len] = digit
      if (digit > 0) {
        w[0] = (w[0] - digit) >>> 0
      } else {
        let c = -digit
        for (let i = 0; i < 9 && c; i++) { const s = w[i] + c; w[i] = s >>> 0; c = s > 0xFFFFFFFF ? 1 : 0 }
      }
    } else {
      _wnaf9[len] = 0
    }
    for (let i = 0; i < 8; i++) w[i] = (w[i] >>> 1) | ((w[i + 1] & 1) << 31)
    w[8] >>>= 1
    len++
  }
  return len
}

const _buf_x = [_RX, _TX]
const _buf_y = [_RY, _TY]
const _buf_z = [_RZ, _TZ]

const scalarMulG_wnaf9 = (rx, ry, k) => {
  const wnafLen = toWNAF9(k)

  let c = 0
  for (let i = 0; i < 8; i++) { _buf_x[0][i] = 0; _buf_y[0][i] = 0; _buf_z[0][i] = 0 }

  for (let i = wnafLen - 1; i >= 0; i--) {
    const n = 1 - c
    jacDbl(_buf_x[n], _buf_y[n], _buf_z[n], _buf_x[c], _buf_y[c], _buf_z[c])
    c = n

    const d = _wnaf9[i]
    if (d !== 0) {
      const nn = 1 - c
      const idx = ((d < 0 ? -d : d) - 1) >> 1
      const px = G_WNAF8_X[idx]
      const py = d > 0 ? G_WNAF8_Y[idx] : G_WNAF8_NY[idx]
      jacAddAffine(_buf_x[nn], _buf_y[nn], _buf_z[nn], _buf_x[c], _buf_y[c], _buf_z[c], px, py)
      c = nn
    }
  }

  const curX = _buf_x[c], curY = _buf_y[c], curZ = _buf_z[c]
  if (isZero(curZ)) { for (let i = 0; i < 8; i++) { rx[i] = 0; ry[i] = 0 }; return false }
  modInv(_zi, curZ); modSqr(_zi2, _zi); modMul(_zi3, _zi2, _zi)
  modMul(rx, curX, _zi2); modMul(ry, curY, _zi3)
  return true
}

// ============================================
// wNAF-4 for general scalar multiplication (ECDH)
// ============================================
const _wnaf = new Int8Array(257)
const _wnaf_w = new Uint32Array(9)

const _pre = {
  x: [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)],
  y: [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)],
  ny: [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)]
}
const _pre_tx = new Uint32Array(8), _pre_ty = new Uint32Array(8), _pre_tz = new Uint32Array(8)
const _pre_2x = new Uint32Array(8), _pre_2y = new Uint32Array(8), _pre_2z = new Uint32Array(8)
const _pre_zi = new Uint32Array(8), _pre_zi2 = new Uint32Array(8)
const _batch_z = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)]
const _batch_x = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)]
const _batch_y = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)]
const _batch_prod = [new Uint32Array(8), new Uint32Array(8), new Uint32Array(8)]
const _batch_inv = new Uint32Array(8), _batch_t = new Uint32Array(8)

const toWNAF = (k) => {
  for (let i = 0; i < 8; i++) _wnaf_w[i] = k[i]
  _wnaf_w[8] = 0
  const w = _wnaf_w
  let len = 0
  while (w[0] || w[1] || w[2] || w[3] || w[4] || w[5] || w[6] || w[7] || w[8]) {
    if (w[0] & 1) {
      let digit = w[0] & 0xF
      if (digit >= 8) digit -= 16
      _wnaf[len] = digit
      if (digit > 0) {
        w[0] = (w[0] - digit) >>> 0
      } else {
        let c = -digit
        for (let i = 0; i < 9 && c; i++) { const s = w[i] + c; w[i] = s >>> 0; c = s > 0xFFFFFFFF ? 1 : 0 }
      }
    } else {
      _wnaf[len] = 0
    }
    for (let i = 0; i < 8; i++) w[i] = (w[i] >>> 1) | ((w[i + 1] & 1) << 31)
    w[8] >>>= 1
    len++
  }
  return len
}

const precompute = (Px, Py) => {
  copy(_pre.x[0], Px); copy(_pre.y[0], Py); sub(_pre.ny[0], P, Py)
  _pre_tz[0] = 1; for (let i = 1; i < 8; i++) _pre_tz[i] = 0
  jacDbl(_pre_2x, _pre_2y, _pre_2z, Px, Py, _pre_tz)
  modInv(_pre_zi, _pre_2z); modSqr(_pre_zi2, _pre_zi)
  modMul(_pre_tx, _pre_2x, _pre_zi2)
  modMul(_pre_zi, _pre_zi2, _pre_zi)
  modMul(_pre_ty, _pre_2y, _pre_zi)
  _pre_tz[0] = 1; for (let i = 1; i < 8; i++) _pre_tz[i] = 0
  jacAddAffine(_batch_x[0], _batch_y[0], _batch_z[0], Px, Py, _pre_tz, _pre_tx, _pre_ty)
  jacAddAffine(_batch_x[1], _batch_y[1], _batch_z[1], _batch_x[0], _batch_y[0], _batch_z[0], _pre_tx, _pre_ty)
  jacAddAffine(_batch_x[2], _batch_y[2], _batch_z[2], _batch_x[1], _batch_y[1], _batch_z[1], _pre_tx, _pre_ty)
  copy(_batch_prod[0], _batch_z[0])
  modMul(_batch_prod[1], _batch_prod[0], _batch_z[1])
  modMul(_batch_prod[2], _batch_prod[1], _batch_z[2])
  modInv(_batch_inv, _batch_prod[2])
  modMul(_pre_zi, _batch_prod[1], _batch_inv)
  modSqr(_pre_zi2, _pre_zi); modMul(_pre.x[3], _batch_x[2], _pre_zi2)
  modMul(_pre_zi, _pre_zi2, _pre_zi); modMul(_pre.y[3], _batch_y[2], _pre_zi)
  sub(_pre.ny[3], P, _pre.y[3])
  modMul(_batch_t, _batch_z[2], _batch_inv)
  modMul(_pre_zi, _batch_prod[0], _batch_t)
  modSqr(_pre_zi2, _pre_zi); modMul(_pre.x[2], _batch_x[1], _pre_zi2)
  modMul(_pre_zi, _pre_zi2, _pre_zi); modMul(_pre.y[2], _batch_y[1], _pre_zi)
  sub(_pre.ny[2], P, _pre.y[2])
  modMul(_pre_zi, _batch_z[1], _batch_t)
  modSqr(_pre_zi2, _pre_zi); modMul(_pre.x[1], _batch_x[0], _pre_zi2)
  modMul(_pre_zi, _pre_zi2, _pre_zi); modMul(_pre.y[1], _batch_y[0], _pre_zi)
  sub(_pre.ny[1], P, _pre.y[1])
}

const scalarMul = (rx, ry, k, Px, Py) => {
  precompute(Px, Py)
  const wnafLen = toWNAF(k)
  const preX = _pre.x, preY = _pre.y, preNY = _pre.ny
  let c = 0
  for (let i = 0; i < 8; i++) { _buf_x[0][i] = 0; _buf_y[0][i] = 0; _buf_z[0][i] = 0 }
  for (let i = wnafLen - 1; i >= 0; i--) {
    const n = 1 - c
    jacDbl(_buf_x[n], _buf_y[n], _buf_z[n], _buf_x[c], _buf_y[c], _buf_z[c])
    c = n
    const d = _wnaf[i]
    if (d !== 0) {
      const nn = 1 - c
      const idx = ((d < 0 ? -d : d) - 1) >> 1
      const px = preX[idx], py = d > 0 ? preY[idx] : preNY[idx]
      jacAddAffine(_buf_x[nn], _buf_y[nn], _buf_z[nn], _buf_x[c], _buf_y[c], _buf_z[c], px, py)
      c = nn
    }
  }
  const curX = _buf_x[c], curY = _buf_y[c], curZ = _buf_z[c]
  if (isZero(curZ)) { for (let i = 0; i < 8; i++) { rx[i] = 0; ry[i] = 0 }; return false }
  modInv(_zi, curZ); modSqr(_zi2, _zi); modMul(_zi3, _zi2, _zi)
  modMul(rx, curX, _zi2); modMul(ry, curY, _zi3)
  return true
}

// Byte conversions
const bytesToU256 = (bytes) => {
  const r = new Uint32Array(8)
  for (let i = 0; i < 8; i++) {
    const idx = 28 - i * 4
    r[i] = (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3]
  }
  return r
}

const u256ToBytes = (a) => {
  const r = new Uint8Array(32)
  for (let i = 0; i < 8; i++) {
    const idx = 28 - i * 4
    r[idx] = (a[i] >>> 24) & 0xFF
    r[idx + 1] = (a[i] >>> 16) & 0xFF
    r[idx + 2] = (a[i] >>> 8) & 0xFF
    r[idx + 3] = a[i] & 0xFF
  }
  return r
}

const _pub_x = new Uint32Array(8), _pub_y = new Uint32Array(8)

function checkBigInt() { return true }

function generatePrivateKey() {
  const k = new Uint32Array(8)
  for (let i = 0; i < 8; i++) k[i] = (Math.random() * 0xFFFFFFFF) >>> 0
  while (cmp(k, N) >= 0 || isZero(k)) k[7] >>>= 1
  return u256ToBytes(k)
}

function getPublicKey(privateKeyBytes) {
  const k = bytesToU256(privateKeyBytes)
  scalarMulG_wnaf9(_pub_x, _pub_y, k)  // wNAF-9 with 128 precomputed points
  const result = new Uint8Array(65)
  result[0] = 0x04
  result.set(u256ToBytes(_pub_x), 1)
  result.set(u256ToBytes(_pub_y), 33)
  return result
}

function ecdh(privateKeyBytes, publicKeyBytes) {
  const k = bytesToU256(privateKeyBytes)
  let pubX, pubY
  if (publicKeyBytes[0] === 0x04 && publicKeyBytes.length === 65) {
    pubX = bytesToU256(publicKeyBytes.slice(1, 33))
    pubY = bytesToU256(publicKeyBytes.slice(33, 65))
  } else if (publicKeyBytes.length === 64) {
    pubX = bytesToU256(publicKeyBytes.slice(0, 32))
    pubY = bytesToU256(publicKeyBytes.slice(32, 64))
  } else {
    throw new Error('Invalid public key')
  }
  if (!scalarMul(_pub_x, _pub_y, k, pubX, pubY)) throw new Error('ECDH failed')
  return u256ToBytes(_pub_x)
}

export {
  checkBigInt,
  generatePrivateKey,
  getPublicKey,
  ecdh,
  bytesToU256 as bytesToBigInt,
  u256ToBytes as bigIntToBytes
}
