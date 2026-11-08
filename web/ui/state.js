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
    ratingEvents: s?.ratingEvents || [],
  });

export async function persist(next, progressChanged = true, { replace = false } = {}) {
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
    if (next.results.some((event) => !event.eventId))
      next = await window.WordMemoRecords.normalizeLegacy(next);
    const previous = runtime.state;
    const patch = window.WordMemoRecords.patch(next, previous, replace);
    if (!previous || previous.deck !== next.deck) C.validateState(next);
    else
      C.validateState(
        {
          ...next,
          learned: Object.fromEntries(patch.puts.learned || []),
          results: (patch.puts.results || []).map(([, value]) => value),
          ratingEvents: (patch.puts.ratings || []).map(([, value]) => value),
        },
        previous.deck,
      );
    if (progressChanged && cloudMode()) {
      localStorage.setItem('ielts75-sync-dirty', '1');
      markedDirty = true;
    }
    if (window.AndroidStore && patch.replace) {
      // Full restore/import must verify the replacement and retire the legacy file together.
      // Ordinary commits deliberately leave an unverified migration source untouched.
      if (!window.AndroidStore.save(JSON.stringify(next)))
        throw Error('完整恢复未完成，已保留原记录。');
    } else if (window.AndroidStore?.commit) {
      if (!window.AndroidStore.commit(JSON.stringify(patch)))
        throw Error('本地事务保存失败，请检查设备空间。');
    } else if (window.AndroidStore) {
      if (!window.AndroidStore.save(JSON.stringify(next)))
        throw Error('本地保存失败，请先导出备份并检查设备空间。');
    } else if (window.BrowserStore) await window.BrowserStore.commit(patch);
    else localStorage.setItem('ielts75-state-v1', JSON.stringify(next));
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
