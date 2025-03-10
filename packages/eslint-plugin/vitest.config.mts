import * as path from 'node:path';
import { defineProject, mergeConfig } from 'vitest/config';

import { vitestBaseConfig } from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineProject({
    test: {
      dir: path.join(import.meta.dirname, 'tests'),
      name: packageJson.name.split('/').pop(),
      root: import.meta.dirname,
      testTimeout: 60_000,
    },
  }),
);

export default vitestConfig;
