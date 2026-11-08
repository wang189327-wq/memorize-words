import fs from 'node:fs';
import path from 'node:path';

const skipped = new Set([
  '.git',
  '.gradle',
  '.tools-cache',
  'node_modules',
  'build',
  'local-delivery',
]);
export function sourceFiles(directory = '.') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return [];
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(name) : [name.replaceAll('\\', '/')];
  });
}

const failures = [];
for (const file of sourceFiles()) {
  if (
    /(?:^|\/)(?:private|private-data|sources|offline-signing|offline-cloud)\//.test(file) ||
    /\.(?:p12|jks|keystore|apk|aab|zip|idsig)$/i.test(file) ||
    /(?:password\.txt|learning-state\.json|environment\.private|local\.properties)$/.test(file)
  )
    failures.push(`private artifact: ${file}`);
  if (file.endsWith('.jar')) {
    if (file !== 'gradle/wrapper/gradle-wrapper.jar') failures.push(`unexpected jar: ${file}`);
    continue;
  }
  if (file.endsWith('.png')) {
    if (file !== 'android/app/src/main/res/drawable-nodpi/app_icon.png')
      failures.push(`unexpected image: ${file}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (
    /LTAI[a-zA-Z0-9]{12,}/.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
  )
    failures.push(`possible secret: ${file}`);
  if (/[A-Z]:[\\/]Users[\\/][^\s"']+[\\/]\.cache[\\/]codex/.test(text))
    failures.push(`machine-specific runtime: ${file}`);
}
const demo = JSON.parse(fs.readFileSync('web/deck.json', 'utf8'));
if (demo.bookId !== 'wordmemo-demo' || demo.cards.length !== 6)
  failures.push('web/deck.json must contain only the six original demo cards');
if (
  fs.readFileSync('web/deck.json', 'utf8') !==
  fs.readFileSync('tests/fixtures/demo-deck.json', 'utf8')
)
  failures.push('demo fixture differs from bundled sample');
if (!fs.existsSync('LICENSE') || !fs.existsSync('package-lock.json'))
  failures.push('license or dependency lock is missing');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(
  `Public-source check passed (${sourceFiles().length} files); no private book, key or machine runtime included`,
);
