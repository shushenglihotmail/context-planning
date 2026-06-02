'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const milestone = require('../../lib/milestone');

function printUsage(stream) {
  stream.write(
    'Usage: cp write-summary <plan-id> --from <json> [--body <md>] [--overwrite]\n' +
    '                                    [--dry-run] [--no-auto-key-files]\n' +
    '                                    [--no-file-check] [--no-expected-check]\n' +
    '                                    [--strict-expected]\n' +
    '\n' +
    '  Render a plan\'s SUMMARY.md from a JSON frontmatter file and an\n' +
    '  optional Markdown body. Validates against the SUMMARY schema and\n' +
    '  checks declared file paths exist on disk by default.\n' +
    '\n' +
    'Args:\n' +
    '  <plan-id>             Plan identifier like "P1", "p1", or "1".\n' +
    '\n' +
    'Required:\n' +
    '  --from <json>         Path to the JSON file with frontmatter fields.\n' +
    '\n' +
    'Flags:\n' +
    '  --body <md>           Path to a Markdown body to embed after frontmatter.\n' +
    '  --overwrite           Overwrite an existing SUMMARY.md (default: refuse).\n' +
    '  --dry-run             Print the normalised frontmatter; write nothing.\n' +
    '  --no-auto-key-files   Skip auto-population of key_files from JSON.\n' +
    '  --no-file-check       Skip the on-disk existence check for declared files.\n' +
    '  --no-expected-check   Skip the expected-vs-actual check against PLAN.md.\n' +
    '  --strict-expected     Treat the expected-vs-actual check as fatal.\n' +
    '  -h, --help            Show this message and exit.\n' +
    '\n' +
    'Examples:\n' +
    '  cp write-summary P1 --from summary.json\n' +
    '  cp write-summary P1 --from summary.json --body notes.md\n' +
    '  cp write-summary P1 --from summary.json --dry-run\n'
  );
}

function run(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage(process.stdout);
    process.exit(0);
  }
  const root = repoRoot();
  let planId = null;
  let fromPath = null;
  let bodyPath = null;
  let overwrite = false;
  let dryRun = false;
  let autoKeyFiles = true;
  let checkFileExistence = true;
  let expectedCheck = true;
  let strictExpected = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') fromPath = args[++i];
    else if (a === '--body') bodyPath = args[++i];
    else if (a === '--overwrite') overwrite = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--no-auto-key-files') autoKeyFiles = false;
    else if (a === '--no-file-check') {
      checkFileExistence = false;
      try { process.stderr.write('cp: --no-file-check is deprecated; update PLAN.md to omit expected-key-files if validation is not needed.\n'); } catch (_) {}
    }
    else if (a === '--no-expected-check') expectedCheck = false;
    else if (a === '--strict-expected') strictExpected = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!planId) planId = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!planId || !fromPath) {
    printUsage(process.stderr);
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
    r = milestone.writeSummary(root, planId, data, { dryRun, body, overwrite, autoKeyFiles, checkFileExistence, expectedCheck, strictExpected });
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
