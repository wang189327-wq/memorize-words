(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordMemo = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODES = ['meaning', 'spelling', 'cloze', 'conversion'];
  function fail(message) {
    throw new Error(message);
  }
  function validId(id) {
    return (
      typeof id === 'string' &&
      /^[a-zA-Z0-9_-]{1,200}$/.test(id) &&
      !Object.prototype.hasOwnProperty.call(Object.prototype, id) &&
      id !== 'prototype'
    );
  }
  function plain(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }
  function string(x, n = 20000) {
    return typeof x === 'string' && x.length <= n;
  }
  function dateOK(x) {
    return (
      typeof x === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      !isNaN(Date.parse(x + 'T12:00:00Z')) &&
      new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x
    );
  }
  function localDate(d = new Date()) {
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }
  function validateDeck(d) {
    if (
      !plain(d) ||
      d.schemaVersion !== 1 ||
      !string(d.bookId, 100) ||
      !d.bookId ||
      !string(d.title, 500) ||
      !d.title ||
      !Array.isArray(d.cards) ||
      !d.cards.length ||
      d.cards.length > 20000
    )
      fail('词库格式错误：需要 schemaVersion=1、bookId、title 和非空 cards。');
    const ids = new Set(),
      words = new Set(),
      orders = new Set();
    for (const c of d.cards) {
      if (!plain(c) || !validId(c.id) || ids.has(c.id)) fail('词条ID缺失、格式错误或重复。');
      ids.add(c.id);
      for (const k of ['word', 'pos', 'meaning', 'definition', 'example', 'exampleZh'])
        if (!string(c[k]) || !c[k].trim()) fail('词条缺少字段：' + k);
      if (c.word.length > 200 || words.has(c.word.toLowerCase())) fail('词条拼写重复或过长。');
      words.add(c.word.toLowerCase());
      if (
        c.spellingAnswers !== undefined &&
        (!Array.isArray(c.spellingAnswers) ||
          !c.spellingAnswers.length ||
          c.spellingAnswers.length > 20 ||
          c.spellingAnswers.some((a) => !string(a, 500) || !a.trim()))
      )
        fail('拼写答案变体格式错误。');
      if (!Number.isSafeInteger(c.order) || c.order < 1 || orders.has(c.order))
        fail('原书顺序编号无效或重复。');
      orders.add(c.order);
      if (
        !plain(c.source) ||
        !Number.isSafeInteger(c.source.sentence) ||
        c.source.sentence < 1 ||
        c.source.sentence > 1000000 ||
        ['readerPage', 'printedPage'].some(
          (key) =>
            c.source[key] !== undefined &&
            (!Number.isSafeInteger(c.source[key]) || c.source[key] < 1),
        )
      )
        fail('缺少有效分组编号，或可选来源页码格式错误。');
      if (
        c.sources !== undefined &&
        (!Array.isArray(c.sources) ||
          c.sources.length > 1000 ||
          c.sources.some(
            (x) =>
              !plain(x) ||
              !Number.isSafeInteger(x.sentence) ||
              x.sentence < 1 ||
              x.sentence > 1000000 ||
              (x.readerPage !== undefined && !Number.isSafeInteger(x.readerPage)) ||
              (x.printedPage !== undefined && !Number.isSafeInteger(x.printedPage)),
          ))
      )
        fail('多句来源格式错误。');
      if (c.additionalSenses !== undefined) {
        if (!Array.isArray(c.additionalSenses) || c.additionalSenses.length > 1000)
          fail('多义项格式错误。');
        for (const sense of c.additionalSenses) {
          if (
            !plain(sense) ||
            sense.additionalSenses !== undefined ||
            sense.id !== c.id ||
            sense.word !== c.word ||
            sense.order !== c.order
          )
            fail('多义项与主词不一致。');
          validateDeck({ ...d, cards: [sense] });
        }
      }
      for (const k of ['ipaUK', 'ipaUS'])
        if (c[k] !== undefined && !string(c[k], 500)) fail('音标格式错误。');
      if (
        !Array.isArray(c.collocations) ||
        c.collocations.length > 100 ||
        c.collocations.some((x) => !plain(x) || !string(x.en, 1000) || !string(x.zh, 1000))
      )
        fail('搭配格式错误。');
      if (c.supplementary !== undefined) {
        let s = c.supplementary;
        if (
          !plain(s) ||
          !string(s.notes || '') ||
          !Array.isArray(s.family) ||
          s.family.some(
            (x) =>
              !plain(x) || !string(x.word, 200) || !string(x.pos, 100) || !string(x.meaning, 1000),
          )
        )
          fail('补充区格式错误。');
        if (
          s.sentence &&
          (!plain(s.sentence) || !string(s.sentence.text) || !string(s.sentence.translation))
        )
          fail('原句格式错误。');
        if (
          s.morphology !== undefined &&
          (!plain(s.morphology) ||
            !string(s.morphology.text, 6000) ||
            !s.morphology.text.trim() ||
            !['root', 'derivation', 'phrase-component'].includes(s.morphology.kind))
        )
          fail('词根词缀格式错误。');
      }
      for (const k of ['cloze', 'conversion'])
        if (c[k] !== undefined) {
          const q = c[k];
          if (
            !plain(q) ||
            !string(q.prompt) ||
            !q.prompt.trim() ||
            !Array.isArray(q.answers) ||
            !q.answers.length ||
            q.answers.length > 20 ||
            q.answers.some((a) => !string(a, 500) || !a.trim())
          )
            fail('题目或答案无效：' + k);
        }
    }
    return d;
  }
  function sentenceNumbers(c) {
    return [
      ...new Set(
        [c.source, ...(c.sources || []), ...(c.additionalSenses || []).map((x) => x.source)].map(
          (x) => x.sentence,
        ),
      ),
    ];
  }
  function emptyState(deck) {
    return {
      schemaVersion: 1,
      deck: validateDeck(deck),
      learned: {},
      results: [],
      favorites: {},
      cursor: null,
    };
  }
  function validateState(s) {
    if (
      !plain(s) ||
      s.schemaVersion !== 1 ||
      !plain(s.learned) ||
      !Array.isArray(s.results) ||
      s.results.length > 50000
    )
      fail('备份格式无效。');
    validateDeck(s.deck);
    const ids = new Set(s.deck.cards.map((c) => c.id));
    if (
      s.favorites !== undefined &&
      (!plain(s.favorites) ||
        Object.entries(s.favorites).some(([id, value]) => !ids.has(id) || value !== true))
    )
      fail('备份含无效收藏记录。');
    if (
      s.favoriteChanges !== undefined &&
      (!plain(s.favoriteChanges) ||
        Object.entries(s.favoriteChanges).some(
          ([id, r]) =>
            !ids.has(id) || !validFavoriteChange(r) || r.active !== (s.favorites?.[id] === true),
        ))
    )
      fail('备份含无效收藏同步记录。');
    for (const [id, r] of Object.entries(s.learned)) {
      if (!ids.has(id) || !plain(r) || !dateOK(r.date)) fail('备份含无效学习记录。');
    }
    for (const r of s.results) {
      if (
        !plain(r) ||
        !ids.has(r.id) ||
        !MODES.includes(r.mode) ||
        typeof r.correct !== 'boolean' ||
        !dateOK(r.date)
      )
        fail('备份含无效复习记录。');
    }
    if (s.cursor !== null && s.cursor !== undefined && !ids.has(s.cursor))
      fail('备份含无效学习位置。');
    if (s.learningPlan !== undefined && s.learningPlan !== null) {
      const p = s.learningPlan;
      if (
        !plain(p) ||
        !['count', 'sentence'].includes(p.scope) ||
        !Array.isArray(p.ids) ||
        !p.ids.length ||
        p.ids.length > 20000 ||
        new Set(p.ids).size !== p.ids.length ||
        p.ids.some((id) => !ids.has(id)) ||
        (p.scope === 'sentence' &&
          (!Number.isSafeInteger(p.sentence) || p.sentence < 1 || p.sentence > 1000000))
      )
        fail('备份含无效的新词学习安排。');
    }
    if (s.learningPlan?.drill !== undefined) {
      const d = s.learningPlan.drill;
      if (
        !plain(d) ||
        !Array.isArray(d.seen) ||
        d.seen.some((id) => !s.learningPlan.ids.includes(id)) ||
        new Set(d.seen).size !== d.seen.length ||
        !Number.isInteger(d.lastReviewed) ||
        d.lastReviewed < 0 ||
        d.lastReviewed > d.seen.length
      )
        fail('新词复习安排无效。');
      if (d.pending) {
        const p = d.pending;
        if (
          !plain(p) ||
          !Array.isArray(p.ids) ||
          !p.ids.length ||
          p.ids.some((id) => !d.seen.includes(id)) ||
          !Number.isInteger(p.index) ||
          p.index < 0 ||
          p.index >= p.ids.length ||
          !Array.isArray(p.retry) ||
          p.retry.some((id) => !p.ids.includes(id)) ||
          !Number.isInteger(p.round) ||
          p.round < 0 ||
          p.round > 2
        )
          fail('新词复习题目无效。');
      }
    }
    if (
      s.learningPlan?.startedByUser !== undefined &&
      typeof s.learningPlan.startedByUser !== 'boolean'
    )
      fail('学习启动状态无效。');
    return s;
  }
  function mergeDeck(state, incoming) {
    validateState(state);
    validateDeck(incoming);
    if (state.deck.bookId !== incoming.bookId) fail('首版只支持同一本书的增量词库。');
    const map = new Map(state.deck.cards.map((c) => [c.id, c]));
    let added = 0,
      updated = 0;
    for (const c of incoming.cards) {
      if (map.has(c.id)) {
        if (map.get(c.id).word.toLowerCase() !== c.word.toLowerCase())
          fail('同一ID对应不同单词，已取消导入。');
        updated++;
      } else added++;
      map.set(c.id, c);
    }
    const deck = {
      ...state.deck,
      ...incoming,
      revision: incoming.revision || state.deck.revision,
      cards: [...map.values()].sort((a, b) => a.order - b.order),
    };
    validateDeck(deck);
    return { state: { ...state, deck }, added, updated };
  }
  function markLearned(state, id, date = localDate()) {
    if (!state.deck.cards.some((c) => c.id === id) || !dateOK(date)) fail('无效词条或日期。');
    return {
      ...state,
      learned: { ...state.learned, [id]: state.learned[id] || { date } },
      cursor: null,
    };
  }
  function learnedOn(state, date) {
    if (!dateOK(date)) fail('请选择有效学习日期。');
    return state.deck.cards
      .filter((c) => state.learned[c.id]?.date === date)
      .sort((a, b) => a.order - b.order);
  }
  function learningQueue(state) {
    if (!state.learningPlan?.startedByUser) return [];
    const selected = new Set(state.learningPlan.ids);
    let ids = state.deck.cards
      .filter((c) => !state.learned[c.id] && selected.has(c.id))
      .sort((a, b) => a.order - b.order)
      .map((c) => c.id);
    if (state.cursor && ids.includes(state.cursor)) {
      const i = ids.indexOf(state.cursor);
      ids = [...ids.slice(i), ...ids.slice(0, i)];
    }
    return ids;
  }
  function sentenceProgress(state) {
    const counts = new Map();
    for (const c of state.deck.cards)
      for (const n of sentenceNumbers(c)) {
        const s = counts.get(n) || { sentence: n, total: 0, learned: 0 };
        s.total++;
        if (state.learned[c.id]) s.learned++;
        counts.set(n, s);
      }
    return [...counts.values()]
      .sort((a, b) => a.sentence - b.sentence)
      .map((s) => ({ ...s, complete: s.total > 0 && s.learned === s.total }));
  }
  function mergeProgress(state, incoming) {
    const valid = new Set(state.deck.cards.map((c) => c.id)),
      learned = { ...state.learned };
    for (const [id, r] of Object.entries(incoming.learned || {}))
      if (valid.has(id) && dateOK(r.date) && (!learned[id] || r.date < learned[id].date))
        learned[id] = { date: r.date };
    const results = new Map();
    for (const [i, r] of [...state.results, ...(incoming.results || [])].entries())
      if (valid.has(r.id)) results.set(r.eventId || 'local-legacy-' + i, r);
    const next = {
      ...state,
      learned,
      results: [...results.values()]
        .sort(
          (a, b) =>
            (a.at || a.date).localeCompare(b.at || b.date) ||
            (a.eventId || '').localeCompare(b.eventId || ''),
        )
        .slice(-50000),
    };
    return validateState(next);
  }
  function startLearningPlan(state, { scope = 'count', count, sentence }) {
    validateState(state);
    let pool = state.deck.cards
      .filter((c) => !state.learned[c.id])
      .sort((a, b) => a.order - b.order);
    if (scope === 'sentence') {
      if (!Number.isSafeInteger(sentence) || sentence < 1 || sentence > 1000000)
        fail('请选择有效的分组。');
      pool = pool.filter((c) => sentenceNumbers(c).includes(sentence));
      if (!pool.length) fail('该分组没有未学新词。');
    } else if (scope === 'count') {
      if (!Number.isSafeInteger(count) || count < 1 || count > pool.length)
        fail('请输入1至' + pool.length + '之间的新词数量。');
      pool = pool.slice(0, count);
    } else fail('无效新词学习方式。');
    return {
      ...state,
      cursor: pool[0].id,
      learningPlan: {
        scope,
        sentence: scope === 'sentence' ? sentence : null,
        ids: pool.map((c) => c.id),
        startedByUser: true,
      },
    };
  }
  function deferNewWord(state) {
    const ids = learningQueue(state);
    return ids.length > 1 ? { ...state, cursor: ids[1] } : state;
  }
  function learnNextWord(state, date = localDate()) {
    const ids = learningQueue(state);
    if (!ids.length) fail('本次新词已学完。');
    return { ...markLearned(state, ids[0], date), cursor: ids[1] || null };
  }
  function favoriteWords(state) {
    return state.deck.cards
      .filter((c) => state.favorites?.[c.id] === true)
      .sort((a, b) => a.order - b.order);
  }
  function validFavoriteChange(r) {
    return (
      plain(r) &&
      typeof r.active === 'boolean' &&
      Number.isSafeInteger(r.updatedAt) &&
      r.updatedAt > 0 &&
      r.updatedAt < 8640000000000000 &&
      typeof r.changeId === 'string' &&
      /^[-a-zA-Z0-9]{16,128}$/.test(r.changeId)
    );
  }
  function newerFavorite(a, b) {
    return (
      !b || a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.changeId > b.changeId)
    );
  }
  function prepareFavorites(state) {
    const favoriteChanges = { ...state.favoriteChanges };
    for (const id of Object.keys(state.favorites || {}))
      if (!favoriteChanges[id])
        favoriteChanges[id] = { active: true, updatedAt: 1, changeId: 'legacy-favorite-0000' };
    return { ...state, favoriteChanges };
  }
  function mergeFavorites(state, records) {
    const valid = new Set(state.deck.cards.map((c) => c.id)),
      favoriteChanges = { ...state.favoriteChanges },
      favorites = { ...state.favorites };
    for (const { id, ...r } of records) {
      if (!valid.has(id)) continue;
      if (!validFavoriteChange(r)) fail('云端收藏记录格式无效。');
      if (newerFavorite(r, favoriteChanges[id])) {
        favoriteChanges[id] = r;
        if (r.active) favorites[id] = true;
        else delete favorites[id];
      }
    }
    return { ...state, favorites, favoriteChanges };
  }
  function toggleFavorite(state, id) {
    if (!state.deck.cards.some((c) => c.id === id)) fail('无效收藏词条。');
    const prepared = prepareFavorites(state),
      updatedAt = Math.max(
        Date.now(),
        ...Object.values(prepared.favoriteChanges).map((r) => r.updatedAt + 1),
      );
    return mergeFavorites(prepared, [
      { id, active: !state.favorites?.[id], updatedAt, changeId: crypto.randomUUID() },
    ]);
  }
  function selectWords(
    state,
    { scope = 'all', date, count, fromWord = '', toWord = '' },
    random = Math.random,
  ) {
    let pool = scope.startsWith('favorites')
      ? favoriteWords(state)
      : state.deck.cards.filter((c) => Object.prototype.hasOwnProperty.call(state.learned, c.id));
    if (scope === 'favorites-range') {
      if (!pool.length) fail('还没有收藏单词，请先点亮单词卡右上角的星标。');
      const from = pool.findIndex((c) => normalize(c.word) === normalize(fromWord)),
        to = pool.findIndex((c) => normalize(c.word) === normalize(toWord));
      if (from < 0 || to < 0) fail('请输入已收藏的起止英文单词（完整拼写）。');
      if (from > to) fail('起始词应位于结束词之前，请按书本顺序选择。');
      return pool.slice(from, to + 1);
    }
    if (scope === 'date') {
      if (!dateOK(date)) fail('请选择学习日期。');
      pool = pool.filter((c) => state.learned[c.id].date === date);
      if (!pool.length) fail('该日期还没有已学单词。');
      return pool.sort((a, b) => a.order - b.order);
    }
    if (!['all', 'favorites'].includes(scope)) fail('无效复习范围。');
    if (!pool.length)
      fail(
        scope === 'favorites' ? '还没有收藏单词，请先点亮单词卡右上角的星标。' : '还没有已学单词。',
      );
    if (!Number.isSafeInteger(count) || count < 1 || count > pool.length)
      fail(
        '请输入1至' +
          pool.length +
          '之间的整数，不能超过' +
          (scope === 'favorites' ? '收藏' : '已学') +
          '单词数。',
      );
    pool = pool.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }
  function buildQuestions(cards, modes) {
    if (!Array.isArray(modes) || !modes.length || modes.some((m) => !MODES.includes(m)))
      fail('请至少选择一种有效练习方式。');
    const questions = [],
      skipped = { cloze: 0, conversion: 0 };
    for (const primary of cards) {
      const seen = new Set();
      for (const [senseIndex, c] of [primary, ...(primary.additionalSenses || [])].entries())
        for (const mode of [...new Set(modes)]) {
          let q;
          if (mode === 'meaning')
            q = { id: primary.id, mode, prompt: c.word, answers: [c.meaning], selfGrade: true };
          else if (mode === 'spelling')
            q = { id: primary.id, mode, prompt: c.meaning, answers: c.spellingAnswers || [c.word] };
          else if (c[mode])
            q = { id: primary.id, mode, prompt: c[mode].prompt, answers: c[mode].answers };
          else {
            skipped[mode]++;
            continue;
          }
          const key = JSON.stringify([q.mode, q.prompt, q.answers]);
          if (!seen.has(key)) {
            seen.add(key);
            questions.push({ ...q, senseIndex });
          }
        }
    }
    if (!questions.length) fail('所选词中没有适用题目，请增加其他练习方式。');
    return { questions, skipped };
  }
  function normalize(s) {
    return s.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  }
  function checkAnswer(input, answers) {
    return answers.some((a) => normalize(input) === normalize(a));
  }
  function questionCard(deck, q) {
    const primary = deck.cards.find((c) => c.id === q.id);
    if (!primary) fail('找不到复习词条。');
    return [primary, ...(primary.additionalSenses || [])][q.senseIndex || 0] || primary;
  }
  return {
    MODES,
    sentenceNumbers,
    localDate,
    validateDeck,
    emptyState,
    validateState,
    mergeDeck,
    markLearned,
    selectWords,
    buildQuestions,
    checkAnswer,
    questionCard,
    learnedOn,
    learningQueue,
    startLearningPlan,
    deferNewWord,
    learnNextWord,
    sentenceProgress,
    mergeProgress,
    favoriteWords,
    toggleFavorite,
    prepareFavorites,
    mergeFavorites,
  };
});
