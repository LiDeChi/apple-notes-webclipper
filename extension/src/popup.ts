type FolderRef = { accountName: string; folderPath: string };

type NativeListFoldersResponse = {
  ok: boolean;
  accounts?: Array<{
    name: string;
    folders: Array<{ path: string }>;
  }>;
  error?: string;
};

type StorageSettings = { askEveryTime?: boolean; defaultFolder?: FolderRef | null };

const folderSelect = document.getElementById('folderSelect') as HTMLSelectElement;
const rememberFolder = document.getElementById('rememberFolder') as HTMLInputElement;
const refreshFoldersBtn = document.getElementById('refreshFolders') as HTMLButtonElement;
const saveReaderBtn = document.getElementById('saveReader') as HTMLButtonElement;
const saveSelectionBtn = document.getElementById('saveSelection') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const openOptionsBtn = document.getElementById('openOptions') as HTMLButtonElement;

function setStatus(text: string) {
  statusEl.textContent = text;
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

function optionKey(accountName: string, folderPath: string): string {
  return `${accountName}::${folderPath}`;
}

async function loadSettings(): Promise<StorageSettings> {
  const data = await chrome.storage.sync.get(['askEveryTime', 'defaultFolder']);
  return {
    askEveryTime: Boolean(data.askEveryTime),
    defaultFolder: (data.defaultFolder as FolderRef | undefined) ?? null
  };
}

async function saveSettings(settings: StorageSettings) {
  await chrome.storage.sync.set(settings);
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

    const settings = await loadSettings();
    rememberFolder.checked = !settings.askEveryTime;
    if (settings.defaultFolder) {
      const key = optionKey(settings.defaultFolder.accountName, settings.defaultFolder.folderPath);
      folderSelect.value = key;
    }

    setStatus('');
  } catch (err) {
    folderSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '无法加载文件夹（请先安装 Native Host）';
    folderSelect.appendChild(opt);
    setStatus(`加载文件夹失败：${(err as Error).message}`);
  }
}

function getSelectedFolderRef(): FolderRef | null {
  const raw = folderSelect.value;
  if (!raw) return null;
  const [accountName, folderPath] = raw.split('::');
  if (!accountName || !folderPath) return null;
  return { accountName, folderPath };
}

async function saveToNotes(mode: 'reader' | 'selection') {
  saveReaderBtn.disabled = true;
  saveSelectionBtn.disabled = true;
  try {
    setStatus('处理中…（下载图片并写入 Notes）');

    const folder = getSelectedFolderRef();
    const res = await bg<{ ok: boolean; data?: { ok: boolean; error?: string }; error?: string }>({
      type: 'createNoteFromActiveTab',
      mode,
      folder
    });
    if (!res.ok) throw new Error(res.error || 'Background error');
    if (!res.data?.ok) throw new Error(res.data?.error || 'Native host error');

    // Persist folder choice if requested.
    if (rememberFolder.checked) {
      await saveSettings({ askEveryTime: false, defaultFolder: folder });
    } else {
      await saveSettings({ askEveryTime: true, defaultFolder: null });
    }

    setStatus('已保存到 Apple Notes ✅');
  } catch (err) {
    setStatus(`保存失败：${(err as Error).message}`);
  } finally {
    saveReaderBtn.disabled = false;
    saveSelectionBtn.disabled = false;
  }
}

refreshFoldersBtn.addEventListener('click', () => void loadFolders());
saveReaderBtn.addEventListener('click', () => void saveToNotes('reader'));
saveSelectionBtn.addEventListener('click', () => void saveToNotes('selection'));
openOptionsBtn.addEventListener('click', () => void chrome.runtime.openOptionsPage());

void loadFolders();

export {};
