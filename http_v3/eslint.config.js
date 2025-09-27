export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module', // Your code uses ES6 modules
      globals: {
        // ZeppOS globals
        hmUI: 'readonly',
        hmFS: 'readonly',
        hmSetting: 'readonly',
        hmApp: 'readonly',
        hmBle: 'readonly',
        DeviceRuntimeCore: 'readonly',
        px: 'readonly',
        // Node.js/CommonJS globals
        console: 'readonly',
        process: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
];