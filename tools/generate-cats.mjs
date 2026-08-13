#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, '..', 'generate-avatar', 'bin', 'generate-avatar.mjs');

try {
  await access(APP);
} catch {
  console.error(
    '❌ App generate-avatar introuvable.\n' +
      '   Attendu : ../generate-avatar/ (à côté de cat-math)\n' +
      '   Puis : cd ../generate-avatar && npm i && npm link',
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    APP,
    '-f',
    join(ROOT, 'data', 'cats.json'),
    '-o',
    join(ROOT, 'assets', 'cats'),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: process.env },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
