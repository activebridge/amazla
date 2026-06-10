// Infotainment (car-server) domain — AES-GCM-authenticated command assembly.
//
// Parallel to the VCSEC HMAC path in session.js (`_buildAuthMessage`): instead of
// HMAC-tagging a plaintext UnsignedMessage, this ENCRYPTS a carserver command and
// authenticates the metadata as GCM AAD. Used for climate, charging, charge-port,
// and vehicle-data on DOMAIN_INFOTAINMENT.
//
// Crypto verified against the Tesla Go SDK (internal/authentication): the GCM key is
// the raw session key (sha1(ECDH)[:16], used directly — not a subkey), the AAD is
// sha256(metadata_TLV || TAG_END), the RoutableMessage payload carries the ciphertext,
// and the nonce/tag travel in signature_data as AES_GCM_Personalized_Signature_Data.

import { sha256 } from './crypto/sha256.js'
import { gcmEncrypt } from './crypto/aes-gcm.js'
import {
  buildAesGcmMetadataInput,
  buildAesGcmSignatureData,
  buildRoutableMessage,
  DOMAIN_INFOTAINMENT,
} from './protocol/vcsec.js'

// GCM nonce = 8 random salt bytes || 4-byte counter (big-endian). GCM nonce reuse
// with a fixed key is catastrophic; the session key is constant per watch+vehicle,
// so the counter half GUARANTEES per-message uniqueness within a session, and the
// salt makes cross-session collisions improbable even though the watch only has
// Math.random (no getRandomValues — same source as generateUUID).
const buildNonce = (counter) => {
  const n = new Uint8Array(12)
  for (let i = 0; i < 8; i++) n[i] = Math.floor(Math.random() * 256)
  n[8] = (counter >>> 24) & 0xff
  n[9] = (counter >>> 16) & 0xff
  n[10] = (counter >>> 8) & 0xff
  n[11] = counter & 0xff
  return n
}

// Compute the GCM associated data for a command: sha256 of the metadata TLV.
const aesGcmAad = (vin, domain, epoch, counter, expiresAt) =>
  sha256(buildAesGcmMetadataInput(vin || new Uint8Array(0), domain, epoch, counter, expiresAt))

// Assemble a complete AES-GCM RoutableMessage. `plaintext` is the carserver command
// protobuf (e.g. a VehicleAction). Returns { message, nonce } — the nonce is also
// embedded in signature_data, returned for logging/tests.
const buildAesGcmCommand = ({
  sessionKey,
  vin,
  signerPublicKey,
  domain = DOMAIN_INFOTAINMENT,
  epoch,
  counter,
  expiresAt,
  routingAddress,
  uuid,
  plaintext,
  nonce,
}) => {
  const aad = aesGcmAad(vin, domain, epoch, counter, expiresAt)
  const n = nonce || buildNonce(counter)
  const { ciphertext, tag } = gcmEncrypt(sessionKey, n, plaintext, aad)
  const signatureData = buildAesGcmSignatureData(signerPublicKey, epoch, n, counter, expiresAt, tag)
  const message = buildRoutableMessage({
    toDomain: domain,
    routingAddress,
    payload: ciphertext,
    signatureData,
    uuid,
  })
  return { message, nonce: n }
}

export { buildAesGcmCommand, buildNonce, aesGcmAad }
