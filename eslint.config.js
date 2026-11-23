import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Size and complexity limits, the same for production code and scripts. */
const SIZE_LIMITS = {
  complexity: ['error', 8],
  'sonarjs/cognitive-complexity': ['error', 8],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 4],
  // Code lines fit 120 characters; long copy strings may run longer so sentences stay whole.
  'max-len': [
    'error',
    { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true, ignoreUrls: true },
  ],
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-server',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'screenshots',
      '.vercel',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((c) => ({ ...c, files: ['**/*.{ts,tsx}'] })),
  jsxA11y.flatConfigs.strict,
  // SonarJS code-smell rules (complexity, nested conditionals, regex safety), as a static-analysis reviewer would run.
  sonarjs.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    // Type-aware linting: rules that need the type checker (floating promises, unnecessary conditions…) run too.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'simple-import-sort': simpleImportSort },
    rules: {
      ...reactHooks.configs.recommended.rules,
      eqeqeq: 'error',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // One predictable import order everywhere, fixed automatically by `eslint --fix`.
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'sonarjs/prefer-read-only-props': 'error',
      ...SIZE_LIMITS,
    },
  },
  {
    // Tests, e2e and scripts talk to a local server on purpose: 127.0.0.1 and plain http are the point there.
    files: ['**/*.test.{ts,tsx}', 'test/**', 'e2e/**', 'scripts/**'],
    rules: {
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
    },
  },
  {
    // Test doubles and fixtures are loosely typed on purpose; scripts keep the same complexity limits as production.
    files: ['**/*.test.{ts,tsx}', 'test/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      complexity: 'off',
      'sonarjs/cognitive-complexity': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    // Playwright scripts also run small functions inside the page, where browser globals exist.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { 'simple-import-sort': simpleImportSort },
    // Scripts report to the terminal, so console is their output; every other limit is production's.
    rules: {
      'no-console': 'off',
      eqeqeq: 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      ...SIZE_LIMITS,
    },
  },
);
