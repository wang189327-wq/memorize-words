/** Curated README screenshots use only original demo cards and fictitious local progress. */
const fs = require('node:fs');
const { setup } = require('../tests/browser/helpers.cjs');
(async () => {
  const app = await setup();
  try {
    const page = await app.page();
    await page.setViewportSize({ width: 390, height: 844 });
    fs.mkdirSync('docs/images', { recursive: true });
    await page.locator('#learning-options summary').click();
    await page.getByLabel('新词数量', { exact: true }).fill('3');
    await page.screenshot({ path: 'docs/images/learn.png' });
    await page.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js'),
        { persist } = await import('/ui/state.js');
      let state = window.WordMemo.markLearned(runtime.state, 'demo-focus', '2026-11-01');
      state = window.WordMemo.markLearned(state, 'demo-adapt', '2026-11-01');
      await persist(state);
    });
    await page.getByRole('button', { name: '单词复习', exact: true }).click();
    await page.locator('input[name=scope][value=due]').check();
    await page.screenshot({ path: 'docs/images/review.png' });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '展开本地学习记录', exact: true }).click();
    await page.screenshot({ path: 'docs/images/settings.png' });
    console.log('Captured three curated original-demo product screenshots; no private user data.');
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
