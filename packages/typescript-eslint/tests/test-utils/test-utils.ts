import rules from '@typescript-eslint/eslint-plugin/use-at-your-own-risk/rules';
import * as path from 'node:path';

export const ROOT_DIR = path.join(__dirname, '..', '..');

export const RULE_NAME_PREFIX = '@typescript-eslint/';

export const rulesEntriesList = Object.entries(rules);
