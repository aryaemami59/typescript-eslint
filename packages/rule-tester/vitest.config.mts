import { defaultExclude, defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    plugins: [
      {
        name: 'virtual-dependency-totally-real-dependency-package-json',
        resolveId(source) {
          if (
            source === 'totally-real-dependency/package.json' ||
            source === 'totally-real-dependency-prerelease/package.json'
          ) {
            return source;
          }
        },

        load(id) {
          if (id === 'totally-real-dependency/package.json') {
            return JSON.stringify(
              {
                name: 'totally-real-dependency',
                exports: {
                  './package.json': './package.json',
                },
                version: '10.0.0',
              },
              null,
              2,
            );
          }

          if (id === 'totally-real-dependency-prerelease/package.json') {
            return JSON.stringify(
              {
                name: 'totally-real-dependency-prerelease',
                exports: {
                  './package.json': './package.json',
                },
                version: '10.0.0-rc.1',
              },
              null,
              2,
            );
          }
        },
      },
    ],

    test: {
      dir: 'tests',
      name: packageJson.name,
      root: import.meta.dirname,

      reporters: [['verbose']],

      exclude: [...defaultExclude, './eslint-base/eslint-base.test.js'],
    },
  }),
);

export default vitestConfig;
