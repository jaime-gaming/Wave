import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

/** The version shown in the interface always comes from package.json. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: { __WAVE_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  base: process.env.WAVE_BASE_PATH ?? '/',
  server: {
    host: '0.0.0.0',
    watch: {
      ignored: ['**/.cache/**', '**/playwright-report/**', '**/test-results/**', '**/platforms/**'],
    },
    allowedHosts: ['.e2b.app'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
