import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const native = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8');

test('releases validate built source and required smoke checks but publish no web bundle', () => {
  assert.match(release, /npm run release:check/);
  assert.match(release, /npm run test:smoke/);
  assert.match(release, /npm test && npm run build/);
  assert.match(release, /needs: validate/);
  assert.match(release, /uses: \.\/\.github\/workflows\/native.yml/);
  assert.doesNotMatch(release, /package_release.py --output|gh release upload|wave-web-release/);
});
test('native release builds check out the selected tag and attach only native packages', () => {
  assert.match(native, /workflow_call:/);
  assert.equal((native.match(/ref: \$\{\{ inputs.tag \|\| github.sha \}\}/g) ?? []).length, 2);
  assert.match(native, /gh release upload.*Wave-Android-test-only.apk/);
  assert.match(native, /gh release upload.*Wave-Windows-x64-unsigned.zip/);
  assert.equal((native.match(/if: inputs.tag != ''/g) ?? []).length, 2);
});

test('native screenshot publishing handles detached checkouts and does not publish failed or stale captures', () => {
  const script = readFileSync(new URL('./publish-native-screenshots.sh', import.meta.url), 'utf8');
  assert.equal((native.match(/run: bash scripts\/publish-native-screenshots.sh/g) ?? []).length, 2);
  assert.equal((native.match(/if: github.event_name == 'push' && success\(\)/g) ?? []).length, 2);
  assert.match(script, /git push --quiet origin "HEAD:refs\/heads\/\$GITHUB_REF_NAME"/);
  assert.match(script, /git diff --quiet "\$GITHUB_SHA" FETCH_HEAD/);
  assert.match(script, /git rebase --abort/);
  assert.doesNotMatch(script, /--force|\|\| true/);
});
