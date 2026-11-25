'use strict';
// Barcha .js fayllarni `node --check` bilan tekshiradi (CI'da qo'lda ro'yxat yuritish shart emas).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'uploads' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

const root = path.join(__dirname, '..');
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'test')), ...walk(__dirname)];
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed += 1;
    console.error(`SYNTAX ERROR: ${path.relative(root, f)}\n${e.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} fayl OK`);
process.exit(failed ? 1 : 0);
