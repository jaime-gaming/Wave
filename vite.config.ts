import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import playlistWorker from './src/worker/index.ts';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'wave-versioned-offline-shell',
      apply: 'build',
      writeBundle(options) {
        const outDir = options.dir ?? 'dist';
        const html = readFileSync(resolve(outDir, 'index.html'), 'utf8');
        const buildId = createHash('sha256')
          .update(version)
          .update('\0')
          .update(html)
          .digest('hex')
          .slice(0, 12);
        const swPath = resolve(outDir, 'sw.js');
        const sw = readFileSync(swPath, 'utf8');
        if (!sw.includes('__WAVE_BUILD_ID__'))
          throw new Error('public/sw.js lost its __WAVE_BUILD_ID__ placeholder.');
        const versioned = sw.replaceAll('__WAVE_BUILD_ID__', buildId);
        if (versioned.includes('__WAVE_BUILD_ID__'))
          throw new Error('The offline shell still has an unversioned cache name.');
        writeFileSync(swPath, versioned);
      },
    },
    {
      name: 'wave-local-playlist-api',
      configureServer(server) {
        server.middlewares.use('/api', async (req, res) => {
          let body = '';
          for await (const chunk of req) {
            body += String(chunk);
            if (body.length > 16_384) {
              res.statusCode = 413;
              res.end();
              return;
            }
          }
          const host = req.headers.host ?? 'localhost';
          const origin = req.headers.origin ?? '';

          const protocol = origin.startsWith('https:') ? 'https' : 'http';
          const apiPath = `/api${req.url ?? ''}`;
          const request = new Request(`${protocol}://${host}${apiPath}`, {
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
