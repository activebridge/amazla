
const P = new Uint32Array([0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0, 0, 0, 1, 0xFFFFFFFF])
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
const _m = new Uint32Array(16)
const _t = new Float64Array(17)
const M32 = 2.3283064365386963e-10  // 1/2^32
const mul256 = (r, a, b) => {
  for (let i = 0; i < 16; i++) _t[i] = 0
  for (let i = 0; i < 8; i++) {
    const ai = a[i], al = ai & 0xFFFF, ah = ai >>> 16
    for (let j = 0; j < 8; j++) {
      const bj = b[j], bl = bj & 0xFFFF, bh = bj >>> 16
      const ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh
      const lhL = lh & 0xFFFF, lhH = lh >>> 16
      const hlL = hl & 0xFFFF, hlH = hl >>> 16
      let mL = lhL + hlL
      const mH = lhH + hlH + (mL >>> 16)
      mL &= 0xFFFF
      _t[i + j] += ll + mL * 65536
      _t[i + j + 1] += hh + mH
    }
  }
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
const sqr256 = (r, a) => {
  for (let i = 0; i < 16; i++) _t[i] = 0
  for (let i = 0; i < 8; i++) {
    const ai = a[i], al = ai & 0xFFFF, ah = ai >>> 16
    const ll = al * al, lh = al * ah, hh = ah * ah
    const mL = (lh & 0xFFFF) * 2, mH = (lh >>> 16) * 2 + (mL >>> 16)
    _t[i * 2] += ll + (mL & 0xFFFF) * 65536
    _t[i * 2 + 1] += hh + mH
    for (let j = i + 1; j < 8; j++) {
      const bj = a[j], bl = bj & 0xFFFF, bh = bj >>> 16
      const ll2 = al * bl, lh2 = al * bh, hl2 = ah * bl, hh2 = ah * bh
      const lhL = lh2 & 0xFFFF, lhH = lh2 >>> 16
      const hlL = hl2 & 0xFFFF, hlH = hl2 >>> 16
      let mL2 = lhL + hlL
      const mH2 = lhH + hlH + (mL2 >>> 16)
      mL2 &= 0xFFFF
      _t[i + j] += (ll2 + mL2 * 65536) * 2
      _t[i + j + 1] += (hh2 + mH2) * 2
    }
  }
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
  const a0 = t[0] + c8 + c9 - c11 - c12 - c13 - c14
  const a1 = t[1] + c9 + c10 - c12 - c13 - c14 - c15
  const a2 = t[2] + c10 + c11 - c13 - c14 - c15
  const a3 = t[3] + 2*(c11 + c12) + c13 - c8 - c9 - c15
  const a4 = t[4] + 2*(c12 + c13) + c14 - c9 - c10
  const a5 = t[5] + 2*(c13 + c14) + c15 - c10 - c11
  const a6 = t[6] + 3*c14 + 2*c15 + c13 - c8 - c9
  const a7 = t[7] + 3*c15 + c8 - c10 - c11 - c12 - c13
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
  while (c > 0) { c -= sub(r, r, P) }
  while (c < 0) { c += add(r, r, P) }
  if (cmp(r, P) >= 0) sub(r, r, P)
}
const modMul = (r, a, b) => { mul256(_m, a, b); reduce(r, _m) }
const modSqr = (r, a) => { sqr256(_m, a); reduce(r, _m) }
const shr1 = (a) => {
  a[0]=(a[0]>>>1)|((a[1]&1)<<31);a[1]=(a[1]>>>1)|((a[2]&1)<<31)
  a[2]=(a[2]>>>1)|((a[3]&1)<<31);a[3]=(a[3]>>>1)|((a[4]&1)<<31)
  a[4]=(a[4]>>>1)|((a[5]&1)<<31);a[5]=(a[5]>>>1)|((a[6]&1)<<31)
  a[6]=(a[6]>>>1)|((a[7]&1)<<31);a[7]>>>=1
}
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
const _dbl_A = new Uint32Array(8), _dbl_B = new Uint32Array(8)
const _dbl_C = new Uint32Array(8), _dbl_D = new Uint32Array(8), _dbl_t = new Uint32Array(8)
const jacDbl = (RX, RY, RZ, X, Y, Z) => {
  if (isZero(Z)) { for (let i = 0; i < 8; i++) RZ[i] = 0; return }
  modSqr(_dbl_A, Y)
  modMul(_dbl_B, X, _dbl_A); modAdd(_dbl_B, _dbl_B, _dbl_B); modAdd(_dbl_B, _dbl_B, _dbl_B)
  modSqr(_dbl_C, _dbl_A); modAdd(_dbl_C, _dbl_C, _dbl_C); modAdd(_dbl_C, _dbl_C, _dbl_C); modAdd(_dbl_C, _dbl_C, _dbl_C)
  modSqr(_dbl_t, Z); modSub(_dbl_D, X, _dbl_t); modAdd(_dbl_t, X, _dbl_t)
  modMul(_dbl_D, _dbl_D, _dbl_t); modAdd(_dbl_t, _dbl_D, _dbl_D); modAdd(_dbl_D, _dbl_t, _dbl_D)
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
const _RX = new Uint32Array(8), _RY = new Uint32Array(8), _RZ = new Uint32Array(8)
const _TX = new Uint32Array(8), _TY = new Uint32Array(8), _TZ = new Uint32Array(8)
const _zi = new Uint32Array(8), _zi2 = new Uint32Array(8), _zi3 = new Uint32Array(8)
const scalarMulFixed = (rx, ry, k, table) => {
  for (let i = 0; i < 8; i++) { _RX[i]=0; _RY[i]=0; _RZ[i]=0 }
  for (let i = 0; i < 256; i++) {
    if ((k[i >> 5] >>> (i & 31)) & 1) {
      const b = i * 16
      jacAddAffine(_TX, _TY, _TZ, _RX, _RY, _RZ, table.subarray(b, b + 8), table.subarray(b + 8, b + 16))
      copy(_RX, _TX); copy(_RY, _TY); copy(_RZ, _TZ)
    }
  }
  if (isZero(_RZ)) { for (let i = 0; i < 8; i++) { rx[i]=0; ry[i]=0 }; return false }
  modInv(_zi, _RZ); modSqr(_zi2, _zi); modMul(_zi3, _zi2, _zi)
  modMul(rx, _RX, _zi2); modMul(ry, _RY, _zi3)
  return true
}
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
function ecdhFixed(privateKeyBytes, table) {
  const k = bytesToU256(privateKeyBytes)
  if (!scalarMulFixed(_pub_x, _pub_y, k, table)) throw new Error('ECDH failed')
  return u256ToBytes(_pub_x)
}
export {
  ecdhFixed,
  bytesToU256 as bytesToBigInt,
}
