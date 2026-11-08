const test = require('node:test'),
  assert = require('node:assert/strict'),
  http = require('node:http'),
  { createApp } = require('../server.cjs'),
  { MemoryStore } = require('../store.cjs');
async function setup(t) {
  const store = new MemoryStore(),
    env = {
      IELTS75_SIGNING_SECRET: 'fixture-only-signing-secret-1234567890',
      IELTS75_REGISTRATION_CODE: 'fixture-only-invite',
      IELTS75_ALLOWED_ORIGINS: 'https://client.test',
    };
  const server = http.createServer(createApp({ store, env }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(path, body, token, origin) {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: r.status === 403 && origin ? null : await r.json() };
  }
  return { call, store };
}
const fp = 'a'.repeat(64),
  card = 'sjj-test-word',
  event = (n, date = '2026-10-29') => ({
    id: card,
    mode: 'spelling',
    correct: true,
    date,
    at: date + 'T12:00:00.000Z',
    eventId: 'fixture-event-0000' + n,
  });
test('one account accepts four devices; stale concurrent sync never erases earlier dates or distinct review events', async (t) => {
  const { call } = await setup(t);
  const first = await call('/v1/register', {
    username: 'tester',
    password: 'fixture-password-long',
    registrationCode: 'fixture-only-invite',
  });
  assert.equal(first.status, 201);
  const tokens = [first.data.token];
  for (let i = 1; i < 4; i++) {
    const r = await call('/v1/login', { username: 'tester', password: 'fixture-password-long' });
    assert.equal(r.status, 200);
    tokens.push(r.data.token);
  }
  await Promise.all(
    tokens.map((token, i) =>
      call(
        '/v1/progress/test-book',
        {
          fingerprint: fp,
          learned: [{ id: card, date: '2026-10-' + String(28 - i).padStart(2, '0') }],
          results: [event(i)],
        },
        token,
      ).then((r) => assert.equal(r.status, 200)),
    ),
  );
  const read = await call('/v1/progress/test-book?fingerprint=' + fp, null, tokens[0]);
  assert.equal(read.data.records.find((r) => r.kind === 'learned').date, '2026-10-25');
  assert.equal(read.data.records.filter((r) => r.kind === 'result').length, 4);
  const retry = await call(
    '/v1/progress/test-book',
    { fingerprint: fp, learned: [{ id: card, date: '2026-10-29' }], results: [event(0)] },
    tokens[0],
  );
  assert.equal(retry.status, 200);
  const reread = await call('/v1/progress/test-book?fingerprint=' + fp, null, tokens[1]);
  assert.equal(reread.data.records.length, 5);
});
test('no authentication, wrong password, wrong invite, second account and wrong origin are denied', async (t) => {
  const { call } = await setup(t);
  assert.equal((await call('/v1/progress/book')).status, 401);
  assert.equal(
    (
      await call('/v1/register', {
        username: 'tester',
        password: 'fixture-password-long',
        registrationCode: 'wrong',
      })
    ).status,
    403,
  );
  await call('/v1/register', {
    username: 'tester',
    password: 'fixture-password-long',
    registrationCode: 'fixture-only-invite',
  });
  assert.equal(
    (await call('/v1/login', { username: 'tester', password: 'wrong-password' })).status,
    401,
  );
  assert.equal(
    (
      await call('/v1/register', {
        username: 'other',
        password: 'fixture-password-long',
        registrationCode: 'fixture-only-invite',
      })
    ).status,
    403,
  );
  assert.equal((await call('/health', null, null, 'https://unapproved.test')).status, 403);
});
test('server rejects book material and mismatched fingerprints, isolates books and paginates progress', async (t) => {
  const { call } = await setup(t);
  const {
    data: { token },
  } = await call('/v1/register', {
    username: 'tester',
    password: 'fixture-password-long',
    registrationCode: 'fixture-only-invite',
  });
  assert.equal(
    (
      await call(
        '/v1/progress/book',
        { fingerprint: fp, learned: [], results: [], deck: { cards: [] } },
        token,
      )
    ).status,
    400,
  );
  for (let offset = 0; offset < 501; offset += 100) {
    const learned = Array.from({ length: Math.min(100, 501 - offset) }, (_, i) => ({
      id: 'sjj-test-' + String(offset + i).padStart(5, '0'),
      date: '2026-10-29',
    }));
    assert.equal(
      (await call('/v1/progress/book', { fingerprint: fp, learned, results: [] }, token)).status,
      200,
    );
  }
  const first = await call('/v1/progress/book?fingerprint=' + fp, null, token);
  assert.equal(first.data.records.length, 500);
  assert.ok(first.data.next);
  const second = await call(
    '/v1/progress/book?fingerprint=' + fp + '&cursor=' + encodeURIComponent(first.data.next),
    null,
    token,
  );
  assert.equal(second.data.records.length, 1);
  assert.equal(second.data.next, null);
  assert.equal(
    (
      await call(
        '/v1/progress/book',
        { fingerprint: 'b'.repeat(64), learned: [], results: [] },
        token,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call('/v1/progress/other?fingerprint=' + fp, null, token)).data.records.length,
    0,
  );
});
