'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const importer = require('../../lib/import');
const init = require('./init');

function resolveAuditRoot(rootArg) {
  if (!rootArg) return repoRoot();
  const abs = path.resolve(rootArg);
  if (!fs.existsSync(abs)) {
    console.error(`--root path does not exist: ${abs}`);
    process.exit(2);
  }
  // Walk up from abs looking for .git or .planning, like repoRoot() does.
  let dir = abs;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.planning'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return abs;
}

function run(args = []) {
  let rootArg = null;
  let json = false;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root') rootArg = args[++i];
    else if (a === '--json') json = true;
    else if (a === '--apply') apply = true;
    else if (a === '-h' || a === '--help') {
      console.log(`Usage: cp gsd-import [--root <dir>] [--json] [--apply]

Read-only audit of a planning project (defaults to the current repo). Reports
GSD/cp compatibility, sentinel files, phase inventory, frontmatter health, and
what \`cp init\` would change. Never modifies anything unless --apply.

Options:
  --root <dir>   Audit <dir> instead of the current repo (still searches up
                 from <dir> for a .git or .planning marker)
  --json         Emit the raw report as JSON instead of human-readable text
  --apply        After printing the audit, run \`cp init\` against the target
                 root (additive only — GSD files are never rewritten)

Exit codes:
  0   clean / nothing to do
  1   errors found (parse failures or required files missing)
  2   changes pending (run with --apply or \`cp init\` to apply)
`);
      return;
    } else {
      console.error(`unknown gsd-import option: ${a}`);
      process.exit(2);
    }
  }

  const target = resolveAuditRoot(rootArg);
  const report = importer.audit(target);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(importer.render(report));
  }

  if (apply) {
    console.log('');
    console.log(`--apply: running \`cp init\` against ${target} ...`);
    console.log('');
    const prevCwd = process.cwd();
    process.chdir(target);
    try {
      init.run();
    } finally {
      process.chdir(prevCwd);
    }
    return;
  }

  process.exit(importer.exitCode(report));
}

module.exports = { name: 'gsd-import', run };
