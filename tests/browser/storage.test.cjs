const assert = require('node:assert/strict');
const { setup, snapshot } = require('./helpers.cjs');
const C = require('../../web/core.js');

(async () => {
  const app = await setup();
  try {
    const existing = await app.page();
    const origin = new URL(existing.url()).origin;
    const context = await app.browser.newContext();
    const page = await context.newPage();
    await page.goto(origin + '/seed');
    const legacy = C.emptyState(require('../fixtures/demo-deck.json'));
    legacy.learned['demo-focus'] = { date: '2026-11-01' };
    legacy.results = [{ id: 'demo-focus', mode: 'spelling', correct: true, date: '2026-11-02' }];
    await page.evaluate(async (raw) => {
      localStorage.setItem('ielts75-mode', 'local');
      localStorage.setItem('ielts75-state-v1', raw);
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('ielts75-local', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('records', 'readwrite');
          tx.objectStore('records').put(raw, 'state');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }, JSON.stringify(legacy));
    await context.addInitScript(() => {
      if (window.name === 'allow-migration') return;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'learned') throw Error('migration fixture interruption');
        return put.apply(this, args);
      };
    });
    await page.goto(origin);
    await page.getByText('启动失败：', { exact: false }).waitFor();
    assert.ok(await page.evaluate(() => localStorage.getItem('ielts75-state-v1')));
    assert.equal(
      await page.evaluate(() => window.BrowserStore.get('state')),
      JSON.stringify(legacy),
    );
    await page.evaluate(() => {
      window.name = 'allow-migration';
    });
    await page.reload();
    await page.locator('.word').waitFor();
    const migrated = await snapshot(page);
    assert.deepEqual(migrated.learned, legacy.learned);
    assert.ok(migrated.results[0].eventId);
    assert.equal(await page.evaluate(() => localStorage.getItem('ielts75-state-v1')), null);
    assert.equal(await page.evaluate(() => window.BrowserStore.get('state')), undefined);
    await page.reload();
    await page.locator('.word').waitFor();
    assert.equal((await snapshot(page)).results[0].eventId, migrated.results[0].eventId);

    const writes = await page.evaluate(async () => {
      const writes = [],
        original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        writes.push({ table: this.name, bytes: JSON.stringify(value).length });
        return original.call(this, value, key);
      };
      try {
        const { runtime } = await import('/ui/runtime.js');
        const { persist } = await import('/ui/state.js');
        const event = {
          id: 'demo-focus',
          mode: 'spelling',
          correct: true,
          date: '2026-11-08',
          at: new Date().toISOString(),
          eventId: crypto.randomUUID(),
        };
        if (!(await persist({ ...runtime.state, results: [...runtime.state.results, event] })))
          throw Error('Incremental commit failed');
        return writes;
      } finally {
        IDBObjectStore.prototype.put = original;
      }
    });
    assert.equal(writes.filter((row) => row.table === 'results').length, 1);
    assert.equal(writes.filter((row) => row.table === 'books').length, 0);
    assert.ok(Math.max(...writes.map((row) => row.bytes)) < 1000);
    await page.reload();
    await page.locator('.word').waitFor();
    assert.equal((await snapshot(page)).results.length, 2);
    await context.close();
    console.log(
      'Browser storage PASS: interrupted migration rolls back, legacy survives, IDs stable, single event writes no book',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
