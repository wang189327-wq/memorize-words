const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../web/core.js'),
  R = require('../../web/storage/records.js');
const demo = require('../fixtures/demo-deck.json');
const event = (i) => ({
  id: 'demo-focus',
  mode: 'spelling',
  correct: true,
  date: '2026-11-08',
  eventId: `record-event-${String(i).padStart(6, '0')}`,
});

test('bounded result append produces one insert and one delete without serializing the book', () => {
  const state = {
    ...C.emptyState(demo),
    results: Array.from({ length: 50000 }, (_, i) => event(i)),
  };
  const next = { ...state, results: [...state.results.slice(1), event(50000)] };
  const patch = R.patch(next, state);
  assert.equal(patch.puts.results.length, 1);
  assert.deepEqual(patch.deletes.results, [state.results[0].eventId]);
  assert.equal(patch.puts.books, undefined);
  assert.ok(JSON.stringify(patch).length < 1000);
});
test('record layout retains source, plan, cursor and favorite cancellation on reconstruction', () => {
  const state = C.emptyState(demo);
  state.cursor = 'demo-focus';
  state.results = [event(0)];
  state.learningPlan = {
    scope: 'count',
    ids: ['demo-focus'],
    startedByUser: false,
    drill: { seen: ['demo-focus'], lastReviewed: 0 },
  };
  state.favoriteChanges = {
    'demo-focus': { active: false, updatedAt: 1, changeId: 'cancel-event-000000' },
  };
  const rebuilt = R.assemble(R.rows(state), { bookId: demo.bookId, state: R.metadata(state) });
  assert.deepEqual(rebuilt.learningPlan, state.learningPlan);
  assert.deepEqual(rebuilt.favoriteChanges, state.favoriteChanges);
  assert.deepEqual(rebuilt.results, state.results);
  assert.equal(rebuilt.cursor, state.cursor);
  assert.deepEqual(rebuilt.deck, demo);
});
test('reordered cloned history uses safe keyed diff; legacy IDs are allocated once', async () => {
  const state = { ...C.emptyState(demo), results: [event(1), event(2)] };
  const next = { ...state, results: structuredClone([state.results[1], state.results[0]]) };
  assert.equal(R.patch(next, state).puts.results, undefined);
  const legacy = { ...state, results: [{ ...event(1), eventId: undefined }] };
  const normalized = await R.normalizeLegacy(legacy);
  assert.match(normalized.results[0].eventId, /^legacy-[a-f0-9]{64}$/);
  assert.equal(
    (await R.normalizeLegacy(normalized)).results[0].eventId,
    normalized.results[0].eventId,
  );
  assert.equal(
    (await R.normalizeLegacy(structuredClone(legacy))).results[0].eventId,
    normalized.results[0].eventId,
  );
  assert.equal(legacy.results[0].eventId, undefined);
});
