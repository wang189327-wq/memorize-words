import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { analyze } from 'eslint-scope';

const browserGlobals = new Set(
  `window document localStorage console navigator location URL Blob fetch indexedDB crypto setTimeout clearTimeout setInterval clearInterval confirm matchMedia speechSynthesis SpeechSynthesisUtterance AndroidStore globalThis module require Array Object String Number Boolean Date JSON Math Promise Error TypeError Set Map Uint8Array AbortController AbortSignal Infinity NaN undefined`.split(
    ' ',
  ),
);
const files = [
  'web/app.js',
  ...fs
    .readdirSync('web/ui')
    .filter((name) => name.endsWith('.js'))
    .map((name) => `web/ui/${name}`),
];
let errors = 0;
for (const file of files) {
  const ast = parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ranges: true,
  });
  const scope = analyze(ast, { ecmaVersion: 2024, sourceType: 'module', optimistic: true });
  for (const reference of scope.globalScope.through) {
    if (!browserGlobals.has(reference.identifier.name)) {
      console.error(`${file}: unresolved identifier ${reference.identifier.name}`);
      errors++;
    }
  }
  for (const node of ast.body.filter((node) => node.type === 'ImportDeclaration')) {
    if (!fs.existsSync(path.resolve(path.dirname(file), node.source.value))) {
      console.error(`${file}: missing import ${node.source.value}`);
      errors++;
    }
  }
}
if (errors) process.exit(1);
console.log(
  `Linted ${files.length} ES modules: no unresolved application globals or missing imports`,
);
