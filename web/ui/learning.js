import { learnWithDrill } from '../domain/learning.js';
/** learning: see docs/architecture.md for responsibilities. */
import { runtime } from './runtime.js';
import { C, append, btn, el, host, toast } from './dom.js';
import { persist, rebuildQueue } from './state.js';
import { render, setTab } from './navigation.js';
import { addCard } from './cards.js';

export function renderLearningOptions() {
  const plan = runtime.state.learningPlan,
    remaining = runtime.state.deck.cards.filter((c) => !runtime.state.learned[c.id]);
  const details = el('details', 'learning-options');
  details.id = 'learning-options';
  details.open = false;
  append(
    details,
    el(
      'summary',
      '',
      '学习安排' +
        (plan
          ? ' · ' +
            (plan.scope === 'sentence'
              ? '分组 ' + String(plan.sentence).padStart(2, '0')
              : plan.ids.length + '个新词')
          : ' · 点击选择'),
    ),
  );
  const form = el('div', 'learning-form');
  const byCount = el('input');
  byCount.type = 'radio';
  byCount.name = 'learn-scope';
  byCount.value = 'count';
  byCount.checked = false;
  const count = el('input');
  count.type = 'number';
  count.id = 'learn-count';
  count.min = '1';
  count.max = String(remaining.length);
  count.inputMode = 'numeric';
  count.value = '';
  count.placeholder = '输入数量';
  count.setAttribute('aria-label', '新词数量');
  append(
    form,
    append(el('label', 'check-row'), byCount, el('span', '', '按数量学习')),
    append(el('div', 'inline-field'), el('span', '', '本次学习'), count, el('span', '', '个新词')),
  );
  const bySentence = el('input');
  bySentence.type = 'radio';
  bySentence.name = 'learn-scope';
  bySentence.value = 'sentence';
  bySentence.checked = false;
  const select = el('select');
  select.id = 'learn-sentence';
  select.setAttribute('aria-label', '选择新词分组');
  const counts = new Map();
  for (const c of remaining)
    for (const n of C.sentenceNumbers(c)) counts.set(n, (counts.get(n) || 0) + 1);
  const placeholder = el('option', '', '请选择分组');
  placeholder.value = '';
  append(select, placeholder);
  const statuses = new Map(C.sentenceProgress(runtime.state).map((x) => [x.sentence, x]));
  for (const n of [...statuses.keys()].sort((a, b) => a - b)) {
    const status = statuses.get(n);
    const o = el(
      'option',
      '',
      '分组 ' +
        String(n).padStart(2, '0') +
        ' · ' +
        (status?.complete ? '已学完' : '未学' + (counts.get(n) || 0) + '词'),
    );
    o.value = String(n);
    append(select, o);
  }
  select.value = '';
  append(
    form,
    append(el('label', 'check-row'), bySentence, el('span', '', '按分组学习')),
    select,
    el(
      'p',
      'muted learning-reminder',
      '按书本顺序学习，仅学习未标记学会的词；\n按分组会选择该组全部未学词。',
    ),
  );
  const start = btn(
    '开始本次学习',
    async () => {
      try {
        if (!byCount.checked && !bySentence.checked) throw Error('请先勾选学习方式。');
        if (runtime.state.learningPlan?.drill?.pending) throw Error('请先完成本次拼写复习。');
        const next = C.startLearningPlan(runtime.state, {
          scope: bySentence.checked ? 'sentence' : 'count',
          count: Number(count.value),
          sentence: Number(select.value),
        });
        if (await persist(next)) {
          rebuildQueue();
          render();
          window.scrollTo(0, 0);
          showLaunchAnimation();
        }
      } catch (e) {
        toast(e.message);
      }
    },
    'primary wide',
  );
  function update() {
    start.disabled =
      !remaining.length ||
      (!byCount.checked && !bySentence.checked) ||
      (byCount.checked &&
        (!Number.isSafeInteger(Number(count.value)) ||
          Number(count.value) < 1 ||
          Number(count.value) > remaining.length)) ||
      (bySentence.checked && !counts.get(Number(select.value)));
  }
  byCount.onchange = update;
  bySentence.onchange = update;
  count.onfocus = () => {
    byCount.checked = true;
    update();
  };
  count.oninput = () => {
    byCount.checked = true;
    update();
  };
  select.onfocus = () => {
    bySentence.checked = true;
    update();
  };
  select.onchange = () => {
    bySentence.checked = true;
    update();
  };
  update();
  append(form, start);
  append(details, form);
  append(host, details);
}

