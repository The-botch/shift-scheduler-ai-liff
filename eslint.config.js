import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
    },
  },
  {
    files: ['**/*.html'],
    plugins: {
      html,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        liff: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'backend/node_modules/',
      '.git/',
      'dist/',
      'build/',
    ],
  },
];
