'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const milestone = require('../../lib/milestone');

function run(args = []) {
  const root = repoRoot();
  let planId = null;
  let fromPath = null;
  let bodyPath = null;
  let overwrite = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') fromPath = args[++i];
    else if (a === '--body') bodyPath = args[++i];
    else if (a === '--overwrite') overwrite = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!planId) planId = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!planId || !fromPath) {
    console.error('Usage: cp write-summary <plan-id> --from <json> [--body <md>] [--overwrite] [--dry-run]');
    process.exit(2);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
  } catch (e) {
    console.error(`failed to read JSON from ${fromPath}: ${e.message}`);
    process.exit(1);
  }
  const body = bodyPath ? fs.readFileSync(bodyPath, 'utf8') : undefined;
  let r;
  try {
    r = milestone.writeSummary(root, planId, data, { dryRun, body, overwrite });
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err.code === 'EVALIDATION')) {
      process.stderr.write(err.message + '\n');
      process.exit(2);
    }
    throw err;
  }
  console.log(`${dryRun ? '·' : '✓'} ${path.relative(root, r.path)}`);
  if (dryRun) {
    console.log('--- normalised frontmatter ---');
    console.log(JSON.stringify(r.fm, null, 2));
  }
}

module.exports = { name: 'write-summary', run };
