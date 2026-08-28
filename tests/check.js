/* ============================================================
   墨泉 · 语法检查（npm run check）
   用法：node tests/check.js
   对全部 JS 文件做 node --check 语法校验，跨平台（不依赖 shell 语法）
   ============================================================ */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f));
}

const files = [
  ...collect(path.join(root, 'js')),
  ...collect(path.join(root, 'tests')),
  path.join(root, 'sw.js'),
  path.join(root, 'proxy.js'),
  path.join(root, 'playwright.config.js'),
].filter(f => fs.existsSync(f));

let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status === 0) {
    console.log('  ✅ ' + path.relative(root, file));
  } else {
    failed++;
    console.log('  ❌ ' + path.relative(root, file));
    if (r.stderr) console.log(r.stderr.trim());
  }
}

console.log(`\n语法检查：${files.length - failed}/${files.length} 通过`);
if (failed) process.exit(1);
