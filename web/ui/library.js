/** library: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';
import { C, append, btn, el, host } from './dom.js';
import { render } from './navigation.js';
import { addSwipeCard } from './cards.js';

export function renderLibrary() {
  if (runtime.libraryCard) {
    const c = runtime.state.deck.cards.find((x) => x.id === runtime.libraryCard);
    if (c) {
      append(
        host,
        btn(
          '‹ 返回单词库',
          () => {
            runtime.libraryCard = null;
            render();
            window.scrollTo(0, 0);
          },
          'text-button back-library',
        ),
      );
      addSwipeCard(
        c,
        runtime.state.deck.cards
          .filter(
            (x) =>
              (!runtime.librarySentence ||
                C.sentenceNumbers(x).includes(Number(runtime.librarySentence))) &&
              x.word.toLowerCase().includes(runtime.libraryQuery.trim().toLowerCase()),
          )
          .sort((a, b) => a.order - b.order),
        'library',
      );
      return;
    }
    runtime.libraryCard = null;
  }
  append(host, el('h1', 'page-title', '单词库'));
  const filter = el('section', 'library-filter');
  const input = el('input');
  input.type = 'search';
  input.id = 'library-search';
  input.placeholder = '输入英文单词搜索';
  input.value = runtime.libraryQuery;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', '搜索英文单词');
  const select = el('select');
  select.id = 'sentence-filter';
  select.setAttribute('aria-label', '按分组筛选');
  const all = el('option', '', '全部分组');
  all.value = '';
  append(select, all);
  for (const i of C.sentenceProgress(runtime.state).map((group) => group.sentence)) {
    const count = runtime.state.deck.cards.filter((c) => C.sentenceNumbers(c).includes(i)).length;
    const o = el(
      'option',
      '',
      '分组 ' +
        String(i).padStart(2, '0') +
        ' · ' +
        count +
        '词' +
        (runtime.state.deck.cards
          .filter((c) => C.sentenceNumbers(c).includes(i))
          .every((c) => runtime.state.learned[c.id]) && count
          ? ' · 已学完'
          : ''),
    );
    o.value = String(i);
    append(select, o);
  }
  select.value = runtime.librarySentence;
  const count = el('p', 'muted');
  count.id = 'library-count';
  const list = el('div', 'word-list');
  list.id = 'library-list';
  function update() {
    const query = runtime.libraryQuery.trim().toLowerCase();
    const cards = runtime.state.deck.cards
      .filter(
        (c) =>
          (!runtime.librarySentence ||
            C.sentenceNumbers(c).includes(Number(runtime.librarySentence))) &&
          c.word.toLowerCase().includes(query),
      )
      .sort((a, b) => a.order - b.order);
    count.textContent =
      '共 ' + runtime.state.deck.cards.length + ' 个词 · 当前 ' + cards.length + ' 个';
    list.replaceChildren();
    if (!cards.length) {
      append(list, el('p', 'empty muted', '没有匹配的单词'));
      return;
    }
    for (const c of cards) {
      const b = btn(
        c.word,
        () => {
          runtime.libraryCard = c.id;
          render();
          window.scrollTo(0, 0);
        },
        'library-word',
      );
      b.lang = 'en';
      append(list, b);
    }
  }
  input.oninput = () => {
    runtime.libraryQuery = input.value;
    update();
  };
  select.onchange = () => {
    runtime.librarySentence = select.value;
    update();
  };
  append(filter, input, select);
  append(host, filter, count, list);
  update();
}
