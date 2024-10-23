import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      globals: true,
      coverage: { enabled: false },
      setupFiles: ['./tests/util/setupVitest.ts'],
    },
  }),
);

export default vitestConfig;
