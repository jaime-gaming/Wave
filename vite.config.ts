import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import playlistWorker from './src/worker';
import { readFileSync } from 'node:fs';

/** The version shown in the interface always comes from package.json. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'wave-local-playlist-api',
      configureServer(server) {
        server.middlewares.use('/api/import-playlist', async (req, res) => {
          let body = '';
          for await (const chunk of req) {
            body += String(chunk);
            if (body.length > 4096) {
              res.statusCode = 413;
              res.end();
              return;
            }
          }
          const host = req.headers.host ?? 'localhost';
          const origin = req.headers.origin ?? '';
          // Preview proxies terminate TLS; preserve the public origin, not localhost.
          const protocol = origin.startsWith('https:') ? 'https' : 'http';
          const request = new Request(`${protocol}://${host}/api/import-playlist`, {
            method: req.method,
            headers: { origin, 'content-type': String(req.headers['content-type'] ?? '') },
            ...(req.method === 'POST' ? { body } : {}),
          });
          const response = await playlistWorker.fetch(request, {
            ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        });
      },
    },
  ],
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
