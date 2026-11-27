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
        const result = test.results?.at(-1);
        const errors = (result?.errors ?? []).map((item) => item.message).filter(Boolean);
        failures.push({
          title: [path, spec.title].filter(Boolean).join(' › '),
          error: [error, ...errors].filter(Boolean).join('\n'),
        });
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child, [path]);
  if (suite.title && !suite.suites && !suite.specs) skipped++;
}

for (const suite of report.suites ?? []) walk(suite, []);

for (const failure of failures) {
  const detail = failure.error

    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .slice(0, 4000);
  console.log(`::error title=${failure.title.replaceAll('%', '%25')}::${detail}`);
}

const lines = [
  `Playwright: ${passed} passed, ${failures.length} failed, ${skipped} skipped.`,
  '',
  ...failures.map((failure) => `- ${failure.title}`),
];
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log(lines.join('\n'));
