
const EAN13_ENCODING = {
  L: {
    0: '0001101',
    1: '0011001',
    2: '0010011',
    3: '0111101',
    4: '0100011',
    5: '0110001',
    6: '0101111',
    7: '0111011',
    8: '0110111',
    9: '0001011'
  },
  G: {
    0: '0100111',
    1: '0110011',
    2: '0011011',
    3: '0100001',
    4: '0011101',
    5: '0111001',
    6: '0000101',
    7: '0010001',
    8: '0001001',
    9: '0010111'
  },
  R: {
    0: '1110010',
    1: '1100110',
    2: '1101100',
    3: '1000010',
    4: '1011100',
    5: '1001110',
    6: '1010000',
    7: '1000100',
    8: '1001000',
    9: '1110100'
  }
};

const PARITY_PATTERNS = {
  0: ['L', 'L', 'L', 'L', 'L', 'L'],
  1: ['L', 'L', 'G', 'L', 'G', 'G'],
  2: ['L', 'L', 'G', 'G', 'L', 'G'],
  3: ['L', 'L', 'G', 'G', 'G', 'L'],
  4: ['L', 'G', 'L', 'L', 'G', 'G'],
  5: ['L', 'G', 'G', 'L', 'L', 'G'],
  6: ['L', 'G', 'G', 'G', 'L', 'L'],
  7: ['L', 'G', 'L', 'G', 'L', 'G'],
  8: ['L', 'G', 'L', 'G', 'G', 'L'],
  9: ['L', 'G', 'G', 'L', 'G', 'L']
};

const START_END_GUARD = '101';
const MIDDLE_GUARD = '01010';

export const encodeEAN13 = (ean13) => {
  // if (!/^\d{13}$/.test(ean13)) {
  //   throw new Error('Invalid EAN-13 code');
  // }

  const firstDigit = parseInt(ean13[0], 10);
  const leftPart = ean13.slice(1, 7);
  const rightPart = ean13.slice(7);

  const parityPattern = PARITY_PATTERNS[firstDigit];

  let encoded = START_END_GUARD;

  // Encode the left part using the parity pattern
  for (let i = 0; i < leftPart.length; i++) {
    const digit = leftPart[i];
    const encodingType = parityPattern[i];
    encoded += EAN13_ENCODING[encodingType][digit];
  }

  // Add middle guard
  encoded += MIDDLE_GUARD;

  // Encode the right part
  for (let i = 0; i < rightPart.length; i++) {
    const digit = rightPart[i];
    encoded += EAN13_ENCODING.R[digit];
  }

  // Add end guard
  encoded += START_END_GUARD;

  // Convert encoded string to an array of 0s and 1s
  return Array.from(encoded).map(char => parseInt(char, 10));
}
