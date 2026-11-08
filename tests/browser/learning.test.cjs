const assert = require('node:assert/strict');
const { setup, snapshot } = require('./helpers.cjs');

(async () => {
  const app = await setup();
  try {
    const page = await app.page();
    assert.equal(await page.locator('#learning-options').getAttribute('open'), null);
    assert.equal(
      await page.getByRole('button', { name: '学会了，下一个', exact: true }).isDisabled(),
      true,
    );

    // An actual IndexedDB exception must neither light the star nor change the state.
    await page.evaluate(() => {
      window.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('fixture storage full', 'QuotaExceededError');
      };
    });
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.waitForFunction(() =>
      document.getElementById('toast').textContent.includes('当前操作未提交'),
    );
    assert.deepEqual((await snapshot(page)).favorites, {});
    assert.equal(
      await page
        .getByRole('button', { name: '收藏单词', exact: true })
        .getAttribute('aria-pressed'),
      'false',
    );
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.originalPut;
    });
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    assert.equal((await snapshot(page)).favorites['demo-focus'], true);

    await page.locator('#learning-options summary').click();
    await page.getByLabel('新词数量', { exact: true }).fill('2');
    await page.getByRole('button', { name: '开始本次学习', exact: true }).click();
    await page.getByRole('button', { name: '跳过', exact: true }).click();
    await page.getByRole('button', { name: '学会了，下一个', exact: true }).click();
    await page.waitForFunction(
      async () => Object.keys((await import('/ui/runtime.js')).runtime.state.learned).length === 1,
    );
    await page.reload();
    await page.locator('.word').waitFor();
    assert.equal(Object.keys((await snapshot(page)).learned).length, 1);

    await page.getByRole('button', { name: '单词库', exact: true }).click();
    await page.locator('#sentence-filter').selectOption('123');
    assert.deepEqual(await page.locator('.library-word').allTextContents(), ['steady', 'improve']);
    await page.locator('.library-word').first().click();
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    await page.getByRole('button', { name: '下一个', exact: true }).click();
    assert.equal(await page.locator('.word').textContent(), 'improve');
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();

    await page.getByRole('button', { name: '单词复习', exact: true }).click();
    await page.locator('input[name=scope][value=favorites-range]').check();
    await page.locator('#favorite-from').fill('focus');
    await page.locator('#favorite-to').fill('improve');
    await page.getByRole('button', { name: '开始复习', exact: true }).click();
    assert.equal(
      await page.evaluate(async () => (await import('/ui/runtime.js')).runtime.session.wordCount),
      3,
    );
    for (const width of [390, 800]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
    }

    // Import another book through the supported API, then reload: demo must not overwrite it.
    page.on('dialog', (dialog) => dialog.accept());
    const other = structuredClone(require('../fixtures/demo-deck.json'));
    other.bookId = 'my-own-book';
    other.title = '独立词库';
    await page.evaluate(async (book) => window.onNativeImport(JSON.stringify(book), 'deck'), other);
    await page.reload();
    await page.locator('.word').waitFor();
    assert.equal((await snapshot(page)).deck.bookId, 'my-own-book');
    assert.equal(Object.keys((await snapshot(page)).learned).length, 0);
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser PASS: real IndexedDB failure/retry, reload, count learning, group123, library navigation, favorite range, custom book, 390/800px',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
