import { htmlToMarkdownWithImageTokens, ImageRef } from './markdown';

function isTwitterHost(hostname: string): boolean {
  return hostname === 'twitter.com' || hostname === 'x.com' || hostname.endsWith('.twitter.com') || hostname.endsWith('.x.com');
}

function parseStatusUrl(url: string): { handle: string; statusId: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const statusIndex = parts.indexOf('status');
    if (statusIndex <= 0) return null;
    const handle = parts[0];
    const statusId = parts[statusIndex + 1];
    if (!handle || !statusId) return null;
    return { handle, statusId };
  } catch {
    return null;
  }
}

function isArticleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.includes('/i/article/');
  } catch {
    return false;
  }
}

function normalizeTwitterImageUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === 'pbs.twimg.com') {
      // Try to request original size if available.
      u.searchParams.set('name', 'orig');
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function findTweetArticles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article')).filter((a) => a.innerText.trim().length > 0);
}

function getArticlePermalink(article: HTMLElement): { handle: string; statusId: string; url: string } | null {
  const link = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
  if (!link) return null;
  try {
    const u = new URL(link.getAttribute('href') || '', location.origin);
    const parsed = parseStatusUrl(u.toString());
    if (!parsed) return null;
    return { ...parsed, url: u.toString() };
  } catch {
    return null;
  }
}

function extractTweetTextMarkdown(article: HTMLElement, baseUrl: string): { markdown: string; images: ImageRef[] } {
  // Twitter uses structured spans/links inside tweetText; HTML->Markdown keeps links.
  const tweetText = article.querySelector<HTMLElement>('[data-testid="tweetText"]') ?? article;
  return htmlToMarkdownWithImageTokens(tweetText.innerHTML, baseUrl);
}

function extractTweetImages(article: HTMLElement, baseUrl: string): Array<{ url: string; alt?: string | null }> {
  const images: Array<{ url: string; alt?: string | null }> = [];

  // Prefer tweetPhoto containers to avoid avatars/emojis.
  const photoImgs = article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img');
  const imgEls = photoImgs.length > 0 ? Array.from(photoImgs) : Array.from(article.querySelectorAll<HTMLImageElement>('img'));

  for (const img of imgEls) {
    const src = img.getAttribute('src')?.trim();
    if (!src) continue;
    // Skip avatars and UI icons heuristically.
    if (src.includes('profile_images')) continue;
    if (src.includes('/emoji/')) continue;
    if (src.startsWith('data:')) continue;
    const abs = new URL(src, baseUrl).toString();
    const url = normalizeTwitterImageUrl(abs);
    images.push({ url, alt: img.getAttribute('alt') });
  }

  return images;
}

export function extractTwitterMarkdown(): {
  ok: true;
  title: string;
  sourceUrl: string;
  markdown: string;
  images: ImageRef[];
  suggestedFolderPath: string;
} | { ok: false; error: string } {
  if (!isTwitterHost(location.hostname)) return { ok: false, error: 'Not a Twitter/X page' };

  const status = parseStatusUrl(location.href);
  const baseUrl = location.href;

  // X long-form article page
  if (!status && isArticleUrl(location.href)) {
    const root = document.querySelector<HTMLElement>('article') ?? document.querySelector<HTMLElement>('main') ?? document.body;
    const { markdown, images } = htmlToMarkdownWithImageTokens(root.innerHTML, baseUrl);
    return {
      ok: true,
      title: document.title || 'X Article',
      sourceUrl: location.href,
      markdown: markdown.trim(),
      images,
      suggestedFolderPath: 'Twitter'
    };
  }

  // Only treat /status/ pages as tweet/thread capture to avoid grabbing random timeline tweets.
  if (!status) return { ok: false, error: 'Open a tweet (/status/…) or an article (/i/article/…), then retry.' };

  const articles = findTweetArticles();
  if (articles.length === 0) return { ok: false, error: 'No tweets found on this page (try scrolling a bit, then retry).' };

  // Prefer tweets belonging to the same handle (thread).
  let threadArticles: HTMLElement[] = [];
  const targetHandle = status.handle.toLowerCase();
  threadArticles = articles.filter((a) => {
    const pl = getArticlePermalink(a);
    return pl?.handle?.toLowerCase() === targetHandle;
  });
  // Keep DOM order; if none matched, fall back to all articles.
  if (threadArticles.length === 0) threadArticles = articles;

  const pieces: string[] = [];
  const allImages: ImageRef[] = [];
  let imgCounter = 0;

  for (const article of threadArticles) {
    const pl = getArticlePermalink(article);
    const displayUrl = pl?.url ?? location.href;

    const { markdown } = extractTweetTextMarkdown(article, baseUrl);
    const tweetImages = extractTweetImages(article, baseUrl);

    const imgRefs: ImageRef[] = tweetImages.map((img) => {
      const token = `twimg-${imgCounter++}`;
      return { token, url: img.url, alt: img.alt };
    });

    // Insert images after text (Twitter layout is mostly text then media).
    const imgLines = imgRefs.map((img) => `[[[IMG:${img.token}]]]`);
    allImages.push(...imgRefs);

    const block = [
      markdown.trim(),
      imgLines.length ? '' : null,
      imgLines.join('\n'),
      '',
      displayUrl,
      '',
      '---',
      ''
    ]
      .filter((x) => x !== null)
      .join('\n');
    pieces.push(block);
  }

  const title = document.title || (status ? `@${status.handle} thread` : 'X / Twitter');
  const content = pieces.join('\n').trim();

  return {
    ok: true,
    title,
    sourceUrl: location.href,
    markdown: content,
    images: allImages,
    suggestedFolderPath: 'Twitter'
  };
}
