import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(import.meta.dirname, '..');
const entry = path.join(repoRoot, 'extension', 'src', 'error_utils.ts');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-notes-webclipper-'));
const outFile = path.join(tmpDir, 'error_utils.mjs');

await build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  sourcemap: false,
  logLevel: 'silent'
});

const mod = await import(pathToFileURL(outFile).toString());

assert.equal(mod.isRestrictedUrl('chrome://extensions'), true);
assert.equal(mod.isRestrictedUrl('chrome-extension://abc/options.html'), true);
assert.equal(mod.isRestrictedUrl('https://example.com'), false);

const err = 'Could not establish connection. Receiving end does not exist.';

assert.match(mod.humanizeTabSendMessageError(err, 'chrome://extensions'), /不允许|不支持/);
assert.match(mod.humanizeTabSendMessageError(err, 'file:///tmp/a.html'), /file:\/\//);
assert.match(mod.humanizeTabSendMessageError(err, 'https://example.com'), /刷新|重载|重新/);

console.log('ok');

