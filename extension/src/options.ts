type FolderRef = { accountName: string; folderPath: string };
type ImageRef = { token: string; url: string; alt?: string | null };

type ExtractedOk = {
  ok: true;
  title: string;
  sourceUrl: string;
  markdown: string;
  images: ImageRef[];
  suggestedFolderPath?: string | null;
};

type DebugPayload = {
  capturedAt: string;
  mode: 'reader' | 'selection';
  folder: FolderRef | null;
  extracted: ExtractedOk;
};

type NativeListFoldersResponse = {
  ok: boolean;
  accounts?: Array<{
    name: string;
    folders: Array<{ path: string }>;
  }>;
  error?: string;
};

const HOST_NAME = 'com.codex.apple_notes_webclipper';

const hostNameEl = document.getElementById('hostName') as HTMLSpanElement;
const pingBtn = document.getElementById('ping') as HTMLButtonElement;
const pingStatusEl = document.getElementById('pingStatus') as HTMLDivElement;

const folderSelect = document.getElementById('folderSelect') as HTMLSelectElement;
const askEveryTime = document.getElementById('askEveryTime') as HTMLInputElement;
const refreshFoldersBtn = document.getElementById('refreshFolders') as HTMLButtonElement;
const folderStatusEl = document.getElementById('folderStatus') as HTMLDivElement;

const debugSummaryEl = document.getElementById('debugSummary') as HTMLDivElement;
const copyDebugJsonBtn = document.getElementById('copyDebugJson') as HTMLButtonElement;
const downloadDebugJsonBtn = document.getElementById('downloadDebugJson') as HTMLButtonElement;
const copyMarkdownBtn = document.getElementById('copyMarkdown') as HTMLButtonElement;
const renderDebugHtmlBtn = document.getElementById('renderDebugHtml') as HTMLButtonElement;
const clearDebugBtn = document.getElementById('clearDebug') as HTMLButtonElement;
const debugStatusEl = document.getElementById('debugStatus') as HTMLDivElement;

function optionKey(accountName: string, folderPath: string): string {
  return `${accountName}::${folderPath}`;
}

function setPingStatus(text: string) {
  pingStatusEl.textContent = text;
}

function setFolderStatus(text: string) {
  folderStatusEl.textContent = text;
}

function setDebugStatus(text: string) {
  debugStatusEl.textContent = text;
}

async function bg<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res as T);
    });
  });
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(['askEveryTime', 'defaultFolder']);
  askEveryTime.checked = Boolean(data.askEveryTime);
  const def = data.defaultFolder as FolderRef | undefined;
  if (def) folderSelect.value = optionKey(def.accountName, def.folderPath);
}

async function saveSettings() {
  const raw = folderSelect.value;
  let defaultFolder: FolderRef | null = null;
  if (raw) {
    const [accountName, folderPath] = raw.split('::');
    if (accountName && folderPath) defaultFolder = { accountName, folderPath };
  }
  await chrome.storage.sync.set({
    askEveryTime: askEveryTime.checked,
    defaultFolder
  });
  setFolderStatus('已保存设置');
}

function setDebugButtonsEnabled(enabled: boolean) {
  copyDebugJsonBtn.disabled = !enabled;
  downloadDebugJsonBtn.disabled = !enabled;
  copyMarkdownBtn.disabled = !enabled;
  renderDebugHtmlBtn.disabled = !enabled;
  clearDebugBtn.disabled = !enabled;
}

function formatDebugSummary(payload: DebugPayload): string {
  const dt = new Date(payload.capturedAt);
  const when = Number.isNaN(dt.getTime()) ? payload.capturedAt : dt.toLocaleString();
  const extracted = payload.extracted;
  const imgCount = extracted.images?.length ?? 0;
  const folderText = payload.folder
    ? `${payload.folder.accountName || '默认账号'} / ${payload.folder.folderPath}`
    : '（未选择，使用默认）';

  return [
    `Captured: ${when}`,
    `Mode: ${payload.mode}`,
    `Title: ${extracted.title}`,
    `URL: ${extracted.sourceUrl}`,
    `Images: ${imgCount}`,
    `Folder: ${folderText}`
  ].join('\n');
}

async function loadDebugPayload(): Promise<DebugPayload | null> {
  const data = await chrome.storage.local.get(['lastDebugPayload']);
  const payload = data.lastDebugPayload as DebugPayload | undefined;
  if (!payload) return null;
  if (!payload.extracted?.ok) return null;
  return payload;
}

async function refreshDebugUI() {
  const payload = await loadDebugPayload();
  if (!payload) {
    debugSummaryEl.textContent = '暂无调试数据。先用插件保存一次。';
    setDebugButtonsEnabled(false);
    return;
  }
  debugSummaryEl.textContent = formatDebugSummary(payload);
  setDebugButtonsEnabled(true);
}

