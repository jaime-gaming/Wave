import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const native = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8');

test('releases validate the source but do not build, package or upload a web bundle', () => {
  assert.match(release, /npm run release:check/);
  assert.match(release, /needs: validate/);
  assert.match(release, /uses: \.\/\.github\/workflows\/native.yml/);
  assert.doesNotMatch(
    release,
    /npm run build|package_release.py --output|gh release upload|wave-web-release/,
  );
});
test('native release builds check out the selected tag and attach only native packages', () => {
  assert.match(native, /workflow_call:/);
  assert.equal((native.match(/ref: \$\{\{ inputs.tag \|\| github.sha \}\}/g) ?? []).length, 2);
  assert.match(native, /gh release upload.*Wave-Android-test-only.apk/);
  assert.match(native, /gh release upload.*Wave-Windows-x64-unsigned.zip/);
  assert.equal((native.match(/if: inputs.tag != ''/g) ?? []).length, 2);
});
