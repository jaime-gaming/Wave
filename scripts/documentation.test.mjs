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
  'docs/SCREENSHOTS.md',
  'docs/WHY_WAVE.md',
  'PRIVACY.md',
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

test('both introductions show labelled, real screenshots for every platform', () => {
  const screenshots = {
    web: ['home-desktop.png', 'home-mobile.png', 'now-playing-desktop.png', 'remix-desktop.png'],
    windows: ['windows-home-dark.png', 'windows-search.png'],
    android: ['android-home.png', 'android-library.png', 'android-remix.png'],
    ios: ['ios-home.png', 'ios-library.png', 'ios-now-playing.png'],
  };
  for (const document of ['README.md', 'docs/README.es.md']) {
    const text = read(document);
    for (const [platform, images] of Object.entries(screenshots)) {
      for (const image of images) {
        assert.ok(text.includes(image), `${document}: missing ${platform} screenshot ${image}`);
        const data = readFileSync(path.join(root, 'docs/media', image));
        assert.deepEqual(data.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        assert.ok(
          data.readUInt32BE(16) >= 300 && data.readUInt32BE(20) >= 300,
          `${image}: unexpectedly small`,
        );
      }
    }
    for (const tag of text.matchAll(/<img\s+[^>]*>/g)) {
      assert.match(tag[0], /alt="[^"]+"/, `${document}: image needs descriptive alt text`);
    }
    assert.match(text, /Web\s*\|\s*Windows\s*\|\s*Android\s*\|\s*iOS/);
  }
});

test('online privacy notices describe separate catalogue consent and iOS automatic lyrics', () => {
  const privacy = read('PRIVACY.md');
  assert.match(privacy, /Compare more catalogues/);
  assert.match(privacy, /MusicBrainz and\s+Deezer/);
  assert.match(privacy, /Verify artist\s+and title across the library/);
  assert.match(privacy, /iOS automatic-lyrics switch is off by default/);
  assert.doesNotMatch(
    privacy,
    /MusicBrainz and Deezer are not used by the automatic completion switch/,
  );
  const ios = read('platforms/ios/README.md');
  assert.match(
    ios,
    /Automatic search for the current song\s+is separately enabled in Settings and off by default/,
  );
  assert.match(read('docs/PLATFORMS.md'), /Optional manual or automatic LRCLIB/);
});

test('local documentation section links resolve to a heading', () => {
  const slug = (heading) =>
    heading
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
  for (const document of documents) {
    const text = read(document);
    const targets = [
      ...[...text.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1]),
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
    ];
    for (const target of targets) {
      if (/^(?:https?:|mailto:)/i.test(target) || !target.includes('#')) continue;
      const [file, fragment] = target.split('#');
      if (!fragment || (file && !file.endsWith('.md'))) continue;
      const destination = file
        ? path.resolve(root, path.dirname(document), decodeURIComponent(file))
        : path.join(root, document);
      const headings = [...readFileSync(destination, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(
        (match) => slug(match[1]),
      );
      assert.ok(
        headings.includes(decodeURIComponent(fragment)),
        `${document}: missing section ${target}`,
      );
    }
  }
});
