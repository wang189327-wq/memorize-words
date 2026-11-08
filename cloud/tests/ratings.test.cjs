const test = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http');
const { createApp } = require('../server.cjs'),
  { MemoryStore } = require('../store.cjs'),
  { algorithm } = require('../rating-contract.cjs');
test('rating protocol isolates books, rejects conflicting IDs/book content and leaves v1 progress compatible', async (t) => {
  const server = http.createServer(
    createApp({
      store: new MemoryStore(),
      env: {
        IELTS75_SIGNING_SECRET: 'fixture-only-secret-longer-than-32-characters',
        IELTS75_REGISTRATION_CODE: 'fixture-invite',
      },
    }),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  let token;
  async function call(path, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await call('/v2/capabilities')).status, 401);
  token = (
    await call('/v1/register', {
      username: 'rating-tester',
      password: 'fixture-password-long',
      registrationCode: 'fixture-invite',
    })
  ).data.token;
  assert.equal((await call('/v2/capabilities')).data.ratingSync, true);
  const fingerprint = 'b'.repeat(64),
    event = {
      eventId: 'rating-event-00000001',
      bookId: 'book',
      id: 'demo-focus',
      at: '2026-11-01T10:00:00.000Z',
      rating: 3,
      mode: 'meaning',
      algorithm,
    };
  const post = (events) => call('/v2/ratings/book', { fingerprint, events });
  assert.equal((await post([event])).status, 200);
  assert.equal((await post([event])).status, 200);
  assert.equal((await post([{ ...event, rating: 4 }])).status, 409);
  assert.equal((await post([{ ...event, bookId: 'other' }])).status, 400);
  assert.equal((await post([{ ...event, deck: {} }])).status, 400);
  assert.equal((await post([{ ...event, at: '2099-01-01T00:00:00.000Z' }])).status, 400);
  assert.deepEqual((await call('/v2/ratings/book?fingerprint=' + fingerprint)).data.records, [
    event,
  ]);
  assert.deepEqual((await call('/v2/ratings/other?fingerprint=' + fingerprint)).data.records, []);
  assert.equal((await call('/v2/ratings/book?fingerprint=' + 'c'.repeat(64))).status, 409);
  assert.equal(
    (
      await call('/v1/progress/book', {
        fingerprint,
        learned: [{ id: 'demo-focus', date: '2026-11-01' }],
        results: [],
      })
    ).status,
    200,
  );
  assert.equal((await call('/v1/progress/book?fingerprint=' + fingerprint)).data.records.length, 1);
});
