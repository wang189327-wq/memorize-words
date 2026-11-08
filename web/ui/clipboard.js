/** Copy plain text from an explicit user action. Native clipboard avoids WebView permission differences. */
import { append, btn, el, toast } from './dom.js';

/** Preserve source order and exactly one output line per word. */
export function formatWordList(cards, { numbered = false, meanings = false } = {}) {
  const line = (value) =>
    String(value || '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
  return cards
    .map(
      (card, index) =>
        (numbered ? `${index + 1}. ` : '') +
        line(card.word) +
        (meanings ? ' — ' + line(card.meaning) : ''),
    )
    .join('\n');
}

export function openWordCopy(cards) {
  if (document.getElementById('word-copy-dialog')) return;
  const dialog = el('dialog'),
    title = el('h2', '', '复制当日单词');
  dialog.id = 'word-copy-dialog';
  title.id = 'word-copy-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const numbered = el('input'),
    meanings = el('input');
  numbered.type = meanings.type = 'checkbox';
  append(
    dialog,
    title,
    el('p', 'muted', '按书本顺序，一行一个单词。'),
    append(el('label', 'check-row'), numbered, el('span', '', '添加序号')),
    append(el('label', 'check-row'), meanings, el('span', '', '包含中文释义')),
    append(
      el('div', 'actions'),
      btn(
        '复制',
        async () => {
          await copyText(
            formatWordList(cards, { numbered: numbered.checked, meanings: meanings.checked }),
          );
          dialog.close();
          dialog.remove();
          toast('已复制 ' + cards.length + ' 个单词，一行一个。');
        },
        'primary',
      ),
      btn('取消', () => {
        dialog.close();
        dialog.remove();
      }),
    ),
  );
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export async function copyText(text) {
  if (!text) throw Error('没有可复制的单词。');
  if (window.AndroidStore?.copyText) {
    if (!window.AndroidStore.copyText(text))
      throw Error('复制失败，请检查系统剪贴板或减少单词数量。');
    return;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* Try the user-gesture fallback below. */
    }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-10000px;top:0';
  // A modal dialog makes the rest of the document inert; keep fallback selection inside it.
  (document.querySelector('dialog[open]') || document.body).append(field);
  field.focus();
  field.select();
  try {
    if (!document.execCommand('copy')) throw Error('浏览器未允许复制，请检查剪贴板权限。');
  } finally {
    field.remove();
  }
}
