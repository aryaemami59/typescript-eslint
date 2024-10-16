import type { RuleTesterConfig } from '@typescript-eslint/rule-tester';

import * as path from 'node:path';

import rules from '../../src/rules/index.js';

export const ROOT_DIR = path.join(__dirname, '..', '..');

export const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

export const UNSTRICT_FIXTURES_DIR = path.join(FIXTURES_DIR, 'unstrict');

export const RULE_NAME_PREFIX = '@typescript-eslint/';

export const rulesEntriesList = Object.entries(rules);

export const DEFAULT_TESTER_CONFIG = {
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: FIXTURES_DIR,
    },
  },
} as const satisfies RuleTesterConfig;
