/** app: see docs/architecture.md for responsibilities. */
import { appearanceKey, applyAppearance, themes } from './ui/settings.js';
import { runtime } from './ui/runtime.js';
import { $, C, append, btn, el, host, toast } from './ui/dom.js';
import { cloudMode, persist, progressSignature, rebuildQueue } from './ui/state.js';
import { finishApp, render, setTab } from './ui/navigation.js';
import { importData, requestImport, updateBundledDeck } from './ui/backup.js';

try {
  const saved = JSON.parse(localStorage.getItem(appearanceKey) || '{}');
  if ([14, 16, 18, 20, 22].includes(saved.size)) runtime.appearance.size = saved.size;
  if (Object.hasOwn(themes, saved.theme)) runtime.appearance.theme = saved.theme;
} catch {}

applyAppearance();

window.onCloudSyncSaved = async (s) => {
  const latest = C.mergeFavorites(
    C.mergeProgress(runtime.state, s),
    Object.entries(s.favoriteChanges || {}).map(([id, r]) => ({ id, ...r })),
  );
  if (!(await persist(latest))) return false;
  localStorage.setItem(
    'ielts75-sync-dirty',
    progressSignature(latest) === progressSignature(s) ? '0' : '1',
  );
  return true;
};

window.hasUnsavedCloudProgress = () =>
  cloudMode() && localStorage.getItem('ielts75-sync-dirty') === '1';

window.requestAppExit = (after = finishApp) => {
  if (runtime.saving) {
    toast('正在保存，请稍后再退出。');
    return;
  }
  if (runtime.exitPending || $('exit-save-dialog')) return;
  if (window.WordMemoSync?.status().running) {
    toast('正在同步，请完成后再退出。');
    return;
  }
  if (!window.hasUnsavedCloudProgress()) {
    after();
    return;
  }
  const dialog = el('dialog');
  dialog.id = 'exit-save-dialog';
  const text = el('p', '', '是否同步本次学习记录'),
    yes = btn(
      '是',
      async () => {
        runtime.exitPending = true;
        yes.disabled = true;
        leave.disabled = true;
        try {
          await window.WordMemoSync.sync();
          if (window.hasUnsavedCloudProgress()) throw Error('仍有新增记录未保存，请重试');
          dialog.close();
          dialog.remove();
          after();
        } catch (e) {
          toast('保存未完成：' + e.message + '。请重试，或选择退出。');
        } finally {
          runtime.exitPending = false;
          yes.disabled = false;
          leave.disabled = false;
        }
      },
      'primary',
    ),
    leave = btn('退出', () => {
      dialog.close();
      dialog.remove();
      after();
    });
  append(dialog, text, append(el('div', 'actions'), yes, leave));
  document.body.append(dialog);
  dialog.addEventListener('cancel', () => dialog.remove());
  dialog.showModal();
};

window.addEventListener('beforeunload', (e) => {
  if (window.hasUnsavedCloudProgress()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

window.onNativeStatus = (t) => toast(t);

window.ieltsSyncState = () => runtime.state;

window.ieltsApplySync = async (next, migrate = false) => {
  const merged = migrate
    ? next
    : C.mergeFavorites(
        C.mergeProgress(runtime.state, next),
        Object.entries(next.favoriteChanges || {}).map(([id, r]) => ({ id, ...r })),
      );
  if (!(await persist(merged))) return false;
  rebuildQueue();
  if (!runtime.session) render();
  return true;
};

window.onNativeImport = importData;

$('file-picker').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 30 * 1024 * 1024) {
    toast('文件过大，最多支持30MB。');
    return;
  }
  window.onNativeImport(await f.text(), runtime.importKind);
};

for (const name of ['learn', 'review', 'library', 'settings'])
  $('tab-' + name).onclick = () => setTab(name);

(async function init() {
  try {
    const raw = window.AndroidStore
      ? window.AndroidStore.load()
      : window.BrowserStore
        ? await window.BrowserStore.load()
        : localStorage.getItem('ielts75-state-v1');
    if (raw) {
      try {
        runtime.state = C.validateState(JSON.parse(raw));
      } catch (e) {
        host.textContent =
          '本地记录无法读取，已保留原始文件。请先使用下方按钮导出，再尝试恢复有效备份。';
        append(
          host,
          btn('导出原始记录', () => {
            if (window.AndroidStore)
              window.AndroidStore.exportFile(raw, '词记-待恢复原始记录.json');
            else {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([raw]));
              a.download = '词记-待恢复原始记录.json';
              a.click();
            }
          }),
          btn('从备份恢复', () => requestImport('restore')),
        );
        window.onNativeImport = async (text) => {
          try {
            const next = C.validateState(JSON.parse(text));
            if (confirm('确认使用这份备份恢复？') && (await persist(next))) {
              rebuildQueue();
              render();
            }
          } catch (err) {
            toast(err.message);
          }
        };
        return;
      }
      await updateBundledDeck();
    } else {
      const response = await fetch('deck.json');
      if (response.ok) {
        const d = await response.json();
        if (d.cards?.length) {
          runtime.state = C.emptyState(d);
          if (!(await persist(runtime.state))) throw Error('无法初始化本地存储。');
        }
      }
    }
    if (cloudMode() && !runtime.state) {
      const cached = window.AndroidStore?.loadBook
        ? window.AndroidStore.loadBook()
        : window.BrowserStore
          ? await window.BrowserStore.get('cloud-book')
          : null;
      if (cached) runtime.state = C.emptyState(C.validateDeck(JSON.parse(cached)));
    }
    if (runtime.state) rebuildQueue();
    render();
    if (cloudMode()) {
      toast('已加载本地最新记录；点击“同步进度”与云端合并保存。');
    }
  } catch (e) {
    host.textContent = '启动失败：' + e.message;
  }
})();

// Native Android back navigation calls this explicit interface, not module locals.
window.onNativeBack = () => {
  if (runtime.saving) {
    toast('正在保存，请稍后再退出。');
    return true;
  }
  if (runtime.libraryCard) {
    runtime.libraryCard = null;
    render();
    return true;
  }
  if (window.WordMemoSync?.config().enabled) {
    window.requestAppExit();
    return true;
  }
  return false;
};
