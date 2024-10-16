import { defineConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = defineConfig({
  ...vitestBaseConfig,

  plugins: [
    {
      name: 'virtual-dependency',
      resolveId(id) {
        if (id === 'totally-real-dependency/package.json') {
          return JSON.stringify({
            version: '10.0.0',
          });
        }
      },
    },
  ],
});

export default vitestConfig;
