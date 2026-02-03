import { humanizeTabSendMessageError } from './error_utils';
import { deriveTitleFromMarkdown, renderMarkdownToHtml } from './markdown_render';

const NATIVE_HOST = 'com.codex.apple_notes_webclipper';

type FolderRef = {
  accountName: string;
  folderPath: string;
};

type StoredSettings = {
  askEveryTime?: boolean;
  defaultFolder?: FolderRef | null;
};

type ExtractRequest =
  | { mode: 'reader' }
  | { mode: 'selection' };

type ExtractResult =
  | {
      ok: true;
      title: string;
      sourceUrl: string;
      markdown: string;
      images: Array<{ token: string; url: string; alt?: string | null }>;
      suggestedFolderPath?: string | null;
    }
  | { ok: false; error: string };

type DebugPayload = {
  capturedAt: string;
  mode: 'reader' | 'selection';
  folder: FolderRef | null;
  extracted: ExtractResult & { ok: true };
};

function sendNativeMessage<TResponse>(message: object): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(response as TResponse);
    });
  });
}

type ActiveTab = {
  id: number;
  url?: string;
};

async function getActiveTab(): Promise<ActiveTab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const tabId = tab?.id;
  if (!tabId) throw new Error('No active tab');
  return { id: tabId, url: tab?.url };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryRenderHtml(markdown: string): string | null {
  try {
    return renderMarkdownToHtml(markdown);
  } catch (err) {
    console.warn('Failed to render markdown to HTML', err);
    return null;
  }
}

function sendTabMessage<TResponse>(tabId: number, message: object): Promise<{ ok: true; response: TResponse } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve({ ok: false, error: err.message || 'Unknown error' });
      resolve({ ok: true, response: res as TResponse });
    });
  });
}

function injectContentScript(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome.scripting?.executeScript) return reject(new Error('chrome.scripting.executeScript is unavailable'));
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['content.js']
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve();
      }
    );
  });
}

function isNoReceiverError(message: string): boolean {
  return message.includes('Receiving end does not exist') || message.includes('The message port closed before a response was received');
}

async function extractFromTab(tabId: number, tabUrl: string | undefined, req: ExtractRequest): Promise<ExtractResult> {
  const message = { type: 'extract', ...req };

  let res = await sendTabMessage<ExtractResult>(tabId, message);
  if (res.ok) return res.response;

  // If the user installed/reloaded the extension after the page loaded, the content script may not exist yet.
  if (isNoReceiverError(res.error)) {
    try {
      await injectContentScript(tabId);
    } catch {
      // Ignore and fall back to a clearer user-facing error.
    }
    res = await sendTabMessage<ExtractResult>(tabId, message);
    if (res.ok) return res.response;
  }

  // Retry briefly to allow late content-script injection on slow pages.
  for (let i = 0; i < 4; i++) {
    if (!isNoReceiverError(res.error)) break;
    await sleep(150);
    res = await sendTabMessage<ExtractResult>(tabId, message);
    if (res.ok) return res.response;
  }

  return { ok: false, error: humanizeTabSendMessageError(res.error, tabUrl) };
}

async function loadSettings(): Promise<StoredSettings> {
  const data = await chrome.storage.sync.get(['askEveryTime', 'defaultFolder']);
  return {
    askEveryTime: Boolean(data.askEveryTime),
    defaultFolder: (data.defaultFolder as FolderRef | undefined) ?? null
  };
}

async function maybePickFolderForCapture(suggestedFolderPath?: string | null): Promise<FolderRef | null> {
  const settings = await loadSettings();
  if (settings.askEveryTime) return null;
  if (settings.defaultFolder) return settings.defaultFolder;
  if (!settings.defaultFolder && suggestedFolderPath) {
    // Provide a lightweight default suggestion if user has not set one yet.
    return { accountName: '', folderPath: suggestedFolderPath };
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'nativePing') {
      const res = await sendNativeMessage<{ ok: boolean }>({ action: 'ping' });
      sendResponse({ ok: true, data: res });
      return;
    }

    if (msg?.type === 'listFolders') {
      const res = await sendNativeMessage<{ ok: boolean; accounts?: unknown; error?: string }>({ action: 'listFolders' });
      sendResponse({ ok: true, data: res });
      return;
    }

    if (msg?.type === 'renderLastDebugHtml') {
      const data = await chrome.storage.local.get(['lastDebugPayload']);
      const payload = data.lastDebugPayload as DebugPayload | undefined;
      if (!payload?.extracted?.ok) {
        sendResponse({ ok: false, error: 'No debug payload yet. Save once, then try again.' });
        return;
      }

      const extracted = payload.extracted;
      const html = tryRenderHtml(extracted.markdown);
      const title = deriveTitleFromMarkdown(extracted.markdown, extracted.title) || extracted.title;
      const res = await sendNativeMessage<{ ok: boolean; htmlPath?: string; error?: string }>({
        action: 'renderHtml',
        title,
        sourceUrl: extracted.sourceUrl,
        markdown: extracted.markdown,
        images: extracted.images,
        ...(html ? { html } : {})
      });
      sendResponse({ ok: true, data: res });
      return;
    }

    if (msg?.type === 'createNoteFromActiveTab') {
      const tab = await getActiveTab();
      const extractReq: ExtractRequest = msg.mode === 'selection' ? { mode: 'selection' } : { mode: 'reader' };
      const extracted = await extractFromTab(tab.id, tab.url, extractReq);
      if (!extracted.ok) {
        sendResponse({ ok: false, error: extracted.error });
        return;
      }

      const folder = msg.folder as FolderRef | null | undefined;
      const chosenFolder = folder ?? (await maybePickFolderForCapture(extracted.suggestedFolderPath));

      const debugPayload: DebugPayload = {
        capturedAt: new Date().toISOString(),
        mode: extractReq.mode,
        folder: chosenFolder,
        extracted
      };
      await chrome.storage.local.set({ lastDebugPayload: debugPayload });

      const html = tryRenderHtml(extracted.markdown);
      const title = deriveTitleFromMarkdown(extracted.markdown, extracted.title) || extracted.title;
      const res = await sendNativeMessage<{ ok: boolean; error?: string; noteId?: string }>({
        action: 'createNote',
        folder: chosenFolder,
        title,
        sourceUrl: extracted.sourceUrl,
        markdown: extracted.markdown,
        images: extracted.images,
        ...(html ? { html } : {})
      });
      sendResponse({ ok: Boolean(res.ok), data: res });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message' });
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message ?? String(err) });
  });
  return true;
});

export {};
