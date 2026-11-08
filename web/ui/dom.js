/** dom: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';

export const C = window.WordMemo,
  $ = (id) => document.getElementById(id),
  host = $('content');

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function btn(text, action, cls = '') {
  const b = el('button', cls, text);
  b.onclick = async (event) => {
    if (b.dataset.pending) return;
    try {
      b.dataset.pending = 'true';
      await action(event);
    } catch (error) {
      toast(error.message);
    } finally {
      delete b.dataset.pending;
    }
  };
  return b;
}

export function append(parent, ...children) {
  children.filter((x) => x !== null && x !== undefined).forEach((x) => parent.append(x));
  return parent;
}

export function toast(t) {
  $('toast').textContent = t;
  $('toast').classList.add('show');
  clearTimeout(runtime.toastTimer);
  runtime.toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4500);
}
