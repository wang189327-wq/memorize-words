/** navigation: see docs/architecture.md for responsibilities. */
import { $, host, toast } from './dom.js';
import { runtime } from './runtime.js';
import { renderEmptyBook, renderSettings, renderStorageChoice } from './settings.js';
import { renderLearn } from './learning.js';
import { renderLibrary } from './library.js';
import { renderQuestion, renderReview } from './review.js';

export function finishApp() {
  if (window.AndroidStore?.exitApp) window.AndroidStore.exitApp();
  else toast('可以关闭此页面了。');
}

export function setTab(t) {
  if (runtime.saving) {
    toast('正在保存，请稍后再试。');
    return;
  }
  if (t === runtime.tab) return;
  if (
    runtime.session &&
    runtime.session.index < runtime.session.questions.length &&
    !confirm('本轮复习尚未结束，已提交的结果会保留。离开本轮？')
  )
    return;
  runtime.session = null;
  runtime.tab = t;
  if (t !== 'library') runtime.libraryCard = null;
  if (t !== 'review') {
    runtime.historyDate = '';
    runtime.historyCard = null;
  }
  render();
  window.scrollTo(0, 0);
}

export function render() {
  for (const name of ['learn', 'review', 'library', 'settings']) {
    $('tab-' + name).classList.toggle('active', runtime.tab === name);
    $('tab-' + name).setAttribute('aria-current', runtime.tab === name ? 'page' : 'false');
  }
  host.replaceChildren();
  if (!runtime.storageMode) {
    renderStorageChoice();
    return;
  }
  if (!runtime.state) {
    renderEmptyBook();
    return;
  }
  if (runtime.tab === 'learn') renderLearn();
  else if (runtime.tab === 'library') renderLibrary();
  else if (runtime.tab === 'settings') renderSettings();
  else if (runtime.session) renderQuestion();
  else renderReview();
}
