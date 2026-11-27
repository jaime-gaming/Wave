import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { buildI18n } from './build-i18n.mjs';

export function checkRelease(root, tag) {
  const read = (name) => readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Expected a stable semantic version');
  assert.equal(tag ?? `v${pkg.version}`, `v${pkg.version}`, 'Tag and package version differ');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, pkg.version, 'Lockfile version differs');
  assert.equal(lock.packages?.['']?.version, pkg.version, 'Lockfile root version differs');

  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    const installed = /\/-(\d+\.\d+\.\d+[^/]*)\.tgz$/.exec(entry?.resolved ?? '')?.[1];
    if (installed)
      assert.equal(entry.version, installed, `Lockfile entry ${key} points at ${installed}`);
  }
  const windows = read('platforms/windows/Wave.Windows/Wave.Windows.csproj');
  assert.equal(
    windows.match(/<Version>([^<]+)<\/Version>/)?.[1],
    pkg.version,
    'Windows version differs',
  );
  for (const field of ['AssemblyVersion', 'FileVersion']) {
    assert.equal(
      windows.match(new RegExp(`<${field}>([^<]+)</${field}>`))?.[1],
      `${pkg.version}.0`,
      `${field} differs`,
    );
  }
  const android = read('platforms/android/app/build.gradle.kts');
  assert.equal(
    android.match(/versionName\s*=\s*"([^"]+)"/)?.[1],
    pkg.version,
    'Android version differs',
  );
  assert.ok(
    Number(android.match(/versionCode\s*=\s*(\d+)/)?.[1]) >= 1,
    'Android version code is missing',
  );

  const labels = [
    [
      'platforms/windows/Wave.Windows/MainWindow.Settings.cs',
      /Wave (\d+\.\d+\.\d+)/,
      'Windows settings version',
    ],
    [
      'platforms/windows/Wave.Windows/LyricsClient.cs',
      /Wave\/(\d+\.\d+\.\d+)/,
      'Windows user agent',
    ],
    [
      'platforms/android/app/src/main/java/io/github/jaimegaming/wave/LyricsClient.kt',
      /Wave\/(\d+\.\d+\.\d+)/,
      'Android user agent',
    ],
  ];
  for (const [file, pattern, label] of labels) {
    assert.equal(read(file).match(pattern)?.[1], pkg.version, `${label} differs`);
  }
  const notes = read(`docs/RELEASE_NOTES_${pkg.version}.md`);
  assert.ok(notes.startsWith(`# Wave ${pkg.version}\n`), 'Release notes version differs');

  const dated = new RegExp(
    `^## ${pkg.version.replaceAll('.', '\\.')} — \\d{1,2} [A-Z][a-z]+ \\d{4}$`,
    'm',
  );
  assert.ok(dated.test(read('CHANGELOG.md')), `Changelog has no dated ${pkg.version} section`);

  const { stale } = buildI18n(root, { check: true });
  assert.deepEqual(
    stale,
    [],
    'Language tables are stale; run `npm run build:i18n` and commit the result',
  );
  return { version: pkg.version, tag: `v${pkg.version}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = checkRelease(root, process.argv[2]);
  console.log(`Release metadata verified: ${result.tag} (web, Android, Windows and notes)`);
  console.log('This check does not create tags, merge branches or publish packages.');
}
