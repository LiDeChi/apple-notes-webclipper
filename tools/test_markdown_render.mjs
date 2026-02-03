import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.enable(['table', 'strikethrough']);

const input = [
  '# Title',
  '',
  '- Item 1',
  '- Item 2',
  '',
  '> Quote',
  '',
  '```js',
  'console.log("ok")',
  '```',
  '',
  '| A | B |',
  '| - | - |',
  '| 1 | 2 |'
].join('\n');

const html = md.render(input);
assert.match(html, /<h1>Title<\/h1>/);
assert.match(html, /<ul>/);
assert.match(html, /<blockquote>/);
assert.match(html, /<code class="language-js">/);
assert.match(html, /<table>/);

console.log('ok');
