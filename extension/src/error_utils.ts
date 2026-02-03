function startsWithAny(url: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (url.startsWith(p)) return true;
  }
  return false;
}

export function isRestrictedUrl(url?: string | null): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();

  // Chrome blocks extension scripting/messaging on many internal pages.
  if (
    startsWithAny(u, [
      'chrome://',
      'chrome-extension://',
      'chrome-search://',
      'chrome-untrusted://',
      'devtools://',
      'edge://',
      'about:',
      'view-source:',
      'brave://'
    ])
  ) {
    return true;
  }

  // Chrome Web Store pages are also restricted.
  if (startsWithAny(u, ['https://chrome.google.com/webstore', 'https://chromewebstore.google.com/'])) {
    return true;
  }

  return false;
}

export function humanizeTabSendMessageError(message: string, url?: string | null): string {
  const msg = (message || '').trim();
  const u = (url || '').trim();

  const looksLikeNoReceiver =
    msg.includes('Receiving end does not exist') || msg.includes('The message port closed before a response was received');
  const looksLikeCannotAccess = msg.includes('Cannot access') || msg.includes('not allowed');

  if (looksLikeNoReceiver || looksLikeCannotAccess) {
    if (u.toLowerCase().startsWith('file://')) {
      return [
        '无法读取当前页面内容：你打开的是 file:// 本地文件。',
        '请在 chrome://extensions → 本扩展详情里开启 “Allow access to file URLs”，然后刷新页面再试。'
      ].join(' ');
    }

    if (isRestrictedUrl(u)) {
      return [
        '无法读取当前页面内容：Chrome 不允许在该页面注入脚本（例如 chrome://、扩展页、Chrome Web Store 等）。',
        '请切换到普通网页标签页再试。'
      ].join(' ');
    }

    return [
      '无法读取当前页面内容：内容脚本可能尚未注入/未就绪。',
      '请刷新页面后再试；如果你刚更新/重载了扩展，也可以先刷新该网页标签页再点保存。'
    ].join(' ');
  }

  return msg || 'Unknown error';
}

