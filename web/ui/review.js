/** review: see docs/architecture.md for responsibilities. */
import { C, append, btn, el, host, toast } from './dom.js';
import { runtime } from './runtime.js';
import { render } from './navigation.js';
import { addSwipeCard, favoriteButton, sourceText, speak } from './cards.js';
import { persist } from './state.js';

export const names = {
  meaning: '看词回忆词义',
  spelling: '中文回忆拼写',
  cloze: '句子填空',
  conversion: '词性转换',
};

export function renderHistoryDay() {
  const cards = C.learnedOn(runtime.state, runtime.historyDate);
  if (runtime.historyCard) {
    const c = cards.find((c) => c.id === runtime.historyCard);
    if (c) {
      append(
        host,
        btn(
          '‹ 返回当日单词',
          () => {
            runtime.historyCard = null;
            render();
            window.scrollTo(0, 0);
          },
          'text-button back-library',
        ),
      );
      addSwipeCard(c, cards, 'history');
      return;
    }
    runtime.historyCard = null;
  }
  append(
    host,
    btn(
      '‹ 返回学习记录',
      () => {
        runtime.historyDate = '';
        runtime.historyCard = null;
        render();
        window.scrollTo(0, 0);
      },
      'text-button back-library',
    ),
    el('h1', 'page-title', runtime.historyDate + ' 学习的单词'),
    el('p', 'muted', '共 ' + cards.length + ' 个新词 · 按书本顺序'),
  );
  const list = el('div', 'word-list');
  list.id = 'history-word-list';
  for (const c of cards) {
    const b = btn(
      c.word,
      () => {
        runtime.historyCard = c.id;
        render();
        window.scrollTo(0, 0);
      },
      'library-word',
    );
    b.lang = 'en';
    append(list, b);
  }
  if (!cards.length) append(list, el('p', 'muted', '该日期暂无已学词。'));
  append(host, list);
}

