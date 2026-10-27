import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkRelease } from './check-release.mjs';

function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'wave-release-'));
  const put = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  put('package.json', JSON.stringify({ version: '0.1.0' }));
  put(
    'package-lock.json',
    JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } }),
  );
  put(
    'platforms/windows/Wave.Windows/Wave.Windows.csproj',
    '<Project><Version>0.1.0</Version><AssemblyVersion>0.1.0.0</AssemblyVersion><FileVersion>0.1.0.0</FileVersion></Project>',
  );
  put('platforms/android/app/build.gradle.kts', 'versionName = "0.1.0"; versionCode = 1');
  put('platforms/windows/Wave.Windows/MainWindow.xaml', '<TextBlock Text="0.1.0"/>');
  put(
    'platforms/windows/Wave.Windows/MainWindow.Settings.cs',
    'Label("Wave 0.1.0 · 1 October 2026", 23);',
  );
  put(
    'platforms/windows/Wave.Windows/LyricsClient.cs',
    'UserAgent.ParseAdd("Wave/0.1.0 (https://github.com/jaime-gaming/Wave)");',
  );
  put(
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/LyricsClient.kt',
    'connection.setRequestProperty("User-Agent","Wave/0.1.0 (https://github.com/jaime-gaming/Wave)")',
  );
  put('docs/RELEASE_NOTES_0.1.0.md', '# Wave 0.1.0\n\nRelease notes.');
  try {
    run(root, put);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts matching platform versions and release notes', () =>
  fixture((root) => {
    assert.deepEqual(checkRelease(root, 'v0.1.0'), { version: '0.1.0', tag: 'v0.1.0' });
  }));
test('rejects the wrong release tag', () =>
  fixture((root) => {
    assert.throws(() => checkRelease(root, 'v1.0.0'), /Tag and package version differ/);
  }));
test('rejects a mismatched native version', () =>
  fixture((root, put) => {
    put('platforms/android/app/build.gradle.kts', 'versionName = "0.2.0"; versionCode = 2');
    assert.throws(() => checkRelease(root), /Android version differs/);
  }));
test('rejects a stale version shown in a platform interface', () =>
  fixture((root, put) => {
    put('platforms/windows/Wave.Windows/MainWindow.xaml', '<TextBlock Text="0.0.9"/>');
    assert.throws(() => checkRelease(root), /Windows sidebar version differs/);
  }));
test('rejects mismatched release notes', () =>
  fixture((root, put) => {
    put('docs/RELEASE_NOTES_0.1.0.md', '# Wave 0.2.0\n');
    assert.throws(() => checkRelease(root), /Release notes version differs/);
  }));

test('accepts Windows line endings in release notes', () =>
  fixture((root, put) => {
    put('docs/RELEASE_NOTES_0.1.0.md', '# Wave 0.1.0\r\n\r\nRelease notes.');
    assert.equal(checkRelease(root).tag, 'v0.1.0');
  }));
test('rejects a stale lockfile', () =>
  fixture((root, put) => {
    put(
      'package-lock.json',
      JSON.stringify({ version: '0.0.9', packages: { '': { version: '0.0.9' } } }),
    );
    assert.throws(() => checkRelease(root), /Lockfile version differs/);
  }));
