import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import eslintPlugin from '../src/index.js';
import rules from '../src/rules/index.js';
import { ROOT_DIR } from './test-utils/test-utils.js';

describe('eslint-plugin ("./src/index.ts")', async () => {
  const CONFIGS_DIR = path.join(ROOT_DIR, 'src', 'configs');

  const ruleKeys = Object.keys(rules);
  const eslintPluginRuleKeys = Object.keys(eslintPlugin.rules);

  const eslintrcConfigs = (
    await fs.readdir(path.join(CONFIGS_DIR, 'eslintrc'), {
      encoding: 'utf-8',
    })
  )
    .filter(file => ['.json', '.ts'].includes(path.extname(file).toLowerCase()))
    .map(file => path.basename(file, path.extname(file)));

  const flatConfigs = (
    await fs.readdir(path.join(CONFIGS_DIR, 'flat'), {
      encoding: 'utf-8',
    })
  )
    .filter(file => ['.json', '.ts'].includes(path.extname(file).toLowerCase()))
    .map(file => path.basename(file, path.extname(file)))
    .map(file => `flat/${file}`);

  const eslintPluginConfigKeys = Object.keys(eslintPlugin.configs).sort();

  it('exports all available rules', () => {
    expect(ruleKeys).toStrictEqual(eslintPluginRuleKeys);
  });

  it('exports all available configs', () => {
    expect(
      [
        ...flatConfigs,
        ...eslintrcConfigs,
        // This config is deprecated and eventually will be removed
        'recommended-requiring-type-checking',
      ].sort(),
    ).toStrictEqual(eslintPluginConfigKeys);
  });
});
