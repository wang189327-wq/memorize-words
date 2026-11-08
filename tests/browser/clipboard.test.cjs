const assert = require('node:assert/strict'),
  { setup } = require('./helpers.cjs');
(async () => {
  const app = await setup();
  try {
    const page = await app.page();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js'),
        { persist } = await import('/ui/state.js');
      let state = window.WordMemo.markLearned(runtime.state, 'demo-focus', '2026-11-01');
      state = window.WordMemo.markLearned(state, 'demo-adapt', '2026-11-01');
      await persist(state);
    });
    await page.getByRole('button', { name: '单词复习', exact: true }).click();
    await page.getByRole('button', { name: '2026-11-01 · 2 个新词 ›', exact: true }).click();
    await page.getByRole('button', { name: '复制当日单词', exact: true }).click();
    assert.equal(await page.getByLabel('添加序号', { exact: true }).isChecked(), false);
    assert.equal(await page.getByLabel('包含中文释义', { exact: true }).isChecked(), false);
    await page.getByRole('button', { name: '复制', exact: true }).click();
    await page.waitForFunction(() =>
      document.getElementById('toast').textContent.includes('已复制'),
    );
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'),
      'focus\nadapt',
    );
    for (const options of [
      { numbered: true, meanings: false },
      { numbered: false, meanings: true },
      { numbered: true, meanings: true },
    ]) {
      await page.getByRole('button', { name: '复制当日单词', exact: true }).click();
      await page.getByLabel('添加序号', { exact: true }).setChecked(options.numbered);
      await page.getByLabel('包含中文释义', { exact: true }).setChecked(options.meanings);
      await page.getByRole('button', { name: '复制', exact: true }).click();
      await page.locator('#word-copy-dialog').waitFor({ state: 'detached' });
      const expected = await page.evaluate(async (options) => {
        const { runtime } = await import('/ui/runtime.js');
        return (await import('/ui/clipboard.js')).formatWordList(
          window.WordMemo.learnedOn(runtime.state, '2026-11-01'),
          options,
        );
      }, options);
      assert.equal(
        (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'),
        expected,
      );
      assert.equal(expected.split('\n').length, 2);
    }
    await page.getByRole('button', { name: '复制当日单词', exact: true }).click();
    await page.evaluate(() => {
      window.realClipboard = navigator.clipboard;
      window.originalCopyCommand = document.execCommand;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error('fixture unsupported clipboard');
          },
        },
      });
      document.execCommand = function (command) {
        window.fallbackSelectedInDialog =
          document.activeElement?.closest('#word-copy-dialog') !== null;
        return window.originalCopyCommand.call(document, command);
      };
    });
    await page.getByRole('button', { name: '复制', exact: true }).click();
    await page.locator('#word-copy-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.fallbackSelectedInDialog), true);
    assert.equal(
      (await page.evaluate(() => window.realClipboard.readText())).replaceAll('\r\n', '\n'),
      'focus\nadapt',
    );
    await page.evaluate(() => {
      delete navigator.clipboard;
      document.execCommand = window.originalCopyCommand;
    });
    const native = await page.evaluate(async () => {
      let copied;
      window.AndroidStore = {
        copyText: (text) => {
          copied = text;
          return true;
        },
      };
      try {
        await (await import('/ui/clipboard.js')).copyText('focus\nadapt');
        return copied;
      } finally {
        delete window.AndroidStore;
      }
    });
    assert.equal(native, 'focus\nadapt');
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser clipboard PASS: daily learned words copy in source order, one word per line; native bridge contract simulated',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
