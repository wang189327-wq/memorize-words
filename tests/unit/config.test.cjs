const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../app.config.json');

test('fork guard accepts owner and disabled channels, rejects accidentally retained owner URLs', async () => {
  const { checkConfig, upstreamRepository } = await import('../../tools/check-config.mjs');
  assert.deepEqual(checkConfig(config, upstreamRepository), []);
  assert.deepEqual(checkConfig({ ...config, updates: { enabled: false } }, 'someone/fork'), []);
  assert.match(checkConfig(config, 'someone/fork').join(' '), /Fork detected/);
  for (const replaced of ['manifestUrl', 'releaseBase']) {
    const copy = structuredClone(config);
    copy.updates[replaced] =
      replaced === 'manifestUrl'
        ? 'https://someone.github.io/fork/version.json'
        : 'https://github.com/someone/fork/releases/download/';
    assert.match(checkConfig(copy, 'someone/fork').join(' '), /Fork detected/);
  }
  const own = {
    ...config,
    updates: {
      enabled: true,
      manifestUrl: 'https://someone.github.io/fork/version.json',
      releaseBase: 'https://github.com/someone/fork/releases/download/',
    },
  };
  assert.deepEqual(checkConfig(own, 'someone/fork'), []);
});

test('release configuration rejects malformed version, package and insecure download endpoints', async () => {
  const { checkConfig } = await import('../../tools/check-config.mjs');
  assert.ok(checkConfig({ ...config, versionCode: 0 }).length);
  assert.ok(checkConfig({ ...config, applicationId: 'invalid package' }).length);
  assert.ok(
    checkConfig({
      ...config,
      updates: {
        enabled: true,
        manifestUrl: 'http://example.com/version.json',
        releaseBase: 'https://user:pass@example.com/',
      },
    }).length,
  );
});
