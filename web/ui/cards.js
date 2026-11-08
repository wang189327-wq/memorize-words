/** cards: see docs/architecture.md for responsibilities. */
import { C, append, btn, el, host, toast } from './dom.js';
import { persist } from './state.js';
import { runtime } from './runtime.js';
import { render } from './navigation.js';

export function speak(text, locale) {
  if (window.AndroidStore) window.AndroidStore.speak(text, locale);
  else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    u.rate = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } else toast('设备没有可用语音，请检查语音设置。');
}

export function section(title, ...nodes) {
  return append(el('section', 'section'), el('h3', '', title), ...nodes);
}

export function richExample(text, word) {
  const p = el('p', 'example'),
    i = text.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) {
    p.textContent = text;
    return p;
  }
  append(
    p,
    document.createTextNode(text.slice(0, i)),
    el('strong', '', text.slice(i, i + word.length)),
    document.createTextNode(text.slice(i + word.length)),
  );
  return p;
}

export function sourceText(card) {
  const labels = ['分组 ' + card.source.sentence];
  if (card.source.printedPage) labels.push('第' + card.source.printedPage + '页');
  return labels.join(' · ');
}
export function cleanNote(text) {
  return String(text || '').trim();
}
export function addSupplement(c, parent) {
  const s = c.supplementary || {},
    text = s.morphology?.text?.trim(),
    family = s.family || [],
    note = cleanNote(s.notes),
    formation = s.wordFormationNote?.trim();
  if (!text && !family.length && !note && !formation) return;
  const details = el('details', 'vocabulary-extension');
  details.open = true;
  append(details, el('summary', '', '词汇拓展'));
  const body = el('div', 'supplement');
  if (text) {
    const block = el('section', 'extension-section');
    append(block, el('h3', '', '词根词缀'));
    for (const line of text.split('\n'))
      if (line.trim()) append(block, el('p', 'morphology-text', line));
    append(body, block);
  }
  if (family.length) {
    const block = el('section', 'extension-section');
    append(block, el('h3', '', 'Word Family'));
    family.forEach((f) => append(block, el('p', '', f.word + '  ' + f.pos + '  ' + f.meaning)));
    append(body, block);
  }
  if (note || formation) {
    const block = el('section', 'extension-section');
    append(block, el('h3', '', '用法与构词补充'));
    if (note) append(block, el('p', '', note));
    if (formation) append(block, el('p', '', formation));
    append(body, block);
  }
  append(details, body);
  append(parent, details);
}

export function favoriteButton(c) {
  const star = btn(
    '',
    async () => {
      if (await persist(C.toggleFavorite(runtime.state, c.id))) {
        refresh();
        toast(runtime.state.favorites?.[c.id] ? '已收藏' : '已取消收藏');
      }
    },
    'favorite-star',
  );
  function refresh() {
    const active = !!runtime.state.favorites?.[c.id];
    star.textContent = active ? '★' : '☆';
    star.classList.toggle('is-favorite', active);
    star.setAttribute('aria-label', active ? '取消收藏' : '收藏单词');
    star.setAttribute('aria-pressed', String(active));
    star.title = active ? '取消收藏' : '收藏单词';
  }
  refresh();
  return star;
}

export function addSingleCard(c, parent) {
  const card = el('article', 'card');
  append(
    card,
    append(
      el('div', 'card-heading'),
      el('div', 'eyebrow', '分组 ' + String(c.source.sentence).padStart(2, '0')),
      favoriteButton(c),
    ),
  );
  append(card, append(el('div', 'word-row'), el('h2', 'word', c.word)));
  append(
    card,
    append(
      el('div', 'audio-row'),
      btn('▶ 英音', () => speak(c.word, 'en-GB'), 'audio'),
      btn('▶ 美音', () => speak(c.word, 'en-US'), 'audio'),
    ),
  );
  append(
    card,
    section(
      'Chinese Meaning',
      append(
        el('p', 'meaning'),
        el('span', 'meaning-pos', c.pos + ' '),
        el('span', 'meaning-text', c.meaning),
      ),
    ),
    section('English Definition', el('p', '', c.definition)),
    section(
      'Example',
      richExample(c.example, c.word),
      el('p', 'translation', c.exampleZh),
      btn('▶ 朗读例句', () => speak(c.example, 'en-GB'), 'audio'),
    ),
  );
  const coll = section('Key Collocations');
  c.collocations.forEach((x) =>
    append(coll, append(el('div', 'collocation'), el('span', '', x.en), el('span', '', x.zh))),
  );
  append(card, coll);
  append(parent, card);
  addSupplement(c, parent);
}

export function addCard(c, parent) {
  const senses = [c, ...(c.additionalSenses || [])];
  if (senses.length === 1) {
    addSingleCard(c, parent);
    return;
  }
  const wrap = el('div');
  append(parent, wrap);
  const select = el('select');
  select.setAttribute('aria-label', '选择词义和句子');
  senses.forEach((sense, i) => {
    const option = el(
      'option',
      '',
      '分组 ' +
        String(sense.source.sentence).padStart(2, '0') +
        ' · ' +
        sense.pos +
        ' · ' +
        sense.meaning,
    );
    option.value = String(i);
    append(select, option);
  });
  const wanted =
    runtime.tab === 'library'
      ? Number(runtime.librarySentence)
      : runtime.tab === 'learn' && runtime.state.learningPlan?.scope === 'sentence'
        ? runtime.state.learningPlan.sentence
        : 0;
  const selected = wanted ? senses.findIndex((x) => x.source.sentence === wanted) : 0;
  select.value = String(Math.max(selected, 0));
  const body = el('div');
  append(wrap, select, body);
  function update() {
    body.replaceChildren();
    addSingleCard(senses[Number(select.value)], body);
  }
  select.onchange = update;
  update();
}

export function addSwipeCard(c, cards, kind) {
  const body = el('div', 'swipe-card');
  body.style.touchAction = 'pan-y';
  append(host, body);
  addCard(c, body);
  const index = cards.findIndex((x) => x.id === c.id);
  function move(delta) {
    const next = cards[index + delta];
    if (!next) {
      toast(delta < 0 ? '已是第一个词' : '已是最后一个词');
      return;
    }
    if (kind === 'library') runtime.libraryCard = next.id;
    else runtime.historyCard = next.id;
    render();
    window.scrollTo(0, 0);
  }
  append(
    body,
    append(
      el('div', 'actions'),
      btn('上一个', () => move(-1)),
      el('span', '', String(index + 1) + ' / ' + cards.length),
      btn('下一个', () => move(1)),
    ),
  );
  let start = null;
  body.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || e.target.closest('input,select,button,a')) {
        start = null;
        return;
      }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  body.addEventListener(
    'touchend',
    (e) => {
      if (!start) return;
      const point = e.changedTouches[0],
        dx = point.clientX - start.x,
        dy = point.clientY - start.y;
      start = null;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) move(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
  body.addEventListener('touchcancel', () => (start = null), { passive: true });
}
