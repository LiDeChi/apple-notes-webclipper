# Markdown Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render Markdown to HTML in the extension so Apple Notes output preserves headings, lists, quotes, code blocks, and tables.

**Architecture:** The extension will use `markdown-it` to render Markdown to HTML and send it to the native host in a new `html` field. The native host will prefer `html` if present, replace image tokens with local file URLs, and write the HTML to Notes; otherwise it falls back to the legacy Markdown-to-HTML path.

**Tech Stack:** TypeScript (extension), Python (native host), `markdown-it`

---

### Task 1: Add markdown-it dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Write the failing test**

Create a lightweight Node script test to render a Markdown sample and assert key tags exist.

Create: `tools/test_markdown_render.mjs`
```js
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
  .use((mdIt) => mdIt.enable(['table', 'strikethrough']));

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
```

**Step 2: Run test to verify it fails**

Run: `node tools/test_markdown_render.mjs`
Expected: FAIL with module not found for `markdown-it`.

**Step 3: Write minimal implementation**

Add dependency:
```json
"markdown-it": "^14.1.0"
```

**Step 4: Run test to verify it passes**

Run: `node tools/test_markdown_render.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add package.json package-lock.json tools/test_markdown_render.mjs
git commit -m "feat: add markdown-it for html rendering"
```

---

### Task 2: Render Markdown to HTML in background and send `html`

**Files:**
- Modify: `extension/src/background.ts`
- Modify: `extension/src/types.ts` (or existing type definitions if present)

**Step 1: Write the failing test**

Add a minimal unit test script to ensure the background render function outputs HTML (if no test framework exists).

Create: `tools/test_render_html.mjs`
```js
import assert from 'node:assert/strict';
import { renderMarkdownToHtml } from '../extension/src/markdown_render.js';

const html = renderMarkdownToHtml('# Title');
assert.match(html, /<h1>Title<\/h1>/);
console.log('ok');
```

**Step 2: Run test to verify it fails**

Run: `node tools/test_render_html.mjs`
Expected: FAIL because module/file not found.

**Step 3: Write minimal implementation**

Create helper module `extension/src/markdown_render.ts`:
```ts
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false
});

md.enable(['table', 'strikethrough']);

export function renderMarkdownToHtml(markdown: string): string {
  return md.render(markdown || '');
}
```

Use it in `background.ts` when assembling the payload for `createNote` and `renderHtml` requests:
- Try rendering; on error, omit `html` field.

**Step 4: Run test to verify it passes**

Run: `node tools/test_render_html.mjs`
Expected: PASS and prints `ok`.

**Step 5: Commit**

```bash
git add extension/src/markdown_render.ts extension/src/background.ts tools/test_render_html.mjs
git commit -m "feat: render markdown to html in extension"
```

---

### Task 3: Native host prefers `html` and replaces image tokens in HTML

**Files:**
- Modify: `native_host/notes_bridge.py`

**Step 1: Write the failing test**

Create a small test script to ensure token replacement works on HTML input.

Create: `tools/test_native_host_html_replace.py`
```python
from native_host.notes_bridge import replace_image_tokens

html = '<h1>Title</h1>\n<p>[[[IMG:0]]]</p>'
images = [type('Img', (), { 'token': '0', 'url': 'https://example.com/a.png', 'alt': None })()]

out = replace_image_tokens(html, images, source_url=None)
assert 'IMG:0' not in out
```

**Step 2: Run test to verify it fails**

Run: `python3 tools/test_native_host_html_replace.py`
Expected: FAIL because `replace_image_tokens` expects markdown input but still works; adjust if needed.

**Step 3: Write minimal implementation**

- Add a new helper `render_note_html(payload, images, source_url)` that:
  - uses `payload.get('html')` if present; otherwise uses existing markdown->html path
  - runs `replace_image_tokens` on the HTML string
- Use this helper in both `create_note` and `render_html_preview`.

**Step 4: Run test to verify it passes**

Run: `python3 tools/test_native_host_html_replace.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add native_host/notes_bridge.py tools/test_native_host_html_replace.py
git commit -m "feat: native host prefer html payload"
```

---

### Task 4: Manual verification checklist

**Files:**
- None

**Step 1: Manual test**

- Use the debug payload from the issue and save once via the extension.
- Verify in Notes:
  - Heading rendered
  - List bullets
  - Quote block
  - Code block monospace
  - Table layout
  - Inline image rendered

**Step 2: Record result**

Add a short note to `README.md` with a one-line statement about Markdown rendering.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note markdown rendering support"
```
