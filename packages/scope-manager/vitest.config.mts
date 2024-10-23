import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      setupFiles: [
        ...vitestBaseConfig.test?.setupFiles!,
        './tests/test-utils/serializers/index.ts',
      ],
    },
  }),
);

export default vitestConfig;
