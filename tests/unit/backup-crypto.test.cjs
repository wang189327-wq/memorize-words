const { test } = require('node:test'),
  assert = require('node:assert/strict');
const C = require('../../web/core.js'),
  demo = require('../fixtures/demo-deck.json');

test('encrypted backups roundtrip Unicode, use unique salt/IV and authenticate ciphertext and metadata', async () => {
  const B = await import('../../web/domain/backup-crypto.js');
  const password = '  中文🔑密码abcdefgh  ',
    value = C.exportBackup(C.emptyState(demo));
  const first = await B.encryptBackup(value, password),
    second = await B.encryptBackup(value, password);
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.deepEqual(await B.decryptBackup(first, password), value);
  const reordered = {
    ciphertext: first.ciphertext,
    cipher: { iv: first.cipher.iv, name: 'AES-GCM' },
    kdf: { salt: first.kdf.salt, iterations: 600000, hash: 'SHA-256', name: 'PBKDF2' },
    version: 1,
    format: first.format,
  };
  assert.deepEqual(await B.decryptBackup(reordered, password), value);
  for (const candidate of [password.trim(), 'wrong-password'])
    await assert.rejects(B.decryptBackup(first, candidate), /密码错误/);
  await assert.rejects(
    B.decryptBackup(
      {
        ...first,
        ciphertext: (first.ciphertext[0] === 'A' ? 'B' : 'A') + first.ciphertext.slice(1),
      },
      password,
    ),
    /损坏/,
  );
  await assert.rejects(
    B.decryptBackup({ ...first, kdf: { ...first.kdf, iterations: 599999 } }, password),
    /损坏/,
  );
  assert.equal(JSON.stringify(first).includes('中文'), false);
});
test('untrusted envelopes reject excess work, unknown fields, malformed encoding and unsupported sizes', async () => {
  const B = await import('../../web/domain/backup-crypto.js');
  const valid = await B.encryptBackup({ small: true }, 'fixture-password');
  for (const envelope of [
    { ...valid, version: 2 },
    { ...valid, extra: true },
    { ...valid, kdf: { ...valid.kdf, extra: true } },
    { ...valid, kdf: { ...valid.kdf, iterations: 1000000000 } },
    { ...valid, kdf: { ...valid.kdf, iterations: 1 } },
    { ...valid, kdf: { ...valid.kdf, iterations: 600000.5 } },
    { ...valid, cipher: { ...valid.cipher, iv: 'AA==' } },
    { ...valid, kdf: { ...valid.kdf, salt: 'AA==' } },
    { ...valid, ciphertext: '?***' },
  ])
    await assert.rejects(B.decryptBackup(envelope, 'fixture-password'));
  await assert.rejects(B.encryptBackup({}, 'short'), /至少8/);
  await assert.rejects(B.encryptBackup({}, 'a'.repeat(1025)), /1024/);
  await assert.rejects(
    B.encryptBackup({ large: '中'.repeat(Math.ceil(B.limits.plaintext / 3)) }, 'fixture-password'),
    /20MiB/,
  );
  assert.throws(() => B.assertBackupFileSize('a'.repeat(B.limits.file + 1)), /30MiB/);
  assert.throws(
    () => B.assertBackupFileSize('中'.repeat(Math.floor(B.limits.file / 3) + 1)),
    /30MiB/,
  );
});
