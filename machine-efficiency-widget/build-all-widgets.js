/**
 * Build portable .exe for every machine listed in _all-machines.json
 * (or pass JSON path as argv[2]).
 *
 * Usage:
 *   node build-all-widgets.js
 *   node build-all-widgets.js _all-machines.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const listPath = path.resolve(root, process.argv[2] || '_all-machines.json');

if (!fs.existsSync(listPath)) {
  console.error('Missing machine list:', listPath);
  console.error('Create it or run the API fetch first.');
  process.exit(1);
}

const rawText = fs.readFileSync(listPath, 'utf8').replace(/^\uFEFF/, '');
const raw = JSON.parse(rawText);
const list = (Array.isArray(raw) ? raw : []).filter((x) => x && x.machine && x.process);

if (!list.length) {
  console.error('No machines in', listPath);
  process.exit(1);
}

console.log(`Building ${list.length} widgets…\n`);

const results = [];
for (let i = 0; i < list.length; i++) {
  const { machine, process: processCd } = list[i];
  console.log(`\n======== [${i + 1}/${list.length}] ${machine} (${processCd}) ========`);
  const r = spawnSync(process.execPath, [path.join(root, 'build-widget.js'), machine, processCd], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  const ok = r.status === 0;
  const exePath = path.join(root, 'dist', `${machine}.exe`);
  results.push({ machine, process: processCd, ok, exe: fs.existsSync(exePath) ? exePath : null });
  if (!ok) {
    console.error('FAILED:', machine);
  }
}

console.log('\n======== SUMMARY ========');
for (const row of results) {
  console.log(row.ok ? 'OK ' : 'FAIL', row.process, row.machine, row.exe || '');
}
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
