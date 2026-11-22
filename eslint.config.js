import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      eqeqeq: 'error',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'sonarjs/prefer-read-only-props': 'error',
      complexity: ['error', 10],
      'max-params': ['error', 4],
      // Code stays readable without wrapping: long strings, URLs and regex literals are exempt.
      'max-len': [
        'error',
        { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true, ignoreUrls: true },
      ],
    },
  },
  {
    // Tests, e2e and scripts talk to a local server on purpose: 127.0.0.1 and plain http are the point there.
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**', 'scripts/**'],
    rules: {
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      // Test doubles and fixtures are loosely typed on purpose; complexity limits are for production code.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      complexity: 'off',
      'max-params': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    // Playwright scripts also run small functions inside the page, where browser globals exist.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
);
