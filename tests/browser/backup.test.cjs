const assert = require('node:assert/strict');
const { setup, snapshot } = require('./helpers.cjs');

(async () => {
  const app = await setup();
  try {
    const page = await app.page(),
      password = ' 中文密码-fixture-🔑 ';
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '展开本地学习记录', exact: true }).click();
    await page.getByRole('button', { name: '导出加密备份', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await page.locator('#backup-password-dialog').count(), 0);
    await page.getByRole('button', { name: '导出加密备份', exact: true }).click();
    await page.getByLabel('备份密码', { exact: true }).fill(password);
    await page.getByLabel('再次输入备份密码', { exact: true }).fill('mismatch');
    await page.getByRole('button', { name: '加密并导出', exact: true }).click();
    await page.getByText('两次输入的密码不一致。', { exact: true }).waitFor();
    await page.getByLabel('再次输入备份密码', { exact: true }).fill(password);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '加密并导出', exact: true }).click();
    const chunks = [];
    for await (const chunk of await (await downloading).createReadStream()) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    assert.equal(JSON.parse(raw.toString()).format, 'memorize-words-encrypted-backup');
    assert.equal(raw.includes(Buffer.from('demo-focus')), false);
    assert.equal(await page.locator('input[type=password]').count(), 0);
    await page.getByRole('button', { name: '新词学习', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).click();
    await page.getByRole('button', { name: '收藏单词', exact: true }).waitFor();
    const before = await snapshot(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const expand = page.getByRole('button', { name: '展开本地学习记录', exact: true });
    if (await expand.count()) await expand.click();
    async function restore(value) {
      const choosing = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '从备份恢复', exact: true }).click();
      await (
        await choosing
      ).setFiles({ name: 'encrypted-backup.json', mimeType: 'application/json', buffer: raw });
      await page.getByLabel('备份密码', { exact: true }).fill(value);
      await page.getByRole('button', { name: '解密备份', exact: true }).click();
    }
    await restore('wrong-password');
    await page.waitForFunction(() =>
      document.getElementById('toast').textContent.includes('密码错误'),
    );
    assert.deepEqual(await snapshot(page), before);
    page.on('dialog', (dialog) => dialog.accept());
    await restore(password);
    await page.waitForFunction(() =>
      document.getElementById('toast').textContent.includes('备份已恢复'),
    );
    assert.equal((await snapshot(page)).favorites['demo-focus'], true);
    assert.equal(
      await page.evaluate((password) => JSON.stringify(localStorage).includes(password), password),
      false,
    );
    assert.equal(await page.locator('input[type=password]').count(), 0);
    await page.reload();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser encrypted backup PASS: cancel/mismatch, download, wrong-password preserves state, confirmed restore and reload, no persisted password',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
