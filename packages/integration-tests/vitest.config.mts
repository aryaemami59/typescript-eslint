import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      name: packageJson.name,
      root: import.meta.dirname,
      coverage: { enabled: false },

      globalSetup: ['./tools/pack-packages.ts'],
    },
  }),
);

export default vitestConfig;
