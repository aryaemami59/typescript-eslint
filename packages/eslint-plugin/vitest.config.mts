import * as path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { vitestBaseConfig } from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      dir: path.join(import.meta.dirname, 'tests'),
      isolate: process.env.CI ? true : false,
      name: packageJson.name,

      root: import.meta.dirname,
      sequence: { concurrent: process.env.CI ? false : true },
      testTimeout: 60_000,
    },
  }),
);

export default vitestConfig;
