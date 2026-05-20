'use strict';

const path = require('path');
const { repoRoot } = require('../../lib/paths');
const codebaseMapper = require('../../lib/codebase-mapper');

function run(args = []) {
  const root = repoRoot();
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  const r = codebaseMapper.codebaseStatus(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (!r.dirExists) {
    console.log(`.planning/codebase/ not present — run \`cp scaffold-codebase\` first.`);
    process.exit(1);
  }
  console.log(`Codebase dir: ${path.relative(root, r.codebaseDir)}`);
  console.log('');
  console.log('  status  focus     file              lines   bytes');
  console.log('  ------  --------  ----------------  ------  ------');
  for (const row of r.rows) {
    let status;
    if (!row.exists) status = 'missing';
    else if (row.looksStub) status = 'stub   ';
    else status = 'filled ';
    const lines = row.exists ? String(row.lines).padStart(5) : '    -';
    const bytes = row.exists ? String(row.bytes).padStart(5) : '    -';
    console.log(`  ${status} ${row.focus.padEnd(8)}  ${row.file.padEnd(16)} ${lines}  ${bytes}`);
  }
  console.log('');
  console.log(`All present:  ${r.allExist ? '✓' : '✗'}`);
  console.log(`All filled:   ${r.allFilled ? '✓' : '✗ (run /cp-map-codebase)'}`);
}

module.exports = { name: 'codebase-status', run };
