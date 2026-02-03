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
  const html = mod.renderMarkdownToHtml(
    [
      '# Title',
      'line1',
      'line2',
      '',
      'bash',
      '',
      '```bash',
      'ls -la',
      '```',
      '',
      '> Quote'
    ].join('\n')
  );
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /line1<\s*br\s*\/?>\s*line2/);
  assert.match(html, /<pre style=\"/);
  assert.match(html, /<code class=\"language-bash\">/);
  assert.match(html, /<blockquote style=\"[^\"]+\">/);
  assert.doesNotMatch(html, /<p[^>]*>bash<\/p>/);
  console.log('ok');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
