import { defineConfig } from 'vitest/config';
import vitestBaseConfig from '../../vitest.config.base.mjs';

const vitestConfig = defineConfig({
  ...vitestBaseConfig,

  test: {
    coverage: { enabled: false },
    globals: true,
    include: ['/tests/[^/]+.test.ts$'],
    root: import.meta.dirname,
    globalSetup: ['./tools/pack-packages'],

    // TODO(Brad Zacher) - for some reason if we run more than 1 test at a time
    //                     yarn will error saying the tarballs are corrupt on just
    //                     the first test.
    maxWorkers: 1,
  },
});

export default vitestConfig;
