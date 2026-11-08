const test = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  { createApp } = require('../server.cjs'),
  { MemoryStore } = require('../store.cjs');
async function setup(t) {
  const server = http.createServer(
    createApp({
      store: new MemoryStore(),
      env: {
        IELTS75_SIGNING_SECRET: 'fixture-only-signing-secret-1234567890',
        IELTS75_REGISTRATION_CODE: 'fixture-invite',
      },
    }),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  let token;
  async function call(path, body) {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const r = await call('/v1/register', {
    username: 'tester',
    password: 'fixture-password-long',
    registrationCode: 'fixture-invite',
  });
  token = r.data.token;
  return call;
}
const fp = 'a'.repeat(64),
  record = (id, active, updatedAt, changeId = 'favorite-operation-0001') => ({
    id: 'sjj-' + id,
    active,
    updatedAt,
    changeId,
  });
test('favorites propagate add/remove; stale offline client and old progress client cannot resurrect removal', async (t) => {
  const call = await setup(t),
    post = (favorites) => call('/v1/favorites/book', { fingerprint: fp, favorites });
  const added = record('word', true, 10),
    removed = record('word', false, 20);
  assert.equal((await post([added])).status, 200);
  assert.deepEqual((await call('/v1/favorites/book?fingerprint=' + fp)).data.records, [added]);
  await post([removed]);
  const stale = await post([added]);
  assert.deepEqual(stale.data.records, [removed]);
  await call('/v1/progress/book', {
    fingerprint: fp,
    learned: [{ id: 'sjj-word', date: '2026-11-05' }],
    results: [],
  });
  assert.deepEqual((await call('/v1/favorites/book?fingerprint=' + fp)).data.records, [removed]);
  assert.equal((await call('/v1/progress/book?fingerprint=' + fp)).data.records.length, 1);
});
test('same-time operations have deterministic tie break, books isolate and invalid data rejected', async (t) => {
  const call = await setup(t);
  const a = record('word', true, 10, 'favorite-operation-0001'),
    b = record('word', false, 10, 'favorite-operation-0002');
  await Promise.all(
    [a, b].map((r) => call('/v1/favorites/book', { fingerprint: fp, favorites: [r] })),
  );
  assert.deepEqual((await call('/v1/favorites/book?fingerprint=' + fp)).data.records, [b]);
  assert.equal((await call('/v1/favorites/other?fingerprint=' + fp)).data.records.length, 0);
  assert.equal((await call('/v1/favorites/book?fingerprint=' + 'b'.repeat(64))).status, 409);
  for (const bad of [
    { ...a, active: 'yes' },
    { ...a, updatedAt: -1 },
    { ...a, word: 'private book text' },
    { ...a, changeId: 'bad' },
  ])
    assert.equal(
      (await call('/v1/favorites/book', { fingerprint: fp, favorites: [bad] })).status,
      400,
    );
  assert.equal((await call('/health')).data.favoritesSync, true);
});
test('favorite pagination and 100-operation batch bound', async (t) => {
  const call = await setup(t);
  const rows = Array.from({ length: 501 }, (_, i) =>
    record('word-' + String(i).padStart(4, '0'), true, 10),
  );
  assert.equal(
    (await call('/v1/favorites/book', { fingerprint: fp, favorites: rows.slice(0, 101) })).status,
    400,
  );
  for (let i = 0; i < rows.length; i += 100)
    assert.equal(
      (await call('/v1/favorites/book', { fingerprint: fp, favorites: rows.slice(i, i + 100) }))
        .status,
      200,
    );
  const page = (await call('/v1/favorites/book?fingerprint=' + fp)).data;
  assert.equal(page.records.length, 500);
  assert.ok(page.next);
  assert.equal(
    (
      await call(
        '/v1/favorites/book?fingerprint=' + fp + '&cursor=' + encodeURIComponent(page.next),
      )
    ).data.records.length,
    1,
  );
});
