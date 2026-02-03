import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const tempDir = mkdtempSync(join(tmpdir(), 'markdown-render-'));
const outfile = join(tempDir, 'markdown_render.js');

try {
  await build({
    entryPoints: ['extension/src/markdown_render.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile
  });

  const mod = await import(pathToFileURL(outfile).href);
  const html = mod.renderMarkdownToHtml('# Title');
  assert.match(html, /<h1>Title<\/h1>/);
  console.log('ok');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
