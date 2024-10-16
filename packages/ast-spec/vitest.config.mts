import { defineConfig } from 'vitest/config';

const vitestConfig = defineConfig({
  test: { setupFiles: ['./tests/util/setupJest.ts'] },
});

export default vitestConfig;
