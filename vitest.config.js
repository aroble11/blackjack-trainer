import { defineConfig } from 'vitest/config';

// Engine tests are pure logic, so they run in the fast Node environment.
// Kept separate from vite.config.js so the build-only PWA plugin (added in
// Step 6) never loads during the test run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