export function renderReview() {
  if (runtime.historyDate) {
    renderHistoryDay();
    return;
  }
  const total = Object.keys(runtime.state.learned).length,
    favoriteTotal = C.favoriteWords(runtime.state).length;
  const panel = el('section', 'panel');
  append(
    panel,
    el('h2', '', '按自己的节奏复习'),
    el(
      'p',
      'muted',
      '已学 ' + total + ' 个词 · 收藏 ' + favoriteTotal + ' 个词 · 单选或多选练习方式',
    ),
  );
  append(panel, el('div', 'subheading', '练习方式'));
  const hints = {
    meaning: '先回忆中文，再翻答案自评',
    spelling: '根据中文释义输入英文',
    cloze: '在英文例句中补全单词',
    conversion: '练习词族中的名词、动词等转换',
  };
  C.MODES.forEach((mode) => {
    const label = el('label', 'check-row');
    const input = el('input');
    input.type = 'checkbox';
    input.value = mode;
    input.name = 'mode';
    input.checked = runtime.reviewOptions.modes.includes(mode);
    input.onchange = () => {
      runtime.reviewOptions.modes = [...panel.querySelectorAll('input[name=mode]:checked')].map(
        (x) => x.value,
      );
    };
    append(
      label,
      input,
      append(el('span'), document.createTextNode(names[mode]), el('small', '', hints[mode])),
    );
    append(panel, label);
  });
  append(panel, el('div', 'subheading', '选择复习范围'));
  const all = el('input');
  all.type = 'radio';
  all.name = 'scope';
  all.value = 'all';
  all.checked = runtime.reviewOptions.scope === 'all';
  append(panel, append(el('label', 'check-row'), all, el('span', '', '从全部已学词中随机抽取')));
  const count = el('input');
  count.type = 'number';
  count.id = 'review-count';
  count.min = '1';
  count.max = String(total);
  count.inputMode = 'numeric';
  count.value = String(Math.min(runtime.reviewOptions.count, total) || 1);
  count.oninput = () => (runtime.reviewOptions.count = Number(count.value));
  append(
    panel,
    append(
      el('div', 'inline-field'),
      el('span', '', '随机复习'),
      count,
      el('span', '', '个词（不重复）'),
    ),
  );
  const byDate = el('input');
  byDate.type = 'radio';
  byDate.name = 'scope';
  byDate.value = 'date';
  byDate.checked = runtime.reviewOptions.scope === 'date';
  append(panel, append(el('label', 'check-row'), byDate, el('span', '', '只复习某日学习的单词')));
  const select = el('select');
  select.id = 'review-date';
  select.setAttribute('aria-label', '学习日期');
  const dates = [...new Set(Object.values(runtime.state.learned).map((r) => r.date))]
    .sort()
    .reverse();
  dates.forEach((d) => {
    const o = el(
      'option',
      '',
      d + ' · ' + Object.values(runtime.state.learned).filter((r) => r.date === d).length + '词',
    );
    o.value = d;
    append(select, o);
  });
  if (!dates.length) append(select, el('option', '', '暂无学习记录'));
  if (dates.includes(runtime.reviewOptions.date)) select.value = runtime.reviewOptions.date;
  select.onchange = () => (runtime.reviewOptions.date = select.value);
  append(panel, select);
  const favorites = el('input');
  favorites.type = 'radio';
  favorites.name = 'scope';
  favorites.value = 'favorites';
  favorites.checked = runtime.reviewOptions.scope === 'favorites';
  append(
    panel,
    append(el('label', 'check-row'), favorites, el('span', '', '从收藏单词中随机抽取')),
  );
  const favoriteCount = el('input');
  favoriteCount.type = 'number';
  favoriteCount.id = 'favorite-count';
  favoriteCount.min = '1';
  favoriteCount.max = String(favoriteTotal);
  favoriteCount.inputMode = 'numeric';
  favoriteCount.setAttribute('aria-label', '收藏随机复习数量');
  favoriteCount.value = String(Math.min(runtime.reviewOptions.favoriteCount, favoriteTotal) || 1);
  favoriteCount.oninput = () => (runtime.reviewOptions.favoriteCount = Number(favoriteCount.value));
  append(
    panel,
    append(
      el('div', 'inline-field'),
      el('span', '', '随机复习'),
      favoriteCount,
      el('span', '', '个收藏词（不重复）'),
    ),
  );
  const favoriteRange = el('input');
  favoriteRange.type = 'radio';
  favoriteRange.name = 'scope';
  favoriteRange.value = 'favorites-range';
  favoriteRange.checked = runtime.reviewOptions.scope === 'favorites-range';
  append(
    panel,
    append(el('label', 'check-row'), favoriteRange, el('span', '', '按起止英文单词复习收藏词')),
  );
  const range = el('div', 'favorite-range'),
    suggestions = el('datalist');
  suggestions.id = 'favorite-word-options';
  for (const c of C.favoriteWords(runtime.state)) {
    const option = el('option');
    option.value = c.word;
    append(suggestions, option);
  }
  function wordInput(id, label, value) {
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.placeholder = label;
    input.value = value;
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.setAttribute('aria-label', label);
    input.setAttribute('list', suggestions.id);
    return input;
  }
  const fromWord = wordInput('favorite-from', '起始英文单词', runtime.reviewOptions.fromWord),
    toWord = wordInput('favorite-to', '结束英文单词', runtime.reviewOptions.toWord);
  fromWord.oninput = () => (runtime.reviewOptions.fromWord = fromWord.value);
  toWord.oninput = () => (runtime.reviewOptions.toWord = toWord.value);
  append(range, fromWord, el('span', '', '至'), toWord);
  append(
    panel,
    range,
    suggestions,
    el(
      'p',
      'muted',
      '按书本顺序，仅复习已收藏词，包含起止词；未学词也可收藏复习。收藏自动保存本地，云账号点击“同步进度”可同步收藏。',
    ),
  );
  const start = btn(
    '开始复习',
    () => {
      try {
        const cards = C.selectWords(runtime.state, {
          scope: runtime.reviewOptions.scope,
          count: Number(favorites.checked ? favoriteCount.value : count.value),
          date: select.value,
          fromWord: fromWord.value,
          toWord: toWord.value,
        });
        const built = C.buildQuestions(cards, runtime.reviewOptions.modes);
        runtime.session = {
          ...built,
          index: 0,
          wordCount: cards.length,
          answers: [],
          revealed: false,
        };
        render();
        window.scrollTo(0, 0);
      } catch (e) {
        toast(e.message);
      }
    },
    'primary wide',
  );
  function updateScope() {
    runtime.reviewOptions.scope = panel.querySelector('input[name=scope]:checked').value;
    count.disabled = !all.checked;
    select.disabled = !byDate.checked;
    favoriteCount.disabled = !favorites.checked;
    fromWord.disabled = toWord.disabled = !favoriteRange.checked;
    start.disabled = favorites.checked || favoriteRange.checked ? favoriteTotal === 0 : total === 0;
  }
  for (const radio of [all, byDate, favorites, favoriteRange]) radio.onchange = updateScope;
  updateScope();
  append(panel, start);
  if (!total && !favoriteTotal)
    append(panel, el('div', 'notice', '标记学会的单词或收藏单词后，即可选择对应范围复习。'));
  append(
    panel,
    el('p', 'muted', '多选会对每个词依次练习所选题型。不适用的填空或词性转换题会跳过并说明。'),
  );
  append(host, panel);
  const recent = el('section', 'panel');
  append(recent, el('h2', '', '学习记录'));
  dates.forEach((d) =>
    append(
      recent,
      btn(
        d + ' · ' + C.learnedOn(runtime.state, d).length + ' 个新词 ›',
        () => {
          runtime.historyDate = d;
          runtime.historyCard = null;
          render();
          window.scrollTo(0, 0);
        },
        'wide history-day',
      ),
    ),
  );
  if (!dates.length) append(recent, el('p', 'muted', '学过的每个词会记录首次学习日期。'));
  const r = runtime.state.results.filter((x) => x.date === C.localDate());
  if (r.length)
    append(
      recent,
      el(
        'p',
        'muted',
        '今日已提交 ' +
          r.length +
          ' 题，其中答对／自评记得 ' +
          r.filter((x) => x.correct).length +
          ' 题',
      ),
    );
  append(host, recent);
}

