/** backup: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';
import { $, C, toast } from './dom.js';
import { persist, rebuildQueue } from './state.js';
import { render } from './navigation.js';
import { restoreScheduler } from '../domain/scheduler.js';
import {
  encryptBackup,
  decryptBackup,
  encryptedFormat,
  assertBackupFileSize,
} from '../domain/backup-crypto.js';
import { requestBackupPassword } from './backup-password.js';

let importing = false;

/** Import one active book. A different book requires explicit replacement confirmation. */
export async function importData(raw, kind) {
  if (importing) {
    toast('正在处理备份，请稍后再试。');
    return;
  }
  importing = true;
  try {
    assertBackupFileSize(raw);
    let data = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (data?.format === encryptedFormat) {
      if (kind !== 'restore') throw Error('这是完整备份，请使用“从备份恢复”。');
      const password = await requestBackupPassword();
      if (password === null) return;
      data = await decryptBackup(data, password);
    }
    let next;
    if (kind === 'restore') {
      next = restoreScheduler(C.importBackup(data));
      if (
        runtime.state &&
        !confirm('恢复备份将替换当前词库和学习记录。请先导出需要保留的记录。确认继续？')
      )
        return;
    } else {
      C.validateDeck(data);
      if (!runtime.state || runtime.state.deck.bookId !== data.bookId) {
        if (
          runtime.state &&
          !confirm('导入不同词库将替换当前词库和学习记录。请先导出需要保留的记录。确认继续？')
        )
          return;
        next = C.emptyState(data);
      } else {
        const merged = C.mergeDeck(runtime.state, data);
        if (
          !confirm(
            `更新当前词库：新增${merged.added}个词，更新${merged.updated}个词。学习记录保留。确认继续？`,
          )
        )
          return;
        next = merged.state;
      }
    }
    if (await persist(next, true, { replace: kind === 'restore' })) {
      runtime.session = null;
      rebuildQueue();
      render();
      toast(kind === 'restore' ? '备份已恢复，本地记录已保存' : '词库已导入并保存到本地');
    }
  } catch (error) {
    toast('导入失败：' + error.message);
  } finally {
    importing = false;
  }
}

export function requestImport(kind) {
  runtime.importKind = kind;
  if (window.AndroidStore) window.AndroidStore.importFile(kind);
  else {
    $('file-picker').value = '';
    $('file-picker').click();
  }
}

export function exportBackup() {
  const raw = JSON.stringify(C.exportBackup(runtime.state), null, 2);
  const name = '词记-完整备份-' + C.localDate() + '.json';
  downloadBackup(raw, name);
}

export async function exportEncryptedBackup() {
  const password = await requestBackupPassword({ confirmPassword: true });
  if (password === null) return;
  toast('正在加密备份…');
  const envelope = await encryptBackup(C.exportBackup(runtime.state), password);
  downloadBackup(JSON.stringify(envelope), '词记-加密备份-' + C.localDate() + '.json');
  toast('加密备份已交给文件保存器，请妥善保存密码。');
}

function downloadBackup(raw, name) {
  assertBackupFileSize(raw);
  if (window.AndroidStore) window.AndroidStore.exportFile(raw, name);
  else {
    const a = document.createElement('a');
    const u = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
}

export async function updateBundledDeck() {
  try {
    const response = await fetch('deck.json');
    if (!response.ok) return;
    const raw = await response.json();
    if (!raw.cards?.length) return;
    const bundled = C.validateDeck(raw);
    if (runtime.state.deck.bookId !== bundled.bookId) return;
    if (
      runtime.state.deck.revision === bundled.revision ||
      runtime.state.bundledRevision === bundled.revision
    )
      return;
    const merged = C.mergeDeck(runtime.state, bundled);
    if (window.AndroidStore) {
      if (!window.AndroidStore.protectCurrent || !window.AndroidStore.protectCurrent()) {
        toast('当前记录校验未通过，保留当前词库和学习记录。');
        return;
      }
    }
    if (await persist({ ...merged.state, bundledRevision: bundled.revision }))
      toast('内置词库已更新，原有学习和复习记录已保留。');
  } catch (e) {
    toast('内置词库更新失败，已保留当前记录：' + e.message);
  }
}
