import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // §2.2 — prohibido `any`.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // §2.3 — el motor financiero es puro: ni React, ni almacenamiento, ni UI.
  {
    files: ['src/core/**/*.ts', 'src/finance/**/*.ts', 'src/domain/**/*.ts', 'src/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'react-router',
                'react-router/*',
                'recharts',
                'recharts/*',
              ],
              message:
                'src/core, src/domain, src/config y src/finance son puros: no pueden importar React ni librerías de UI (§2.3).',
            },
            {
              group: [
                '**/components/**',
                '**/features/**',
                '**/pages/**',
                '**/storage/**',
                '**/app/**',
              ],
              message:
                'El motor financiero no depende de la interfaz ni del almacenamiento. La dependencia va en el otro sentido (§2.3).',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['vite.config.ts', 'playwright.config.ts', 'eslint.config.js', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // La propia configuración de ESLint no forma parte de ningún tsconfig, así
  // que las reglas que necesitan tipos no pueden razonar sobre ella.
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
);
