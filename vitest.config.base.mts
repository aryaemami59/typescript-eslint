import { defineConfig } from 'vitest/config';

const baseVitestConfig = defineConfig({
  test: {
    coverage: {
      reporter: ['lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      enabled: true,
    },
    setupFiles: ['console-fail-test/setup.mjs'],
    include: ['./tests/.+\\.test\\.ts$', './tests/.+\\.spec\\.ts$'],
    globals: true,
  },
});

export default baseVitestConfig;
