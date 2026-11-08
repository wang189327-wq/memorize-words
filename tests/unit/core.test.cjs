const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../web/core.js');
const fixture = require('../fixtures/demo-deck.json');
const fresh = () => C.emptyState(structuredClone(fixture));

test('original sample validates; IDs and groups are independent of a particular book', () => {
  const deck = structuredClone(fixture);
  deck.cards[0].id = 'custom_word_01';
  delete deck.cards[0].source.readerPage;
  delete deck.cards[0].source.printedPage;
  C.validateDeck(deck);
  assert.equal(C.sentenceProgress(C.emptyState(deck)).at(-1).sentence, 123);
  const duplicate = structuredClone(deck);
  duplicate.cards.push(duplicate.cards[0]);
  assert.throws(() => C.validateDeck(duplicate));
  for (const id of ['__proto__', 'constructor', 'prototype', 'toString']) {
    const invalid = structuredClone(deck);
    invalid.cards[0].id = id;
    assert.throws(() => C.validateDeck(invalid));
  }
});

test('count plan, group plan, deferral and first learning date survive backup', () => {
  let state = C.startLearningPlan(fresh(), { scope: 'count', count: 3 });
  const first = C.learningQueue(state)[0];
  state = C.deferNewWord(state);
  assert.notEqual(C.learningQueue(state)[0], first);
  state = C.learnNextWord(state, '2026-11-06');
  const learned = Object.keys(state.learned)[0];
  state = C.markLearned(state, learned, '2026-11-07');
  assert.equal(state.learned[learned].date, '2026-11-06');
  assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(state))), state);
  const group = C.startLearningPlan(fresh(), { scope: 'sentence', sentence: 123 });
  assert.equal(C.learningQueue(group).length, 2);
});

test('favorites include unlearned words, source-order range, sampling and cancellation', () => {
  let state = fresh();
  for (const index of [5, 0, 2]) state = C.toggleFavorite(state, fixture.cards[index].id);
  assert.deepEqual(
    C.favoriteWords(state).map((card) => card.word),
    ['focus', 'curious', 'improve'],
  );
  const words = C.selectWords(state, { scope: 'favorites', count: 2 }, () => 0.4);
  assert.equal(new Set(words.map((card) => card.id)).size, 2);
  assert.throws(() => C.selectWords(state, { scope: 'favorites', count: 4 }));
  assert.deepEqual(
    C.selectWords(state, { scope: 'favorites-range', fromWord: ' FOCUS ', toWord: 'improve' }).map(
      (card) => card.word,
    ),
    ['focus', 'curious', 'improve'],
  );
  assert.throws(() =>
    C.selectWords(state, { scope: 'favorites-range', fromWord: 'improve', toWord: 'focus' }),
  );
  assert.throws(() =>
    C.selectWords(state, { scope: 'favorites-range', fromWord: 'adapt', toWord: 'focus' }),
  );
  state = C.toggleFavorite(state, fixture.cards[0].id);
  assert.equal(state.favorites[fixture.cards[0].id], undefined);
  assert.equal(state.favoriteChanges[fixture.cards[0].id].active, false);
});

test('newer cancellation survives stale clients and legacy favorites migrate', () => {
  let state = fresh();
  state.favorites['demo-focus'] = true;
  state = C.prepareFavorites(state);
  state = C.mergeFavorites(state, [
    { id: 'demo-focus', active: false, updatedAt: 20, changeId: 'favorite-operation-0002' },
  ]);
  state = C.mergeFavorites(state, [
    { id: 'demo-focus', active: true, updatedAt: 10, changeId: 'favorite-operation-0001' },
  ]);
  assert.equal(state.favorites['demo-focus'], undefined);
  C.validateState(state);
});

test('all four review modes have meaningful sample answers', () => {
  const questions = C.buildQuestions(fixture.cards, C.MODES);
  assert.equal(questions.questions.length, fixture.cards.length * 4);
  assert.equal(C.checkAnswer(' Focus ', ['focus']), true);
  assert.equal(C.checkAnswer('focuz', ['focus']), false);
});

test('learning progress merge retains local favorites, plan and earliest dates', () => {
  let state = C.startLearningPlan(C.toggleFavorite(fresh(), 'demo-focus'), {
    scope: 'count',
    count: 2,
  });
  state = C.markLearned(state, 'demo-focus', '2026-11-06');
  const result = C.mergeProgress(state, {
    learned: { 'demo-focus': { date: '2026-11-05' } },
    results: [],
  });
  assert.equal(result.learned['demo-focus'].date, '2026-11-05');
  assert.equal(result.favorites['demo-focus'], true);
  assert.deepEqual(result.learningPlan, state.learningPlan);
});

test('7/18 spelling checkpoints apply independently from page rendering', async () => {
  const { learnWithDrill } = await import('../../web/domain/learning.js');
  const deck = {
    ...structuredClone(fixture),
    cards: Array.from({ length: 20 }, (_, index) => ({
      ...structuredClone(fixture.cards[0]),
      id: `fixture-${index}`,
      word: `fixtureword${index}`,
      order: index + 1,
    })),
  };
  let state = C.startLearningPlan(C.emptyState(deck), { scope: 'count', count: 20 });
  for (let count = 1; count <= 20; count++) {
    state = learnWithDrill(state, C);
    if ([7, 14, 18, 20].includes(count)) {
      assert.equal(
        state.learningPlan.drill.pending.ids.length,
        count === 18 ? 18 : count === 20 ? 2 : 7,
      );
      state.learningPlan.drill.pending = null;
    }
  }
});
