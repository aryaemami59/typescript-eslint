import { defineConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = defineConfig({
  ...vitestBaseConfig,

  test: {
    include: ['./tests/lib/.*\\.test\\.ts$'],
    exclude: process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE
      ? ['/node_modules/', 'project-true']
      : [],
  },
});

export default vitestConfig;
