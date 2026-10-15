import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/dist/**',
      'learning/**',
      '.superpowers/**',
      'apps/api/worker-configuration.d.ts',
      'apps/mobile/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/mobile/expo-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@futureflow/math-engine',
              message:
                'Import @futureflow/math-engine/generators: the package root pulls in the CAS (1.2 MB gzipped, ~700 ms first call), far beyond the free Worker CPU limit.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/lib/math/engine.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@futureflow/math-engine',
              message:
                'The CAS enters the phone through one module only: import from @/lib/math/engine (ADR 0013).',
            },
          ],
        },
      ],
    },
  },
]);