export function renderQuestion() {
  if (runtime.session.index >= runtime.session.questions.length) {
    renderResults();
    return;
  }
  const q = runtime.session.questions[runtime.session.index],
    c = C.questionCard(runtime.state.deck, q);
  const line = el('div', 'row');
  append(
    line,
    el('span', 'eyebrow', names[q.mode]),
    btn(
      '结束本轮',
      () => {
        if (confirm('结束本轮？已提交结果会保留。')) {
          runtime.session = null;
          render();
        }
      },
      'text-button',
    ),
  );
  append(
    host,
    line,
    el(
      'div',
      'stats',
      runtime.session.index +
        1 +
        ' / ' +
        runtime.session.questions.length +
        ' 题 · ' +
        runtime.session.wordCount +
        ' 个词',
    ),
  );
  const prog = el('progress');
  prog.max = runtime.session.questions.length;
  prog.value = runtime.session.index;
  append(host, prog);
  const skip = runtime.session.skipped.conversion + runtime.session.skipped.cloze;
  if (skip)
    append(
      host,
      el(
        'div',
        'notice',
        '已跳过 ' +
          runtime.session.skipped.conversion +
          ' 道不适用的词性转换题、' +
          runtime.session.skipped.cloze +
          ' 道不适用的填空题。',
      ),
    );
  const panel = el('section', 'panel');
  append(
    panel,
    append(el('div', 'card-heading'), el('div', 'eyebrow', sourceText(c)), favoriteButton(c)),
    el('div', 'quiz-prompt' + (q.mode === 'meaning' ? ' word-prompt' : ''), q.prompt),
  );
  if (q.selfGrade) {
    append(panel, el('p', 'muted', '先在心里说出意思，再查看答案。'));
    if (!runtime.session.revealed)
      append(
        panel,
        btn(
          '查看答案',
          () => {
            runtime.session.revealed = true;
            render();
          },
          'primary wide',
        ),
      );
    else {
      append(
        panel,
        append(el('div', 'answer-box'), el('strong', '', c.meaning), el('p', '', c.definition)),
        append(
          el('div', 'actions'),
          btn('没记住', () => submitResult(false)),
          btn('记得', () => submitResult(true), 'primary'),
        ),
      );
    }
  } else if (!runtime.session.revealed) {
    const input = el('input', 'answer-input');
    input.type = 'text';
    input.id = 'answer';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.placeholder = '输入英文答案';
    input.setAttribute('aria-label', '英文答案');
    append(panel, input);
    const check = async () => {
      if (!input.value.trim()) {
        toast('请输入答案，或点击“不会，查看答案”。');
        return;
      }
      runtime.session.userAnswer = input.value;
      runtime.session.correct = C.checkAnswer(input.value, q.answers);
      if (!(await recordResult(runtime.session.correct))) return;
      runtime.session.revealed = true;
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') check();
    };
    append(
      panel,
      btn('提交答案', check, 'primary wide'),
      btn(
        '不会，查看答案',
        async () => {
          runtime.session.userAnswer = '（未作答）';
          runtime.session.correct = false;
          if (!(await recordResult(false))) return;
          runtime.session.revealed = true;
          render();
        },
        'wide',
      ),
    );
  } else {
    const box = el('div', 'answer-box' + (runtime.session.correct ? '' : ' wrong'));
    append(
      box,
      el('strong', '', runtime.session.correct ? '回答正确' : '再记一次'),
      el('p', '', '你的答案：' + runtime.session.userAnswer),
      el('p', '', '参考答案：' + q.answers.join(' / ')),
      el('p', '', c.meaning),
      el('p', '', c.example),
      el('p', 'translation', c.exampleZh),
    );
    append(
      panel,
      box,
      btn('▶ 听读单词', () => speak(c.word, 'en-GB'), 'audio'),
      btn('下一题', () => submitResult(runtime.session.correct), 'primary wide'),
    );
  }
  append(host, panel);
}

