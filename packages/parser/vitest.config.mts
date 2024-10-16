import { defineConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = defineConfig({
  ...vitestBaseConfig,

  test: {
    include: ['./tests/lib/.+\\.test\\.ts$'],
  },
});

export default vitestConfig;
