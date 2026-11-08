const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const C = require('../../web/core.js'),
  demo = require('../fixtures/demo-deck.json');
const contract = require('../../cloud/rating-contract.cjs');
const at = '2026-11-01T10:00:00.000Z';
const event = (id, rating = 3) => ({
  id: 'demo-focus',
  bookId: demo.bookId,
  eventId: id,
  at,
  rating,
  mode: 'meaning',
  algorithm: contract.algorithm,
});

test('old learned cards wait for initial rating; real rating schedules a future review and survives schema2 backup', async () => {
  const S = await import('../../web/domain/scheduler.js');
  let state = C.markLearned(C.emptyState(demo), 'demo-focus', '2026-11-01');
  assert.equal(S.dueCards(state, Date.parse(at)).length, 1);
  state = S.recordRating(state, {
    id: 'demo-focus',
    rating: 3,
    mode: 'meaning',
    at,
    eventId: 'rating-event-00000001',
  });
  assert.equal(state.ratingEvents.length, 1);
  assert.equal(S.dueCards(state, Date.parse(at)).length, 0);
  assert.equal(S.dueCards(state, Date.parse(at) + 86400000).length, 1);
  const backup = C.exportBackup(state);
  assert.equal(backup.schemaVersion, 2);
  assert.deepEqual(
    S.restoreScheduler(C.importBackup(JSON.parse(JSON.stringify(backup)))).schedules,
    state.schedules,
  );
  assert.equal(C.importBackup(C.emptyState(demo)).deck.bookId, demo.bookId);
});
test('event merge is deterministic, idempotent, immutable and validates namespace/time', async () => {
  const S = await import('../../web/domain/scheduler.js');
  const a = event('rating-event-00000001', 3),
    b = event('rating-event-00000002', 1);
  assert.deepEqual(
    S.rebuildSchedule([b, a], demo.bookId),
    S.rebuildSchedule([a, b, a], demo.bookId),
  );
  assert.throws(() => S.rebuildSchedule([a, { ...a, rating: 4 }], demo.bookId), /冲突/);
  assert.throws(() => S.rebuildSchedule([a], 'other-book'), /格式/);
  assert.throws(() => contract.validateRating({ ...a, at: '2099-01-01T00:00:00.000Z' }), /格式/);
  assert.throws(() => contract.validateRating({ ...a, at: '2026-02-30T00:00:00.000Z' }), /格式/);
  assert.throws(() => contract.validateRating({ ...a, deck: {} }), /格式/);
});
test('replay produces identical UTC schedules across time zones and daylight-saving boundaries', () => {
  const script = `import('./web/domain/scheduler.js').then(S=>console.log(JSON.stringify(S.rebuildSchedule(${JSON.stringify([event('rating-event-00000001', 4), { ...event('rating-event-00000002', 3), at: '2026-11-02T10:00:00.000Z' }])},'${demo.bookId}'))))`;
  const results = ['UTC', 'Asia/Shanghai', 'America/New_York'].map((TZ) =>
    execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, TZ },
    }).trim(),
  );
  assert.equal(results[0], results[1]);
  assert.equal(results[1], results[2]);
});
