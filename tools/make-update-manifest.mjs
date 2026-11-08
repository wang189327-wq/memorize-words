import fs from 'node:fs';
import crypto from 'node:crypto';

const [apk, downloadUrl] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync('app.config.json', 'utf8'));
if (!apk || !downloadUrl)
  throw new Error('Usage: node tools/make-update-manifest.mjs APK HTTPS_DOWNLOAD_URL');
if (!config.updates.enabled || !downloadUrl.startsWith(config.updates.releaseBase))
  throw new Error("Configure this fork's own update releaseBase first");
const url = new URL(downloadUrl);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
  throw new Error('Invalid release URL');
const manifest = {
  versionName: config.versionName,
  versionCode: config.versionCode,
  downloadUrl,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),
};
const directory = `build/releases/${config.versionName}`;
fs.mkdirSync(directory, { recursive: true });
const output = `${directory}/version.json`;
if (
  fs.existsSync(output) &&
  fs.readFileSync(output, 'utf8') !== JSON.stringify(manifest, null, 2) + '\n'
)
  throw new Error(
    'This release already exists with different contents: bump the version instead of overwriting it',
  );
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(output);
