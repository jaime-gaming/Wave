import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
