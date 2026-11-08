/** Password-protected portable backups. No password is persisted and no network is used. */
export const limits = { plaintext: 20 * 1024 * 1024, file: 30 * 1024 * 1024 };
const encoder = new TextEncoder();
export const encryptedFormat = 'memorize-words-encrypted-backup';
const format = encryptedFormat;
const exactFields = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));

/** Shared file limit matches the native document importer, measured in UTF-8 bytes. */
export function assertBackupFileSize(raw) {
  if (typeof raw !== 'string' || encoder.encode(raw).length > limits.file)
    throw Error('备份文件不能超过30MiB。');
}
function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function decode(text, max) {
  if (
    typeof text !== 'string' ||
    text.length > Math.ceil(max / 3) * 4 ||
    text.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(text)
  )
    throw Error('备份编码或大小无效。');
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  if (bytes.length > max) throw Error('备份超过支持的大小。');
  return bytes;
}
async function key(password, header) {
  if (typeof password !== 'string' || !password || encoder.encode(password).length > 1024)
    throw Error('密码不能为空且不能超过1024字节。');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: decode(header.kdf.salt, 16),
      iterations: header.kdf.iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptBackup(value, password) {
  if (Array.from(password || '').length < 8) throw Error('备份密码至少8个字符。');
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > limits.plaintext) throw Error('加密备份原文不能超过20MiB。');
  const header = {
    format,
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 600000,
      salt: base64(crypto.getRandomValues(new Uint8Array(16))),
    },
    cipher: { name: 'AES-GCM', iv: base64(crypto.getRandomValues(new Uint8Array(12))) },
  };
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: decode(header.cipher.iv, 12),
      additionalData: encoder.encode(JSON.stringify(header)),
      tagLength: 128,
    },
    await key(password, header),
    bytes,
  );
  return { ...header, ciphertext: base64(new Uint8Array(ciphertext)) };
}
export async function decryptBackup(envelope, password) {
  if (
    !exactFields(envelope, ['format', 'version', 'kdf', 'cipher', 'ciphertext']) ||
    envelope.format !== format ||
    envelope.version !== 1 ||
    !exactFields(envelope.kdf, ['name', 'hash', 'iterations', 'salt']) ||
    !exactFields(envelope.cipher, ['name', 'iv']) ||
    envelope.kdf?.name !== 'PBKDF2' ||
    envelope.kdf.hash !== 'SHA-256' ||
    !Number.isInteger(envelope.kdf.iterations) ||
    envelope.kdf.iterations < 100000 ||
    envelope.kdf.iterations > 1000000 ||
    envelope.cipher?.name !== 'AES-GCM'
  )
    throw Error('加密备份参数无效。');
  // Canonical field order permits harmless JSON formatting/member-order changes.
  const header = {
    format,
    version: 1,
    kdf: {
      name: envelope.kdf.name,
      hash: envelope.kdf.hash,
      iterations: envelope.kdf.iterations,
      salt: envelope.kdf.salt,
    },
    cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv },
  };
  if (decode(header.kdf.salt, 16).length !== 16 || decode(header.cipher.iv, 12).length !== 12)
    throw Error('加密备份参数无效。');
  const bytes = decode(envelope.ciphertext, limits.plaintext + 16);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(header.cipher.iv, 12),
        additionalData: encoder.encode(JSON.stringify(header)),
        tagLength: 128,
      },
      await key(password, header),
      bytes,
    );
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw Error('密码错误，或备份已损坏。');
  }
}
