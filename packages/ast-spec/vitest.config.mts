import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  test: { setupFiles: ['./tests/util/setupVitest.ts'] },
});

export default vitestConfig;
