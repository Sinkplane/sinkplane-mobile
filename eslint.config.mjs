// Gate config, adapted from the node-nest-ts starter (see README "Quality gates"). Protected: see .gates-protected.
import eslint from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import { importX } from 'eslint-plugin-import-x';
import jest from 'eslint-plugin-jest';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Size and complexity rules may not be disabled inline (eslint-comments/no-restricted-disable).
const GATED_RULES = [
  'complexity',
  'max-depth',
  'max-lines',
  'max-lines-per-function',
  'max-nested-callbacks',
  '@typescript-eslint/max-params',
  'sonarjs/cognitive-complexity',
];

const TEST_FILES = ['src/**/*.test.{ts,tsx}', '__tests__/**/*.{ts,tsx}', 'jest/**/*.{ts,tsx}'];

export default defineConfig(
  globalIgnores([
    'node_modules/',
    'dist/',
    'coverage/',
    'reports/',
    '.stryker-tmp/',
    '.expo/',
    'ios/',
    'android/',
    'modules/*/android/',
    'modules/*/ios/',
    '.cursor/',
    '.claude/',
    'expo-env.d.ts',
  ]),

  {
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
  },

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  comments.recommended,
  sonarjs.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, __DEV__: 'readonly' },
    },
    plugins: { 'import-x': importX },
    rules: {
      complexity: ['error', 6],
      'max-depth': ['error', 3],
      'max-params': 'off',
      '@typescript-eslint/max-params': ['error', { max: 3 }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 3],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-nested-ternary': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-warning-comments': [
        'error',
        {
          terms: ['istanbul ignore', 'v8 ignore', 'c8 ignore', 'stryker disable'],
          location: 'anywhere',
        },
      ],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        // React components (and component-valued consts) are PascalCase.
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        {
          selector: 'variable',
          modifiers: ['const'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        { selector: 'objectLiteralProperty', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        {
          selector: ['objectLiteralProperty', 'typeProperty'],
          modifiers: ['requiresQuotes'],
          format: null,
        },
      ],
      // Never import the @sinkplane/shared barrel or its TV-only connection/* subpath (pulls in native
      // modules this app does not ship). src/shared.ts is the one allowed importer (arch rule
      // `shared-package-through-barrel`).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@sinkplane/shared', message: 'Import from @/shared (src/shared.ts) instead.' },
          ],
          patterns: [
            {
              group: ['@sinkplane/shared/connection', '@sinkplane/shared/connection/*'],
              message: 'TV-only.',
            },
          ],
        },
      ],
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', ...GATED_RULES],
      'import-x/no-default-export': 'error',
      'import-x/no-duplicates': 'error',
    },
  },

  // Expo Router discovers routes and layouts through their default export.
  {
    files: ['src/app/**/*.tsx'],
    rules: { 'import-x/no-default-export': 'off' },
  },

  {
    files: TEST_FILES,
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      '@typescript-eslint/no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
    },
  },

  {
    files: ['*.mjs', '*.cjs', '*.js', 'scripts/**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
    rules: {
      'import-x/no-default-export': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['*.cjs', '*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },

  prettier,
);