export async function recordResult(correct) {
  if (runtime.session.recorded) return true;
  if (runtime.session.recording) return false;
  runtime.session.recording = true;
  const q = runtime.session.questions[runtime.session.index];
  const r = {
    id: q.id,
    mode: q.mode,
    correct: !!correct,
    date: C.localDate(),
    at: new Date().toISOString(),
    eventId: crypto.randomUUID(),
  };
  if (
    !(await persist({ ...runtime.state, results: [...runtime.state.results, r].slice(-50000) }))
  ) {
    runtime.session.recording = false;
    return false;
  }
  runtime.session.recording = false;
  runtime.session.answers.push({ ...r, prompt: q.prompt, answer: q.answers.join(' / ') });
  runtime.session.recorded = true;
  return true;
}

export async function submitResult(correct) {
  if (!(await recordResult(correct))) return;
  runtime.session.index++;
  runtime.session.recorded = false;
  runtime.session.revealed = false;
  runtime.session.userAnswer = '';
  render();
  window.scrollTo(0, 0);
}

export function renderResults() {
  const answers = runtime.session.answers,
    correct = answers.filter((x) => x.correct).length,
    wrong = answers.filter((x) => !x.correct);
  const panel = el('section', 'panel');
  append(
    panel,
    el('h2', '', '本轮复习完成'),
    append(
      el('div', 'result-grid'),
      append(el('div'), el('b', '', String(answers.length)), el('small', '', '完成题数')),
      append(el('div'), el('b', '', String(correct)), el('small', '', '答对／自评记得')),
    ),
    el('p', 'muted', '已自动保存到本机。词义回忆题采用你的自评结果。'),
  );
  if (wrong.length) {
    append(panel, el('div', 'subheading', '本轮需要再记的内容'));
    wrong.forEach((r) => {
      const c = runtime.state.deck.cards.find((x) => x.id === r.id);
      append(
        panel,
        append(
          el('div', 'wrong-row'),
          el('b', '', c.word + ' · ' + names[r.mode]),
          el('p', '', r.answer),
        ),
      );
    });
  } else append(panel, el('div', 'notice', '本轮全部答对／自评记得，之后仍可以再次复习。'));
  append(
    panel,
    btn(
      '返回复习设置',
      () => {
        runtime.session = null;
        render();
      },
      'primary wide',
    ),
  );
  append(host, panel);
}
