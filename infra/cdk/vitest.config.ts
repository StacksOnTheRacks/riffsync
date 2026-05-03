import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lambda/**/*.test.ts'],
    environment: 'node',
  },
});