async function loadFolders() {
  folderSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '加载中…';
  folderSelect.appendChild(placeholder);

  try {
    const res = await bg<{ ok: boolean; data: NativeListFoldersResponse; error?: string }>({ type: 'listFolders' });
    if (!res.ok) throw new Error(res.error || 'Background error');
    if (!res.data.ok) throw new Error(res.data.error || 'Native host error');

    const accounts = res.data.accounts ?? [];
    folderSelect.innerHTML = '';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '（使用默认文件夹）';
    folderSelect.appendChild(empty);

    for (const acc of accounts) {
      const group = document.createElement('optgroup');
      group.label = acc.name;
      for (const f of acc.folders) {
        const opt = document.createElement('option');
        opt.value = optionKey(acc.name, f.path);
        opt.textContent = f.path;
        group.appendChild(opt);
      }
      folderSelect.appendChild(group);
    }

    await loadSettings();
    setFolderStatus('');
  } catch (err) {
    folderSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '无法加载（请先安装 Native Host）';
    folderSelect.appendChild(opt);
    setFolderStatus(`加载失败：${(err as Error).message}`);
  }
}

hostNameEl.textContent = HOST_NAME;

pingBtn.addEventListener('click', async () => {
  pingBtn.disabled = true;
  try {
    const res = await bg<{ ok: boolean; data?: { ok: boolean }; error?: string }>({ type: 'nativePing' });
    if (!res.ok) throw new Error(res.error || 'Background error');
    setPingStatus(res.data?.ok ? '✅ Native Host 正常' : '❌ Native Host 返回异常');
  } catch (err) {
    setPingStatus(`❌ 连接失败：${(err as Error).message}`);
  } finally {
    pingBtn.disabled = false;
  }
});

refreshFoldersBtn.addEventListener('click', () => void loadFolders());
folderSelect.addEventListener('change', () => void saveSettings());
askEveryTime.addEventListener('change', () => void saveSettings());

copyDebugJsonBtn.addEventListener('click', async () => {
  copyDebugJsonBtn.disabled = true;
  try {
    const payload = await loadDebugPayload();
    if (!payload) throw new Error('暂无调试数据');
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setDebugStatus('已复制 Debug JSON ✅');
  } catch (err) {
    setDebugStatus(`复制失败：${(err as Error).message}`);
  } finally {
    copyDebugJsonBtn.disabled = false;
  }
});

downloadDebugJsonBtn.addEventListener('click', async () => {
  downloadDebugJsonBtn.disabled = true;
  try {
    const payload = await loadDebugPayload();
    if (!payload) throw new Error('暂无调试数据');
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTs = payload.capturedAt.replace(/[:.]/g, '-');
    a.href = url;
    a.download = `apple-notes-webclipper-debug-${safeTs}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDebugStatus('已下载 Debug JSON ✅');
  } catch (err) {
    setDebugStatus(`下载失败：${(err as Error).message}`);
  } finally {
    downloadDebugJsonBtn.disabled = false;
  }
});

copyMarkdownBtn.addEventListener('click', async () => {
  copyMarkdownBtn.disabled = true;
  try {
    const payload = await loadDebugPayload();
    if (!payload) throw new Error('暂无调试数据');
    await navigator.clipboard.writeText(payload.extracted.markdown);
    setDebugStatus('已复制 Markdown ✅');
  } catch (err) {
    setDebugStatus(`复制失败：${(err as Error).message}`);
  } finally {
    copyMarkdownBtn.disabled = false;
  }
});

renderDebugHtmlBtn.addEventListener('click', async () => {
  renderDebugHtmlBtn.disabled = true;
  try {
    setDebugStatus('生成中…（Native Host 会下载图片）');
    const res = await bg<{ ok: boolean; data?: { ok: boolean; htmlPath?: string; error?: string }; error?: string }>({
      type: 'renderLastDebugHtml'
    });
    if (!res.ok) throw new Error(res.error || 'Background error');
    if (!res.data?.ok) throw new Error(res.data?.error || 'Native host error');
    setDebugStatus(`已生成预览 HTML ✅\n${res.data.htmlPath || ''}`.trim());
  } catch (err) {
    setDebugStatus(`生成失败：${(err as Error).message}`);
  } finally {
    renderDebugHtmlBtn.disabled = false;
  }
});

clearDebugBtn.addEventListener('click', async () => {
  clearDebugBtn.disabled = true;
  try {
    await chrome.storage.local.remove(['lastDebugPayload']);
    setDebugStatus('已清除 ✅');
    await refreshDebugUI();
  } catch (err) {
    setDebugStatus(`清除失败：${(err as Error).message}`);
  } finally {
    clearDebugBtn.disabled = false;
  }
});

void loadFolders();
void refreshDebugUI();

export {};
