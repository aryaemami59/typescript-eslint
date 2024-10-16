import type { ViteUserConfig } from 'vitest/config';

import { configDefaults } from 'vitest/config';

const baseVitestConfig = {
  test: {
    coverage: {
      enabled: process.env.NO_COVERAGE ? false : true,
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      reporter: [['lcov']],
    },
    globals: true,
    reporters: process.env.GITHUB_ACTIONS
      ? [['github-actions']]
      : configDefaults.reporters,
    watch: false,
  },
} as const satisfies ViteUserConfig;

// eslint-disable-next-line import/no-default-export
export default baseVitestConfig;
