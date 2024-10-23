import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      exclude: process.env.TYPESCRIPT_ESLINT_PROJECT_SERVICE
        ? ['/node_modules/', 'project-true']
        : [],
    },
  }),
);

export default vitestConfig;
