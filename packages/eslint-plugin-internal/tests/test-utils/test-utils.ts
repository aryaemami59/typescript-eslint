import type { RuleTesterConfig } from '@typescript-eslint/rule-tester';

import * as path from 'node:path';

export const ROOT_DIR = path.join(__dirname, '..', '..');

export const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

export const DEFAULT_TESTER_CONFIG = {
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: FIXTURES_DIR,
    },
  },
} as const satisfies RuleTesterConfig;
