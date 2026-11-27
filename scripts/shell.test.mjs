import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the offline shell is versioned by build and keeps HTML with its own assets', () => {
  const sw = read('public/sw.js');
  assert.equal(
    (sw.match(/__WAVE_BUILD_ID__/g) ?? []).length,
    1,
    'exactly one build id placeholder, in the cache constant (not in a comment)',
  );
  assert.match(sw, /const PREFIX = 'wave-shell-'/);
  assert.match(sw, /key\.startsWith\(PREFIX\) && key !== CACHE/, 'old builds must be deleted');
  assert.match(sw, /\{ cache: 'reload' \}/, 'the shell document must bypass the HTTP cache');
  assert.match(sw, /shellAssets\(html\)/, 'hashed assets of the served document are precached');
  assert.match(sw, /request\.mode === 'navigate'/, 'navigation is fresh when online');
  assert.match(sw, /WAVE_SHELL_STALE/, 'a missing hashed bundle notifies the tab');
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.doesNotMatch(
    sw,
    /const CACHE = 'wave-shell-v1'/,
    'a fixed cache name is the original bug',
  );
});

test('the boot watchdog repairs a stale shell once, by itself', () => {
  const boot = read('public/boot.js');
  assert.match(boot, /getRegistrations/, 'unregisters the broken worker');
  assert.match(boot, /wave-shell-/, 'clears shell caches');
  assert.match(boot, /cache: 'reload'/, 'revalidates the document');
  assert.match(boot, /sessionStorage/, 'the recovery happens only once per tab session');
  assert.match(boot, /location\.reload\(\)/);
  assert.match(boot, /WAVE_SHELL_STALE/, 'listens for the worker telling it an asset is gone');
  assert.match(boot, /__waveBooted/, 'knows when the app did start');
  assert.match(boot, /wave-boot-splash/, 'shows a wordmark instead of a black rectangle');
});

test('a stale shell repairs itself in a simulated browser without a hard refresh', async () => {
  const state = { now: 0, ticker: null, timeouts: [], messageHandler: null };
  const storage = new Map();
  const sessionWrites = [];
  const cacheDeletes = [];
  const fetchCalls = [];
  let unregisterCount = 0;
  let reloadCount = 0;

  class FakeRequest {
    constructor(url, init) {
      this.url = String(url);
      this.cache = init?.cache;
    }
  }
  class FakeDate extends Date {}
  FakeDate.now = () => state.now;

  const makeElement = () => ({
    id: '',
    style: {},
    setAttribute() {},
    appendChild() {},
    remove() {},
  });
  const elements = new Map();
  const root = { childElementCount: 0 };
  elements.set('root', root);
  const body = {
    appendChild(node) {
      if (node.id) elements.set(node.id, node);
    },
  };
  const document = {
    currentScript: { src: 'https://wave.test/boot.js' },
    body,
    getElementById: (id) => elements.get(id) ?? null,
    createElement: makeElement,
  };
  const location = { href: 'https://wave.test/', reload: () => {} };
  const window = {
    __waveBooted: false,
    location: {
      reload: () => {
        reloadCount += 1;
      },
    },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
        sessionWrites.push([key, value]);
      },
    },
    caches: {
      keys: async () => ['wave-shell-old', 'unrelated-cache'],
      delete: async (key) => {
        cacheDeletes.push(key);
        return true;
      },
    },
    fetch: (request) => {
      fetchCalls.push(request);
      return Promise.resolve({ ok: true });
    },
  };
  const navigator = {
    serviceWorker: {
      controller: {},
      getRegistrations: async () => [
        {
          unregister: async () => {
            unregisterCount += 1;
          },
        },
      ],
      addEventListener: (_type, handler) => {
        state.messageHandler = handler;
      },
    },
  };
  const sandbox = {
    document,
    window,
    navigator,
    location,
    fetch: window.fetch,
    Request: FakeRequest,
    URL,
    Date: FakeDate,
    Promise,
    setTimeout: (callback) => {
      state.timeouts.push(callback);
      return state.timeouts.length;
    },
    clearTimeout() {},
    setInterval: (callback) => {
      state.ticker = callback;
      return 1;
    },
    clearInterval() {},
  };
  runInNewContext(read('public/boot.js'), sandbox, { filename: 'boot.js' });

  state.now = 1200;
  state.ticker();
  assert.ok(document.getElementById('wave-boot-splash'), 'the splash should be shown');

  assert.equal(typeof state.messageHandler, 'function');
  state.messageHandler({ data: { type: 'WAVE_SHELL_STALE' } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(unregisterCount, 1, 'the broken worker must be unregistered');
  assert.deepEqual(cacheDeletes, ['wave-shell-old'], 'only Wave shell caches may be removed');
  assert.deepEqual(sessionWrites, [['wave-shell-recovered', '1']]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].cache, 'reload');
  assert.equal(reloadCount, 1, 'the page must recover once, by itself');

  for (const callback of state.timeouts) callback();
  state.messageHandler({ data: { type: 'WAVE_SHELL_STALE' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reloadCount, 1);
});

test('the document loads the watchdog before the bundle and revalidates the shell', () => {
  const html = read('index.html');
  assert.match(html, /<script defer src="%BASE_URL%boot\.js"><\/script>/);
  const scriptAt = html.indexOf('boot.js');
  const bundleAt = html.indexOf('/src/main.tsx');
  assert.ok(scriptAt > 0 && scriptAt < bundleAt, 'boot.js must load before the app bundle');
  const headers = read('public/_headers');
  for (const path of ['/index.html', '/sw.js', '/boot.js', '/manifest.webmanifest'])
    assert.match(
      headers,
      new RegExp(
        `${path.replaceAll('/', '\\/')}\\n  Cache-Control: public, max-age=0, must-revalidate`,
      ),
    );
  const offline = read('src/ui/offline.ts');
  assert.match(offline, /updateViaCache: 'none'/);
  assert.match(offline, /registration\.update\(\)/);
});

test('the build replaces the cache placeholder with a hash of the built document', () => {
  const config = read('vite.config.ts');
  assert.match(config, /name: 'wave-versioned-offline-shell'/);
  assert.match(config, /apply: 'build'/);
  assert.match(config, /createHash\('sha256'\)/);
  assert.match(config, /replaceAll\('__WAVE_BUILD_ID__', buildId\)/);
  assert.match(config, /lost its __WAVE_BUILD_ID__ placeholder/);
  assert.match(config, /still has an unversioned cache name/);
});

test('a successful documentation capture removes stale failure diagnostics', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /rm -f artifacts\/capture\/failed/);
  assert.match(workflow, /touch artifacts\/capture\/failed/);
  assert.match(workflow, /git add -f artifacts\/capture\/capture\.log artifacts\/capture\/failed/);
  assert.match(
    workflow,
    /git rm -f --ignore-unmatch -- artifacts\/capture\/capture\.log artifacts\/capture\/failed/,
  );
});

test('privacy has its own offline cache entry and cannot replace the app shell', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /'\.\/privacy\.html'/);
  const privacyBranch = sw.slice(
    sw.indexOf("if (request.mode === 'navigate' && url.pathname.endsWith('/privacy.html'))"),
    sw.indexOf(
      "if (request.mode === 'navigate')",
      sw.indexOf("url.pathname.endsWith('/privacy.html')"),
    ),
  );
  assert.match(privacyBranch, /cache\.put\(request, response\.clone\(\)\)/);
  assert.doesNotMatch(privacyBranch, /cache\.put\(FALLBACK/);
  assert.match(sw, /ignoreVary: url\.pathname\.includes\('\/assets\/'\)/);
});
