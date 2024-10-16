import { defineConfig, mergeConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';
import packageJson from './package.json' with { type: 'json' };

const vitestConfig = mergeConfig(
  vitestBaseConfig,

  defineConfig({
    test: {
      dir: 'tests',
      name: packageJson.name,
      root: import.meta.dirname,

      deps: {
        optimizer: {
          ssr: { enabled: false },
        },
      },

      reporters: [['verbose']],

      coverage: { enabled: false },
      setupFiles: ['./tests/util/setupVitest.mts'],
    },
  }),
);

export default vitestConfig;
