import type { ViteUserConfig } from 'vitest/config';

export const vitestBaseConfig = {
  test: {
    coverage: {
      enabled: true,
      extension: ['.ts', '.tsx', '.js', '.jsx'],
      include: ['src/**/*.[jt]s?(x)'],
      reporter: [
        ['lcov'],
        process.env.GITHUB_ACTIONS ? ['text-summary'] : ['none'],
      ],
    },
    globals: true,
    reporters: process.env.GITHUB_ACTIONS
      ? [['github-actions'], ['default']]
      : [['verbose']],
    setupFiles: ['console-fail-test/setup'],
    watch: false,
  },
} as const satisfies ViteUserConfig;
