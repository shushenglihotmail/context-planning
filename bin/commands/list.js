'use strict';

/**
 * `cp list [--workflow <id>] [--status <s>] [--json]`
 *
 * Enumerate .planning/runs/*.
 */

const { repoRoot } = require('../../lib/paths');
const lifecycle = require('../../lib/run-lifecycle');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const workflow = _arg(args, '--workflow');
  const status = _arg(args, '--status');
  const r = lifecycle.list({ workflow, status, projectDir: repoRoot() });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (r.runs.length === 0) {
    console.log('(no runs)');
    return;
  }
  console.log('slug                                              workflow         status        updated');
  for (const x of r.runs) {
    const slug = String(x.slug).padEnd(50);
    const wf = String(x.workflow || '-').padEnd(16);
    const st = String(x.status || '-').padEnd(13);
    const up = String(x.updated || '-');
    console.log(`${slug}${wf}${st}${up}`);
  }
}

module.exports = { name: 'list', run };
