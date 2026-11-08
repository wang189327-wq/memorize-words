import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!process.argv.includes('--browser')) {
  const files = ['tests/unit', 'cloud/tests'].flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.test.cjs'))
      .map((file) => `${dir}/${file}`),
  );
  run(['--test', ...files]);
}
if (!process.argv.includes('--unit'))
  for (const file of fs.readdirSync('tests/browser').filter((file) => file.endsWith('.test.cjs'))) {
    run([`tests/browser/${file}`]);
  }
