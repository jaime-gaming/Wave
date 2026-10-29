// Turns a Playwright run into GitHub annotations.
//
// The browser suite is the long pole and its report lives in an artifact, which
// is not reachable from a phone or from the pull request page. The failing titles
// are the useful part, so they are lifted out of the JSON report and put where a
// reader already is, with a per-file count in the step summary.
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';

const file = process.argv[2] ?? 'test-results/results.json';
let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  console.log(`::warning::No Playwright report at ${file}; nothing to annotate.`);
  process.exit(0);
}

const failures = [];
let passed = 0;
let skipped = 0;

function walk(suite, trail) {
  const path = [...trail, suite.title].filter(Boolean).join(' › ');
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const status = test.results?.at(-1)?.status ?? 'unknown';
      if (status === 'passed') passed++;
      else if (status === 'skipped') skipped++;
      else {
        const error =
          test.results?.at(-1)?.error?.message ?? test.results?.at(-1)?.errors?.[0]?.message ?? '';
        failures.push({ title: [path, spec.title].filter(Boolean).join(' › '), error });
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child, [path]);
  if (suite.title && !suite.suites && !suite.specs) skipped++;
}

for (const suite of report.suites ?? []) walk(suite, []);

for (const failure of failures) {
  const first = failure.error.split('\n')[0].replaceAll('%', '%25').slice(0, 400);
  console.log(`::error title=${failure.title.replaceAll('%', '%25')}::${first}`);
}

const lines = [
  `Playwright: ${passed} passed, ${failures.length} failed, ${skipped} skipped.`,
  '',
  ...failures.map((failure) => `- ${failure.title}`),
];
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log(lines.join('\n'));
