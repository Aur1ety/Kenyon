import { defineConfig } from 'vitest/config';

// Engine tests run in Node (no browser, no DOM): they read public/data/*.json from disk.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'threads',
  },
});
