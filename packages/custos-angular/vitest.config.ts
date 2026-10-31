import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@alimzen/source'] },
  test: { environment: 'jsdom', setupFiles: ['test/setup.ts'] },
});
