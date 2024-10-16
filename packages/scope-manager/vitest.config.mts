import { defineConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = defineConfig({
  ...vitestBaseConfig,

  test: {
    setupFiles: [
      ...vitestBaseConfig.test?.setupFiles!,
      './tests/test-utils/serializers/index.ts',
    ],
  },
});

export default vitestConfig;
