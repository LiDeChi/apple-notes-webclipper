import MarkdownIt from 'markdown-it';

const CODE_BLOCK_STYLE =
  'background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap;font-family:Menlo,Monaco,Consolas,"Courier New",monospace;font-size:12px;line-height:1.5;';
const INLINE_CODE_STYLE =
  'background:#f6f8fa;padding:0 4px;border-radius:4px;font-family:Menlo,Monaco,Consolas,"Courier New",monospace;font-size:0.95em;';
const BLOCKQUOTE_STYLE = 'border-left:4px solid #d0d7de;padding:4px 12px;margin:8px 0;color:#4b5563;';
const TABLE_STYLE = 'border-collapse:collapse;width:100%;';
const CELL_STYLE = 'border:1px solid #d0d7de;padding:6px 8px;';
const PARA_STYLE = 'margin:8px 0;line-height:1.6;';
const LIST_STYLE = 'margin:8px 0 8px 20px;';

const LANGUAGE_LABELS = new Set([
  'bash',
  'shell',
  'sh',
  'zsh',
  'json',
  'yaml',
  'yml',
  'js',
  'ts',
  'javascript',
  'typescript',
  'python',
  'py',
  'html',
  'css',
  'sql'
]);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

md.enable(['table', 'strikethrough']);

function appendStyle(token: { attrGet: (name: string) => string | null; attrSet: (name: string, value: string) => void }, style: string) {
  const existing = token.attrGet('style');
  token.attrSet('style', existing ? `${existing};${style}` : style);
}

const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || '').trim().split(/\s+/)[0];
  const langClass = info ? ` class="language-${md.utils.escapeHtml(info)}"` : '';
  const code = md.utils.escapeHtml(token.content);
  return `<pre style="${CODE_BLOCK_STYLE}"><code${langClass}>${code}</code></pre>\n`;
};

md.renderer.rules.code_inline = (tokens, idx) => {
  return `<code style="${INLINE_CODE_STYLE}">${md.utils.escapeHtml(tokens[idx].content)}</code>`;
};

const defaultBlockquoteOpen = md.renderer.rules.blockquote_open;
md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], BLOCKQUOTE_STYLE);
  return defaultBlockquoteOpen ? defaultBlockquoteOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultTableOpen = md.renderer.rules.table_open;
md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], TABLE_STYLE);
  return defaultTableOpen ? defaultTableOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultThOpen = md.renderer.rules.th_open;
md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], CELL_STYLE);
  return defaultThOpen ? defaultThOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultTdOpen = md.renderer.rules.td_open;
md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], CELL_STYLE);
  return defaultTdOpen ? defaultTdOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultParagraphOpen = md.renderer.rules.paragraph_open;
md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], PARA_STYLE);
  return defaultParagraphOpen ? defaultParagraphOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultUlOpen = md.renderer.rules.bullet_list_open;
md.renderer.rules.bullet_list_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], LIST_STYLE);
  return defaultUlOpen ? defaultUlOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

const defaultOlOpen = md.renderer.rules.ordered_list_open;
md.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
  appendStyle(tokens[idx], LIST_STYLE);
  return defaultOlOpen ? defaultOlOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

function normalizeMarkdown(markdown: string): string {
  const raw = (markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed === '[' || trimmed === ']') continue;

    if (LANGUAGE_LABELS.has(trimmed.toLowerCase())) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      if (j < lines.length && lines[j].trim().startsWith('```')) continue;
    }

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderMarkdownToHtml(markdown: string): string {
  return md.render(normalizeMarkdown(markdown));
}
