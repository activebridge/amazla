export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  testMatch: ['**/*.test.js'],
  verbose: true,
  moduleNameMapper: {
    '^@zos/(.*)$': '<rootDir>/__mocks__/zos.js',
    '^@silver-zepp/(.*)$': '<rootDir>/__mocks__/easy-ble.js',
    '^@zeppos/(.*)$': '<rootDir>/__mocks__/zos.js'
  }
}
