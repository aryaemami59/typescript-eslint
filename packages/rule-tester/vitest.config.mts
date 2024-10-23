import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    plugins: [
      {
        name: 'virtual-dependency-totally-real-dependency-package-json',
        async resolveId(source) {
          if (
            source === 'totally-real-dependency/package.json' ||
            source === 'totally-real-dependency-prerelease/package.json'
          ) {
            return source;
          }
        },

        async load(id) {
          if (id === `totally-real-dependency/package.json`) {
            return JSON.stringify({
              version: '10.0.0',
            });
          }

          if (id === 'totally-real-dependency-prerelease/package.json') {
            return JSON.stringify({
              version: '10.0.0-rc.1',
            });
          }
        },
      },
    ],
    test: {},
  }),
);

export default vitestConfig;
