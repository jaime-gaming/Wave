import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const e2e = readFileSync(new URL('../tests/quality-021.spec.ts', import.meta.url), 'utf8');
const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

const marker = 'Wave 3.0 — all-screen right-edge and Remix layout.';
const appended = css.indexOf(marker);
const oldMedia = css.indexOf('/* #15 All-Resolution Responsive Web Support');

test('the final cascade removes the obsolete right-hand workspace reservation', () => {
  assert.ok(oldMedia >= 0, 'the old wide-screen media block is missing');
  assert.ok(appended > oldMedia, 'the all-screen block must follow the old cap');
  const oldCap = css.indexOf('max-width: 1680px', oldMedia);
  assert.ok(oldCap > 0 && oldCap < appended, 'the old 1680px cap must precede the fix');

  const start = css.indexOf('.workspace {', appended);
  const end = css.indexOf('}', start);
  const block = css.slice(start, end + 1);
  assert.match(block, /max-width:\s*none/);
  assert.match(block, /margin-right:\s*var\(--shell-inset-inline\)/);
  assert.match(block, /margin-left:\s*calc\(var\(--rail-width\) \+ var\(--shell-inset-inline\)\)/);

  // No rule after the fix may restore the centred cap or an automatic right margin.
  const tail = css.slice(end + 1);
  assert.doesNotMatch(tail, /margin-right:\s*auto/);
  assert.doesNotMatch(tail, /max-width:\s*1680px/);
  assert.doesNotMatch(tail, /max-width:\s*880px/);
});

test('Remix owns the whole content width and adapts type, cards and gaps', () => {
  const tail = css.slice(appended);
  const remix = tail.match(/\.remix-page \{[^}]*\}/)?.[0] ?? '';
  assert.match(remix, /width:\s*100%/);
  assert.match(remix, /max-width:\s*none/);
  assert.match(remix, /container-type:\s*inline-size/);
  // The same class also sits on <main class="workspace remix-page">; without
  // this override, 100% viewport width plus the rail margin overflows right.
  assert.match(tail, /\.workspace\.remix-page\s*\{[^}]*width:\s*auto/);
  assert.match(tail, /\.remix-week-select \{[^}]*max-width:\s*none/);
  assert.match(tail, /\.remix-highlights \{[^}]*repeat\(auto-fit/);
  assert.match(tail, /--remix-gap:\s*clamp\(/);
  assert.match(tail, /--remix-card-gap:\s*clamp\(/);
  assert.match(tail, /\.remix-highlight > strong \{[^}]*font-size:\s*clamp\(/);
  assert.match(tail, /\.remix-subtitle \{[^}]*font-size:\s*clamp\(/);
  assert.match(tail, /\.remix-feature-image \{[^}]*width:\s*min\(100%,\s*clamp\(/);
  for (const query of [
    'max-width: 700px',
    'min-width: 701px) and (max-width: 1000px',
    'max-width: 360px',
    'max-height: 500px',
    'orientation: landscape',
    'min-width: 1680px',
    'min-width: 2200px',
    'min-width: 3200px',
  ]) {
    assert.ok(tail.includes(query), `missing responsive query ${query}`);
  }
});

test('the browser contract measures the right edge at ten screen sizes', () => {
  for (const [width, height] of [
    [320, 640],
    [360, 800],
    [667, 375],
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ]) {
    assert.ok(
      e2e.includes(`width: ${width}, height: ${height}`),
      `missing viewport ${width}x${height}`,
    );
  }
  assert.match(e2e, /documentElement\.scrollWidth/);
  assert.match(e2e, /remix-page/);
  assert.match(e2e, /library-surface/);
  assert.match(pkg, /tests\/quality-021\.spec\.ts/);
  assert.match(ci, /npm run test:smoke/);
  assert.match(ci, /continue-on-error/);
});
