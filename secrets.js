export const CLIENT_ID = '799e90d17f3e-4514-a2ab-3f82b2ba116d'
export const CLIENT_SECRET = 'ta-secret.UVMnPkZXP9to9HA1'

// Tesla BLE private key (32 bytes as hex string, 64 characters)
export const TESLA_PRIVATE_KEY = 'e3209a6acda9da4fe518ac39df6d031c43e8d3620557d3c69736c1359c152fa3'

// Tesla BLE public key (65 bytes as hex string, 130 characters - pre-computed to avoid crypto at pairing)
// Uncompressed P-256 point: 04 || X (32 bytes) || Y (32 bytes)
export const TESLA_PUBLIC_KEY = '048182f275a4eef98382745d43d8bf86cf1931910343e2c75337a01adf6d58ee953424543b3fec74cfff934e0db68b9514700396c646df19a171caa3290d837be4'
