const assert = require('node:assert/strict'),
  { setup, snapshot } = require('./helpers.cjs');
(async () => {
  const app = await setup();
  try {
    const a = await app.page(),
      b = await a.context().newPage();
    await b.goto(a.url());
    await b.locator('.word').waitFor();
    a.on('dialog', (dialog) => dialog.accept());
    b.on('dialog', (dialog) => dialog.accept());
    await a.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js');
      const deck = {
        ...runtime.state.deck,
        cards: runtime.state.deck.cards.filter((card) => card.id !== 'demo-focus'),
      };
      await window.onNativeImport(
        JSON.stringify(window.WordMemo.exportBackup(window.WordMemo.emptyState(deck))),
        'restore',
      );
    });
    const accepted = await b.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js'),
        { persist } = await import('/ui/state.js');
      return persist(window.WordMemo.markLearned(runtime.state, 'demo-focus', '2026-11-01'));
    });
    assert.equal(accepted, false);
    assert.match(await b.locator('#toast').textContent(), /刷新/);
    const stored = await a.evaluate(async () => JSON.parse(await window.BrowserStore.load()));
    assert.equal(stored.deck.cards.length, 5);
    assert.equal(stored.learned['demo-focus'], undefined);
    await b.reload();
    await b.locator('.word').waitFor();
    assert.equal((await snapshot(b)).deck.cards.length, 5);
    console.log(
      'Browser concurrency PASS: same-book restore advances generation; stale tab cannot write removed cards',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
