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

  const xInput = [
    '# (19) someone on X: \"Very long title\" / X',
    '',
    'https://x.com/user/status/123',
    'Captured: 2026-02-03T00:00:00Z',
    '',
    '---',
    '',
    'Main content line',
    '',
    '[', '',
    '[[[IMG:0]]]',
    '',
    '](/user)',
    '',
    'https://x.com/user/status/123/analytics',
    '',
    '---',
    '',
    'Related content line'
  ].join('\n');

  const html2 = mod.renderMarkdownToHtml(xInput);
  assert.match(html2, /Main content line/);
  assert.match(html2, /\[\[\[IMG:0\]\]\]/);
  assert.doesNotMatch(html2, /Related content line/);
  assert.doesNotMatch(html2, /analytics/);
  assert.equal(html2.includes('](/user)'), false);

  const title = mod.deriveTitleFromMarkdown(xInput, '(19) someone on X: \"Very long title\" / X');
  assert.equal(title, 'Main content line');
  console.log('ok');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
