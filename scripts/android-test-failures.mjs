// Turns JUnit XML into GitHub annotations.
//
// A failing Gradle task says which task failed and nothing else, and a CI log is
// not readable from every place a maintainer works. The exception a test wrote
// down is the useful part, so each line of it becomes an annotation.
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';

const directory = process.argv[2] ?? 'platforms/android/app/build/test-results/testDebugUnitTest';
const unescape = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

let files = [];
try {
  files = readdirSync(directory).filter((name) => name.endsWith('.xml'));
} catch {
  console.log(`::warning::No test reports in ${directory}.`);
  process.exit(0);
}

let printed = 0;
for (const file of files) {
  const xml = readFileSync(`${directory}/${file}`, 'utf8');
  for (const match of xml.matchAll(/<(failure|error)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    for (const line of unescape(match[2]).split('\n')) {
      const text = line.trim();
      if (!text || printed++ > 60) continue;
      console.log(`::error::${text.slice(0, 900).replaceAll('%', '%25')}`);
    }
  }
}
if (!printed) console.log('::error::A native test failed without writing an exception.');
