const assert = require('node:assert/strict');
const { setup, snapshot } = require('./helpers.cjs');

(async () => {
  const app = await setup();
  try {
    const page = await app.page();
    await page.evaluate(() => {
      window.cspBlocked = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.cspBlocked.push(event.effectiveDirective),
      );
      const script = document.createElement('script');
      script.textContent = 'window.untrustedScriptRan = true';
      document.body.append(script);
    });
    await page.waitForFunction(() => window.cspBlocked.includes('script-src-elem'));
    assert.equal(await page.evaluate(() => window.untrustedScriptRan), undefined);
    await page.evaluate(async () => {
      const { runtime } = await import('/ui/runtime.js');
      const { applyAppearance } = await import('/ui/settings.js');
      runtime.appearance = { size: 20, theme: 'green' };
      applyAppearance(true);
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.style.getPropertyValue('--reading-scale')),
      '1.25',
    );
    const downloaded = page.waitForEvent('download');
    await page.evaluate(async () => (await import('/ui/backup.js')).exportBackup());
    const stream = await (await downloaded).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    assert.equal(JSON.parse(raw).deck.cards.length, 6);
    page.on('dialog', (dialog) => dialog.accept());
    await page.evaluate(async (raw) => window.onNativeImport(raw, 'restore'), raw);
    assert.equal((await snapshot(page)).deck.cards.length, 6);
    assert.deepEqual(app.errors, []);
    console.log(
      'Browser security PASS: inline scripts blocked; dynamic theme, JSON download and restore remain usable',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
