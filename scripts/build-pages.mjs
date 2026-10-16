import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const root = fileURLToPath(new URL('../', import.meta.url));
// Relative URLs support both repository Pages (/Wave/) and custom domains.
execFileSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build', '--', '--base=./', '--assetsDir=site-assets'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
const docs = new URL('../docs/', import.meta.url);
mkdirSync(docs, { recursive: true });
// Only replace generated assets; the Markdown documentation remains intact.
rmSync(new URL('site-assets/', docs), { recursive: true, force: true });
cpSync(new URL('../dist/', import.meta.url), docs, { recursive: true });
writeFileSync(new URL('.nojekyll', docs), '');
console.log('Pages ready: commit docs, then select Deploy from a branch → main → /docs.');
