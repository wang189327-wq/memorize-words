/** state: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';
import { $, C, host, toast } from './dom.js';

export const cloudMode = () =>
  runtime.storageMode === 'cloud' &&
  !!window.WordMemoSync?.config().enabled &&
  !!window.WordMemoSync?.config().token;

export const progressSignature = (s) =>
  JSON.stringify({
    learned: s?.learned || {},
    results: s?.results || [],
    favorites: s?.favorites || {},
    favoriteChanges: s?.favoriteChanges || {},
  });

export async function persist(next, progressChanged = true) {
  if (runtime.saving) {
    toast('正在保存，请稍后再试。');
    return false;
  }
  runtime.saving = true;
  host.inert = true;
  $('bottom-nav').inert = true;
  let previousDirty = null,
    markedDirty = false;
  try {
    previousDirty = localStorage.getItem('ielts75-sync-dirty');
    C.validateState(next);
    const raw = JSON.stringify(next);
    if (progressChanged && cloudMode()) {
      localStorage.setItem('ielts75-sync-dirty', '1');
      markedDirty = true;
    }
    if (window.AndroidStore) {
      if (!window.AndroidStore.save(raw)) throw Error('本地保存失败，请先导出备份并检查设备空间。');
    } else if (window.BrowserStore) await window.BrowserStore.save(raw);
    else localStorage.setItem('ielts75-state-v1', raw);
    runtime.state = next;
    return true;
  } catch (error) {
    if (markedDirty) {
      try {
        if (previousDirty === null) localStorage.removeItem('ielts75-sync-dirty');
        else localStorage.setItem('ielts75-sync-dirty', previousDirty);
      } catch {}
    }
    toast('保存失败，当前操作未提交：' + error.message);
    return false;
  } finally {
    runtime.saving = false;
    host.inert = false;
    $('bottom-nav').inert = false;
  }
}

export function rebuildQueue() {
  runtime.queue = C.learningQueue(runtime.state);
}