export function renderLearn() {
  const today = C.localDate(),
    learned = Object.keys(runtime.state.learned).length,
    todayN = C.learnedOn(runtime.state, today).length,
    percent = (learned / runtime.state.deck.cards.length) * 100;
  const stats = el('div', 'stats');
  append(
    stats,
    el(
      'span',
      '',
      '全书进度 ' +
        (percent === 0 ? '0' : percent < 1 ? percent.toFixed(2) : percent.toFixed(1)) +
        '%',
    ),
    el(
      'span',
      '',
      '今日已学 ' + todayN + ' · 累计 ' + learned + '/' + runtime.state.deck.cards.length,
    ),
  );
  const progress = el('progress');
  progress.max = runtime.state.deck.cards.length;
  progress.value = learned;
  progress.setAttribute('aria-label', '全书学习进度');
  append(host, stats, progress);
  renderLearningOptions();
  if (runtime.state.learningPlan?.startedByUser) {
    const p = runtime.state.learningPlan,
      done = p.ids.filter((id) => runtime.state.learned[id]).length;
    append(
      host,
      el(
        'p',
        'muted batch-progress',
        '本次已学 ' + done + '/' + p.ids.length + ' · 待学 ' + runtime.queue.length,
      ),
    );
  }
  if (!runtime.state.learningPlan?.startedByUser) {
    const preview = runtime.state.deck.cards.find((c) => !runtime.state.learned[c.id]);
    if (preview) {
      addCard(preview, host);
      const skip = btn('暂不熟悉', () => {}),
        learn = btn('学会了，下一个', () => {}, 'primary');
      skip.disabled = true;
      learn.disabled = true;
      append(host, append(el('div', 'actions'), skip, learn));
    }
    return;
  }
  if (runtime.state.learningPlan?.drill?.pending) {
    renderLearningDrill();
    return;
  }
  if (!runtime.queue.length) {
    append(
      host,
      append(
        el('div', 'panel empty'),
        el('h2', '', runtime.state.learningPlan ? '本次新词学完了' : '全书新词已学完'),
        el('p', '', '可以在上方选择下一次学习安排，或去复习已学单词。'),
        btn('去复习', () => setTab('review'), 'primary wide'),
      ),
    );
    return;
  }
  const c = runtime.state.deck.cards.find((x) => x.id === runtime.queue[0]);
  addCard(c, host);
  append(
    host,
    append(
      el('div', 'actions'),
      btn('暂不熟悉', async () => {
        if (runtime.queue.length > 1) {
          if (await persist(C.deferNewWord(runtime.state))) {
            rebuildQueue();
            render();
            window.scrollTo(0, 0);
          }
        } else toast('这是本次最后一个未学词，可以继续阅读后再标记。');
      }),
      btn(
        '学会了，下一个',
        async () => {
          if (await persist(learnWithDrill(runtime.state))) {
            rebuildQueue();
            render();
            window.scrollTo(0, 0);
          }
        },
        'primary',
      ),
    ),
  );
}

export function renderLearningDrill() {
  const drill = runtime.state.learningPlan.drill,
    p = drill.pending,
    primary = runtime.state.deck.cards.find((x) => x.id === p.ids[p.index]),
    card =
      runtime.state.learningPlan.scope === 'sentence'
        ? [primary, ...(primary.additionalSenses || [])].find(
            (x) => x.source.sentence === runtime.state.learningPlan.sentence,
          ) || primary
        : primary;
  const panel = el('section', 'panel');
  panel.id = 'learning-drill';
  append(
    panel,
    el('h2', '', '新词拼写复习'),
    el('p', 'muted', p.index + 1 + ' / ' + p.ids.length + (p.round ? ' · 错词再练' : '')),
    el('p', 'meaning', card.meaning),
  );
  const input = el('input', 'answer-input');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.autocapitalize = 'none';
  input.setAttribute('aria-label', '新词复习英文答案');
  const feedback = el('div');
  let submitted = false,
    ok = false;
  async function check() {
    if (submitted) return;
    submitted = true;
    ok = C.checkAnswer(input.value, card.spellingAnswers || [card.word]);
    const record = {
      id: primary.id,
      mode: 'spelling',
      correct: ok,
      date: C.localDate(),
      at: new Date().toISOString(),
      eventId: crypto.randomUUID(),
    };
    if (
      !(await persist({
        ...runtime.state,
        results: [...runtime.state.results, record].slice(-50000),
      }))
    ) {
      submitted = false;
      return;
    }
    input.disabled = true;
    submit.disabled = true;
    feedback.textContent = (ok ? '回答正确：' : '再记一次：') + card.word + ' · ' + card.meaning;
    next.disabled = false;
  }
  const submit = btn('提交拼写', check, 'primary wide'),
    next = btn(
      '继续',
      async () => {
        if (!submitted) return;
        const retry = ok ? [...p.retry] : [...p.retry, card.id];
        let pending = { ...p, index: p.index + 1, retry };
        if (pending.index >= p.ids.length)
          pending =
            retry.length && p.round < 2
              ? { ids: retry, index: 0, retry: [], round: p.round + 1 }
              : null;
        if (
          await persist({
            ...runtime.state,
            learningPlan: { ...runtime.state.learningPlan, drill: { ...drill, pending } },
          })
        ) {
          render();
          window.scrollTo(0, 0);
        }
      },
      'wide',
    );
  next.disabled = true;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') check();
  };
  append(panel, input, submit, feedback, next);
  append(host, panel);
}

export function showLaunchAnimation() {
  document.getElementById('launch-animation')?.remove();
  const overlay = el('div', 'launch-animation');
  overlay.id = 'launch-animation';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const text = el('strong', '', 'Are you ready?');
  const skip = btn('跳过', () => finish(), 'text-button');
  append(overlay, el('div', 'launch-spark', '✦'), text, skip);
  document.body.append(overlay);
  let timer1, timer2;
  function finish() {
    clearTimeout(timer1);
    clearTimeout(timer2);
    overlay.remove();
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer1 = setTimeout(
    () => {
      text.textContent = 'GO!';
      overlay.classList.add('go');
    },
    reduced ? 50 : 500,
  );
  timer2 = setTimeout(finish, reduced ? 150 : 1050);
}
