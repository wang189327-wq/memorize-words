const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const config = require('../../app.config.json');
const source = fs.readFileSync('web/update.js', 'utf8');

function create(enabled = false) {
  let calls = 0,
    download;
  const context = {
    WORDMEMO_CONFIG: {
      ...config,
      updates: {
        enabled,
        manifestUrl: 'https://example.test/version.json',
        releaseBase: 'https://example.test/releases/',
      },
    },
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          versionCode: config.versionCode + 1,
          versionName: '1.4.1',
          downloadUrl: 'https://example.test/releases/1.4.1/app.apk',
          sha256: 'a'.repeat(64),
        }),
      };
    },
    AndroidStore: {
      downloadUpdate: (...args) => {
        download = args;
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { api: context.WordMemoUpdate, calls: () => calls, download: () => download };
}

test('unconfigured forks do not contact a personal update server', async () => {
  const client = create();
  assert.equal(client.calls(), 0);
  await assert.rejects(client.api.check(), /未启用/);
  assert.equal(client.calls(), 0);
});

test('configured manual check uses current version and passes complete manifest to native', async () => {
  const client = create(true);
  assert.equal(client.calls(), 0);
  const info = await client.api.check();
  assert.equal(info.hasUpdate, true);
  client.api.download(info);
  assert.deepEqual(client.download(), [info.downloadUrl, info.sha256, info.versionCode]);
  assert.throws(() => client.api.validate({ ...info, downloadUrl: 'https://other.test/app.apk' }));
});
