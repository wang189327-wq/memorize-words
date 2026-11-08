const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

async function setup() {
  const root = path.resolve('web');
  const server = http.createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const type = file.endsWith('.js')
      ? 'application/javascript'
      : file.endsWith('.json')
        ? 'application/json'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html';
    fs.readFile(file, (error, bytes) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, { 'Content-Type': type }).end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  async function page(mode = 'local') {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript((mode) => localStorage.setItem('ielts75-mode', mode), mode);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.word').waitFor();
    return page;
  }
  return {
    browser,
    page,
    errors,
    close: async () => {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { runtime } = await import('/ui/runtime.js');
    return JSON.parse(JSON.stringify(runtime.state));
  });
}
module.exports = { setup, snapshot };
