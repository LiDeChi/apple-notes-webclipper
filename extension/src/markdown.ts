import TurndownService from 'turndown';

export type ImageRef = { token: string; url: string; alt?: string | null };

function pickBestSrcFromSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(',')
    .map((s) => s.trim())
    .map((part) => {
      const [url, desc] = part.split(/\s+/);
      if (!url) return null;
      return { url, desc: desc ?? '' };
    })
    .filter(Boolean) as Array<{ url: string; desc: string }>;
  if (candidates.length === 0) return null;

  const parsed = candidates
    .map((c) => {
      const d = c.desc.trim();
      if (d.endsWith('w')) return { url: c.url, score: Number(d.slice(0, -1)) || 0 };
      if (d.endsWith('x')) return { url: c.url, score: (Number(d.slice(0, -1)) || 0) * 10000 };
      return { url: c.url, score: 1 };
    })
    .sort((a, b) => b.score - a.score);
  return parsed[0]?.url ?? null;
}

function toAbsoluteUrl(rawUrl: string, baseUrl: string): string {
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return rawUrl;
  }
}

function resolveImageUrl(img: HTMLImageElement, baseUrl: string): string | null {
  const src = img.getAttribute('src')?.trim() ?? '';
  const dataSrc = img.getAttribute('data-src')?.trim() ?? '';
  const dataOriginal = img.getAttribute('data-original')?.trim() ?? '';
  const srcset = img.getAttribute('srcset')?.trim() ?? '';

  const bestFromSrcset = srcset ? pickBestSrcFromSrcset(srcset) : null;
  const chosen = bestFromSrcset || dataOriginal || dataSrc || src;
  if (!chosen) return null;
  return toAbsoluteUrl(chosen, baseUrl);
}

export function htmlToMarkdownWithImageTokens(html: string, baseUrl: string): { markdown: string; images: ImageRef[] } {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_'
  });

  const images: ImageRef[] = [];
  let imgCounter = 0;

  turndown.addRule('imagesToTokens', {
    filter: (node: Node) => node.nodeName === 'IMG',
    replacement: (_content: string, node: Node) => {
      const img = node as HTMLImageElement;
      const url = resolveImageUrl(img, baseUrl);
      if (!url) return '';
      const token = String(imgCounter++);
      images.push({ token, url, alt: img.getAttribute('alt') });
      return `\n[[[IMG:${token}]]]\n`;
    }
  });

  const markdown = turndown.turndown(html).trim();
  return { markdown, images };
}
