import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ROOT_DIR, rulesEntriesList } from '../test-utils/test-utils.js';

describe('./src/rules/index.ts', async () => {
  const ruleNames = rulesEntriesList
    .map(([ruleName]) => `${ruleName}.ts`)
    .sort();

  const files = (
    await fs.readdir(path.join(ROOT_DIR, 'src', 'rules'), {
      encoding: 'utf-8',
    })
  ).filter(file => file !== 'index.ts' && file.endsWith('.ts'));

  it('imports all available rule modules', () => {
    expect(ruleNames).toStrictEqual(files);
  });
});
