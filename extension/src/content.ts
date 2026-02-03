import { Readability } from '@mozilla/readability';
import { extractTwitterMarkdown } from './twitter';
import { htmlToMarkdownWithImageTokens } from './markdown';

type ExtractRequest =
  | { type: 'extract'; mode: 'reader' }
  | { type: 'extract'; mode: 'selection' };

function getSelectionHtml(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const div = document.createElement('div');
  div.appendChild(range.cloneContents());
  return div.innerHTML.trim() || null;
}

function getReaderHtml(): { title: string; contentHtml: string } | null {
  try {
    const docClone = document.cloneNode(true) as Document;
    const reader = new Readability(docClone);
    const article = reader.parse();
    if (!article?.content) return null;
    return { title: article.title || document.title || 'Untitled', contentHtml: article.content };
  } catch {
    return null;
  }
}

function buildMarkdownEnvelope(title: string, sourceUrl: string, content: string): string {
  const capturedAt = new Date().toISOString();
  const header = [`# ${title}`, '', sourceUrl, `Captured: ${capturedAt}`, '', '---', ''].join('\n');
  return `${header}\n${content.trim()}`.trim();
}

const g = globalThis as any;
if (!g.__appleNotesWebClipperContentScriptLoaded) {
  g.__appleNotesWebClipperContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((msg: ExtractRequest, _sender, sendResponse) => {
    (async () => {
      if (msg?.type !== 'extract') {
        sendResponse({ ok: false, error: 'Unknown request' });
        return;
      }

      // X/Twitter special handling (tweet/thread/article pages).
      const twitterRes = extractTwitterMarkdown();
      if (twitterRes.ok) {
        const markdown = buildMarkdownEnvelope(twitterRes.title, twitterRes.sourceUrl, twitterRes.markdown);
        sendResponse({
          ok: true,
          title: twitterRes.title,
          sourceUrl: twitterRes.sourceUrl,
          markdown,
          images: twitterRes.images.map((i) => ({ token: i.token, url: i.url, alt: i.alt })),
          suggestedFolderPath: twitterRes.suggestedFolderPath
        });
        return;
      }

      const baseUrl = location.href;
      let title = document.title || 'Untitled';
      let html: string | null = null;

      if (msg.mode === 'selection') {
        html = getSelectionHtml();
        if (!html) {
          sendResponse({ ok: false, error: '没有检测到选中文本/内容。请先选中内容再点“仅选中内容”。' });
          return;
        }
      } else {
        const reader = getReaderHtml();
        if (!reader) {
          sendResponse({ ok: false, error: '阅读模式提取失败（该页面可能不适合 Reader）。请尝试“仅选中内容”。' });
          return;
        }
        title = reader.title;
        html = reader.contentHtml;
      }

      const { markdown: contentMd, images } = htmlToMarkdownWithImageTokens(html, baseUrl);
      const markdown = buildMarkdownEnvelope(title, baseUrl, contentMd);

      sendResponse({
        ok: true,
        title,
        sourceUrl: baseUrl,
        markdown,
        images
      });
    })().catch((err) => {
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    });
    return true;
  });
}

export {};
