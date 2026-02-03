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
