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
              name: '@mflow/math-engine',
              message:
                'Import @mflow/math-engine/generators: the package root pulls in the CAS (1.2 MB gzipped, ~700 ms first call), far beyond the free Worker CPU limit.',
            },
          ],
        },
      ],
    },
  },
]);
