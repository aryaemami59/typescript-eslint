import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      passWithNoTests: true,
    },
  }),
);

export default vitestConfig;
