import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documents = [
  'README.md',
  'docs/README.es.md',
  'docs/README.md',
  'SECURITY.md',
  '.github/CONTRIBUTING.md',
  'docs/GITHUB_METADATA.md',
  'docs/RELEASE_NOTES_0.3.0.md',
  'platforms/android/README.md',
  'platforms/windows/README.md',
  'platforms/ios/README.md',
];
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('presentation, community and security documents link to existing local files', () => {
  for (const file of documents) {
    const text = read(file);
    const targets = [
      ...[...text.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]),
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
    ];
    for (const target of targets) {
      if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
      const relative = decodeURIComponent(target.split('#')[0]);
      if (!relative) continue;
      assert.ok(
        existsSync(path.resolve(root, path.dirname(file), relative)),
        `${file}: missing ${target}`,
      );
    }
  }
});

test('presentation distinguishes development source, releases and independent native libraries', () => {
  for (const file of ['README.md', 'docs/README.es.md']) {
    const text = read(file);
    for (const screenshot of [
      'home-desktop.png',
      'home-mobile.png',
      'android-home.png',
      'ios-home.png',
      'windows-home-dark.png',
    ]) {
      assert.ok(text.includes(screenshot), `${file}: missing ${screenshot}`);
    }
    assert.match(text, /0\.3\.0/);
    assert.match(text, /0\.2\.2/);
    assert.match(text, /npm ci/);
    assert.match(text, /npm run dev/);
  }
  assert.match(read('LICENSE'), /^MIT License\n/);
  assert.match(read('CHANGELOG.md'), /^## Unreleased$/m);
  assert.match(read('SECURITY.md'), /mailto:jaimegamingpro@gmail\.com/);
});
