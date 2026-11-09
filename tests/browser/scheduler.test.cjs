const assert = require('node:assert/strict');
const { setup, snapshot } = require('./helpers.cjs');
(async () => {
  const app = await setup();
  try {
    const page = await app.page();
    await page.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js'),
        { persist } = await import('/ui/state.js');
      await persist(window.WordMemo.markLearned(runtime.state, 'demo-focus', '2026-11-01'));
    });
    await page.getByRole('button', { name: '单词复习', exact: true }).click();
    await page.locator('input[name=scope][value=due]').check();
    await page.locator('input[name=mode][value=spelling]').check();
    await page.getByRole('button', { name: '开始复习', exact: true }).click();
    await page.getByRole('button', { name: '查看答案', exact: true }).click();
    await page.getByRole('button', { name: '记得', exact: true }).click();
    await page.locator('#answer').fill('focus');
    await page.getByRole('button', { name: '提交答案', exact: true }).click();
    assert.equal((await snapshot(page)).ratingEvents?.length || 0, 0);
    await page.getByRole('button', { name: '熟悉', exact: true }).click();
    await page.getByText('本轮复习完成', { exact: true }).waitFor();
    const saved = await snapshot(page);
    assert.equal(saved.ratingEvents.length, 1);
    assert.equal(saved.ratingEvents[0].rating, 3);
    assert.equal(saved.results.length, 2);
    await page.reload();
    await page.locator('.word').waitFor();
    assert.equal((await snapshot(page)).ratingEvents.length, 1);
    assert.deepEqual((await snapshot(page)).schedules, saved.schedules);
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser scheduler PASS: due selection, two modes yield one deliberate rating, reload rebuilds identical schedule',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
