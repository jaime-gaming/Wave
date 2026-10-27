import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/** Validate source metadata before any tag, merge or public release operation. */
export function checkRelease(root, tag) {
  const read = (name) => readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'Expected a stable semantic version');
  assert.equal(tag ?? `v${pkg.version}`, `v${pkg.version}`, 'Tag and package version differ');
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, pkg.version, 'Lockfile version differs');
  assert.equal(lock.packages?.['']?.version, pkg.version, 'Lockfile root version differs');
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
  // The places the listener actually reads the version from must not lag behind.
  const labels = [
    [
      'platforms/windows/Wave.Windows/MainWindow.xaml',
      /Text="(\d+\.\d+\.\d+)"/,
      'Windows sidebar version',
    ],
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
  return { version: pkg.version, tag: `v${pkg.version}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = checkRelease(root, process.argv[2]);
  console.log(`Release metadata verified: ${result.tag} (web, Android, Windows and notes)`);
  console.log('This check does not create tags, merge branches or publish packages.');
}
