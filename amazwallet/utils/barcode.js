// Unified Barcode Interface
// Provides a single interface for all barcode types

import { encodeEAN13 } from './ean13';
import { encodeCode39, isValidCode39 } from './code39';
import { encodeCode128, isValidCode128 } from './code128';

export const BARCODE_TYPES = {
  EAN13: 'ean13',
  CODE39: 'code39',
  CODE128: 'code128',
  QR: 'qr'
};

/**
 * Encodes a string as a barcode
 * @param {string} code - The string to encode
 * @param {string} type - The barcode type ('ean13', 'code39', 'code128', 'qr')
 * @returns {Array<number>|null} - Array of 0s and 1s, or null for QR codes
 */
export const encodeBarcode = (code, type = 'ean13') => {
  switch (type) {
    case 'ean13':
      return encodeEAN13(code);
    case 'code39':
      return encodeCode39(code);
    case 'code128':
      return encodeCode128(code);
    case 'qr':
      return null; // QR uses native widget, no encoding needed
    default:
      return encodeEAN13(code); // Default to EAN-13 for backward compatibility
  }
};

/**
 * Validates if a code is valid for a given barcode type
 * @param {string} code - The string to validate
 * @param {string} type - The barcode type
 * @returns {boolean} - True if valid
 */
export const isValidBarcode = (code, type = 'ean13') => {
  switch (type) {
    case 'ean13':
      return code && code.length === 13 && /^\d+$/.test(code);
    case 'code39':
      return isValidCode39(code);
    case 'code128':
      return isValidCode128(code);
    case 'qr':
      return true; // QR codes accept any string
    default:
      return false;
  }
};

/**
 * Gets the input label for a barcode type
 * @param {string} type - The barcode type
 * @returns {string} - The label text
 */
export const getBarcodeLabel = (type) => {
  switch (type) {
    case 'ean13':
      return 'Card Number (numbers only, 8-13 digits)';
    case 'code39':
      return 'Card Number (letters & numbers, max 25 chars)';
    case 'code128':
      return 'Card Number (any characters, max 30 chars)';
    case 'qr':
      return 'QR Content (URL or any text)';
    default:
      return 'Card Number';
  }
};

/**
 * Gets the placeholder text for a barcode type
 * @param {string} type - The barcode type
 * @returns {string} - The placeholder text
 */
export const getBarcodePlaceholder = (type) => {
  switch (type) {
    case 'ean13':
      return '0123456789012';
    case 'code39':
      return 'ABC123';
    case 'code128':
      return 'Member2024';
    case 'qr':
      return 'https://example.com';
    default:
      return '';
  }
};

/**
 * Gets a human-readable name for a barcode type
 * @param {string} type - The barcode type
 * @returns {string} - The display name
 */
export const getBarcodeTypeName = (type) => {
  switch (type) {
    case 'ean13':
      return 'EAN-13';
    case 'code39':
      return 'CODE 39';
    case 'code128':
      return 'CODE 128';
    case 'qr':
      return 'QR Code';
    default:
      return 'Unknown';
  }
};

/**
 * Auto-detects the best barcode type based on input
 * @param {string} code - The code to analyze
 * @returns {string} - Suggested barcode type
 */
export const detectBarcodeType = (code) => {
  if (!code || code.length === 0) return 'ean13';

  // Check for URL or long text → QR Code
  if (code.indexOf('http://') >= 0 || code.indexOf('https://') >= 0 || code.length > 30) {
    return 'qr';
  }

  // Check for exactly 13 digits → EAN-13
  const is13Digits = code.length === 13 && /^\d+$/.test(code);
  if (is13Digits) {
    return 'ean13';
  }

  // Check for 8-20 digits → Probably EAN-13 (will be padded)
  const isNumeric = /^\d+$/.test(code);
  if (isNumeric && code.length >= 8 && code.length <= 20) {
    return 'ean13';
  }

  // Check for alphanumeric only (letters, numbers, space, dash) → CODE 39
  const isAlphanumeric = /^[0-9A-Z -]+$/i.test(code);
  if (isAlphanumeric && code.length <= 25) {
    return 'code39';
  }

  // Check for any ASCII with special chars → CODE 128
  if (code.length <= 30) {
    return 'code128';
  }

  // Default to QR for anything else
  return 'qr';
};
