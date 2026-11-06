import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
const root = new URL('../', import.meta.url);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
test('app surfaces contain no model branding or decorative magic icons', () => {
  const surfaces = [
    'src/components',
    'public',
    'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui',
    'platforms/windows/Wave.Windows',
  ];
  const forbidden = /\b(?:OpenAI|ChatGPT|Claude|Gemini|AI-powered|Sparkles|WandSparkles)\b/i;
  for (const folder of surfaces)
    for (const file of files(fileURLToPath(new URL(folder, root)))) {
      if (
        !/\.(?:tsx|kt|cs|xaml|html|svg)$/.test(file) ||
        /[/\\](?:bin|obj|node_modules)[/\\]/.test(file)
      )
        continue;
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        forbidden,
        `Unexpected app surface in ${file}`,
      );
    }
});
test('the shipped client has no model-service runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  for (const name of Object.keys(pkg.dependencies))
    assert.doesNotMatch(name, /^(?:ai$|openai$|@ai-sdk\/|@anthropic-ai\/)/);
});
