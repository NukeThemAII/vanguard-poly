import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'openclaw/**/*.test.ts'],
    coverage: {
      enabled: false,
    },
  },
});
