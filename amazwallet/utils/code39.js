// Code 39 Barcode Encoder
// Supports: A-Z, 0-9, and special characters (-.$/+% and space)
// Standard: ISO/IEC 16388

const CODE39_ENCODING = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  'A': '110101001011',
  'B': '101101001011',
  'C': '110110100101',
  'D': '101011001011',
  'E': '110101100101',
  'F': '101101100101',
  'G': '101010011011',
  'H': '110101001101',
  'I': '101101001101',
  'J': '101011001101',
  'K': '110101010011',
  'L': '101101010011',
  'M': '110110101001',
  'N': '101011010011',
  'O': '110101101001',
  'P': '101101101001',
  'Q': '101010110011',
  'R': '110101011001',
  'S': '101101011001',
  'T': '101011011001',
  'U': '110010101011',
  'V': '100110101011',
  'W': '110011010101',
  'X': '100101101011',
  'Y': '110010110101',
  'Z': '100110110101',
  '-': '100101011011',
  '.': '110010101101',
  ' ': '100110101101',
  '$': '100100100101',
  '/': '100100101001',
  '+': '100101001001',
  '%': '101001001001',
  '*': '100101101101'  // Start/Stop character
};

const VALID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/**
 * Validates if a string can be encoded as Code 39
 * @param {string} code - The string to validate
 * @returns {boolean} - True if valid
 */
export const isValidCode39 = (code) => {
  if (!code || typeof code !== 'string') return false;

  const upperCode = code.toUpperCase();

  // Check if all characters are valid
  for (let i = 0; i < upperCode.length; i++) {
    if (VALID_CHARS.indexOf(upperCode[i]) === -1) {
      return false;
    }
  }

  // Check length (25 chars should fit comfortably in 360px)
  if (upperCode.length > 25) {
    return false;
  }

  return true;
};

/**
 * Encodes a string as Code 39 barcode
 * @param {string} code - The string to encode
 * @returns {Array<number>} - Array of 0s and 1s representing the barcode
 */
export const encodeCode39 = (code) => {
  if (!code) return [];

  // Convert to uppercase
  const upperCode = code.toUpperCase();

  // Validate input
  if (!isValidCode39(upperCode)) {
    console.error('Invalid Code 39 input:', code);
    return [];
  }

  let encoded = '';

  // Add start character
  encoded += CODE39_ENCODING['*'];

  // Add narrow space between characters
  encoded += '0';

  // Encode each character
  for (let i = 0; i < upperCode.length; i++) {
    const char = upperCode[i];
    encoded += CODE39_ENCODING[char];

    // Add narrow space between characters (except after last char)
    if (i < upperCode.length - 1) {
      encoded += '0';
    }
  }

  // Add narrow space before stop character
  encoded += '0';

  // Add stop character
  encoded += CODE39_ENCODING['*'];

  // Convert string to array of numbers
  return Array.from(encoded).map(char => parseInt(char, 10));
};
