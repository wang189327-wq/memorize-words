const assert = require('node:assert/strict'),
  http = require('node:http'),
  fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const root = path.resolve('web');
  let broken = false;
  const types = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.html': 'text/html',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.css': 'text/css',
    '.png': 'image/png',
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/demo/')) return response.writeHead(404).end();
    const file = path.resolve(root, url.pathname.slice('/demo/'.length) || 'index.html');
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, raw) => {
      if (error) return response.writeHead(404).end();
      if (broken && file.endsWith('sw.js'))
        raw = Buffer.from(raw + '\n// Deliberately broken update fixture\n');
      if (broken && file.endsWith('offline-assets.js'))
        raw = Buffer.from(
          raw
            .toString()
            .replace(/"version": "[^"]+"/, '"version":"broken-fixture"')
            .replace(/"sha256": "[a-f0-9]+"/, '"sha256":"' + '0'.repeat(64) + '"'),
        );
      response
        .writeHead(200, {
          'Content-Type': types[path.extname(file)] || 'text/plain',
          'Cache-Control': 'no-store',
        })
        .end(raw);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('ielts75-mode', 'local'));
    const page = await context.newPage(),
      base = 'http://127.0.0.1:' + server.address().port + '/demo/';
    await page.goto(base);
    await page.locator('.word').waitFor();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole('button', { name: '收藏单词', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    const keys = await page.evaluate(async () => {
      const lists = await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((request) => request.url),
        ),
      );
      return lists.flat();
    });
    assert.ok(keys.some((key) => key.endsWith('/domain/scheduler.js')));
    assert.ok(
      keys.every((key) => !key.includes('/v1/') && !key.includes('/v2/') && !key.endsWith('.apk')),
    );
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(async () => (await navigator.serviceWorker.ready).scope),
      base,
    );
    await context.setOffline(false);
    broken = true;
    const result = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Broken update did not settle')), 15000);
        registration.addEventListener(
          'updatefound',
          () => {
            const worker = registration.installing;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'redundant') {
                clearTimeout(timeout);
                resolve(worker.state);
              }
            });
          },
          { once: true },
        );
        await registration.update();
      });
    });
    assert.equal(result, 'redundant');
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
    assert.equal(
      await page.evaluate(async () =>
        (await caches.keys()).some((key) => key.includes('broken-fixture')),
      ),
      false,
    );
    const native = await browser.newContext();
    await native.addInitScript(() => {
      localStorage.setItem('ielts75-mode', 'local');
      window.AndroidStore = { load: () => '', save: () => true };
    });
    const nativePage = await native.newPage();
    await nativePage.goto(base);
    await nativePage.locator('.word').waitFor();
    assert.equal(
      await nativePage.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
      0,
    );
    await native.close();
    await context.close();
    console.log(
      'Browser offline PASS: subpath shell, offline reload retains progress, failed update preserves old cache, simulated Android skips SW',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
