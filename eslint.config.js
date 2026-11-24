// @ts-check
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    // The spec renderer generates these files. They are not source code.
    'docs/specs/html/',
    'docs/specs/spec.html',
    'docs/specs/assets/',
    'docs/specs/mockups/',
  ]),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    // These limits come from the behaviour rules of the foundation feature.
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'no-unreachable': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
])
