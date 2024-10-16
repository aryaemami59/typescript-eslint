import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestBaseConfig } from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      dir: `${import.meta.dirname}/tests`,
      name: packageJson.name,
      root: import.meta.dirname,

      testTimeout: 60_000,
      isolate: process.env.CI ? true : false,
      sequence: { concurrent: process.env.CI ? false : true },
    },
  }),
);

export default vitestConfig;
