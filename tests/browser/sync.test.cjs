const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../../cloud/server.cjs');
const { MemoryStore } = require('../../cloud/store.cjs');
const { setup, snapshot } = require('./helpers.cjs');

(async () => {
  const app = await setup();
  const backend = http.createServer(
    createApp({
      store: new MemoryStore(),
      env: {
        IELTS75_SIGNING_SECRET: 'fixture-only-secret-longer-than-32-characters',
        IELTS75_REGISTRATION_CODE: 'fixture-invite',
      },
    }),
  );
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  let oldBackend = false,
    oldRatingBackend = false,
    pauseNext = false,
    arrived,
    release;
  try {
    const a = await app.page('cloud'),
      b = await app.page('cloud');
    for (const [index, page] of [a, b].entries()) {
      await page.route('https://api.example.test/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (oldRatingBackend && url.pathname.startsWith('/v2/'))
          return route.fulfill({ status: 404, headers, json: { error: 'old rating fixture' } });
        if (oldBackend && url.pathname.startsWith('/v1/favorites/'))
          return route.fulfill({ status: 404, headers, json: { error: 'old fixture server' } });
        if (pauseNext && request.method() === 'POST' && url.pathname.startsWith('/v1/favorites/')) {
          pauseNext = false;
          arrived();
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        const response = await fetch(
          `http://127.0.0.1:${backend.address().port}${url.pathname}${url.search}`,
          {
            method: request.method(),
            headers: {
              'Content-Type': 'application/json',
              ...(request.headers().authorization
                ? { Authorization: request.headers().authorization }
                : {}),
            },
            ...(request.postData() ? { body: request.postData() } : {}),
          },
        );
        return route.fulfill({ status: response.status, headers, json: await response.json() });
      });
      await page.evaluate(
        (register) =>
          window.WordMemoSync.login({
            api: 'https://api.example.test',
            username: 'tester',
            password: 'fixture-password-long',
            registrationCode: 'fixture-invite',
            register,
          }),
        index === 0,
      );
    }
    const sync = (page) => page.evaluate(() => window.WordMemoSync.sync());
    const toggle = (page, id) =>
      page.evaluate(async (id) => {
        const { runtime } = await import('/ui/runtime.js');
        const { persist } = await import('/ui/state.js');
        return persist(window.WordMemo.toggleFavorite(runtime.state, id));
      }, id);
    await toggle(a, 'demo-focus');
    await sync(a);
    await sync(b);
    assert.equal((await snapshot(b)).favorites['demo-focus'], true);
    await toggle(b, 'demo-focus');
    await sync(b);
    await sync(a);
    assert.equal((await snapshot(a)).favorites['demo-focus'], undefined);
    await a.reload();
    await a.locator('.word').waitFor();
    assert.equal((await snapshot(a)).favoriteChanges['demo-focus'].active, false);

    await toggle(a, 'demo-adapt');
    pauseNext = true;
    const reached = new Promise((resolve) => {
      arrived = resolve;
    });
    const syncing = sync(a);
    await reached;
    await toggle(a, 'demo-curious');
    release();
    await syncing;
    assert.equal(await a.evaluate(() => window.hasUnsavedCloudProgress()), true);
    await sync(a);
    await sync(b);
    assert.deepEqual((await snapshot(a)).favorites, (await snapshot(b)).favorites);

    const rateWord = (page, rating) =>
      page.evaluate(async (rating) => {
        const { runtime } = await import('/ui/runtime.js'),
          { persist } = await import('/ui/state.js');
        const { recordRating } = await import('/domain/scheduler.js');
        const learned = window.WordMemo.markLearned(runtime.state, 'demo-focus', '2026-11-01');
        return persist(recordRating(learned, { id: 'demo-focus', mode: 'meaning', rating }));
      }, rating);
    await rateWord(a, 3);
    await rateWord(b, 1);
    await sync(a);
    await sync(b);
    await sync(a);
    assert.equal((await snapshot(a)).ratingEvents.length, 2);
    assert.deepEqual((await snapshot(a)).schedules, (await snapshot(b)).schedules);
    await rateWord(a, 4);
    oldRatingBackend = true;
    await assert.rejects(sync(a), /智能复习记录尚未同步/);
    assert.equal((await snapshot(a)).ratingEvents.length, 3);
    assert.ok(await a.evaluate(() => window.WordMemoSync.config().lastProgressSync));
    assert.equal(await a.evaluate(() => window.hasUnsavedCloudProgress()), true);
    oldRatingBackend = false;
    await sync(a);
    await sync(b);
    assert.deepEqual((await snapshot(a)).schedules, (await snapshot(b)).schedules);
    assert.equal((await snapshot(b)).ratingEvents.length, 3);

    await toggle(a, 'demo-observe');
    oldBackend = true;
    await assert.rejects(sync(a), /先部署1.4/);
    assert.equal((await snapshot(a)).favorites['demo-observe'], true);
    assert.equal(await a.evaluate(() => window.hasUnsavedCloudProgress()), true);
    oldBackend = false;
    await sync(a);
    await sync(b);
    assert.deepEqual((await snapshot(a)).favorites, (await snapshot(b)).favorites);
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser sync PASS: two isolated IndexedDB devices + HTTP, favorites, concurrent ratings, deterministic schedules, old-backend partial status and retry; not live cloud',
    );
  } finally {
    await app.close();
    await new Promise((resolve) => backend.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
