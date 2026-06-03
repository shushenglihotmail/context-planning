'use strict';

/**
 * `cp run-verify <slug> [--command "<cmd>"] [--skip] [--cwd <path>] [--json]`
 *
 * Non-LLM scaffold subcommand: runs the project's test command and
 * propagates its exit code. Used by the v1.10 milestone workflow verify
 * gate (phase 117) — but also callable standalone for any run.
 *
 * Resolution: --command > .planning/config.json:cp.behavior.test_command
 *             > auto-detect (npm/pytest/cargo/go) > warn+exit-0.
 */

const { repoRoot } = require('../../lib/paths');
const verify = require('../../lib/verify');

function _arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function run(args) {
  args = args || [];
  const json = args.includes('--json');
  const skip = args.includes('--skip');
  const command = _arg(args, '--command');
  const cwd = _arg(args, '--cwd');

  const flagValueIdxs = new Set();
  ['--command', '--cwd'].forEach((f) => {
    const i = args.indexOf(f);
    if (i >= 0) flagValueIdxs.add(i + 1);
  });
  const slug = args.find((a, i) => !a.startsWith('--') && !flagValueIdxs.has(i)) || null;

  if (!slug) {
    const msg = 'usage: cp run-verify <slug> [--command "<cmd>"] [--skip] [--cwd <path>] [--json]';
    if (json) {
      console.log(JSON.stringify({ ok: false, error: 'missing slug' }));
      process.exit(2);
    }
    console.error(msg);
    process.exit(2);
  }

  const projectDir = cwd || repoRoot();
  const r = verify.runVerify(slug, {
    projectDir,
    override: command,
    skip,
    silent: json,
  });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.exitCode || 0);
    return;
  }
  // Non-JSON: stdio was inherited so the user already saw the test output.
  // Emit a single summary line for clarity, then propagate exit code.
  if (r.source === 'skip') {
    console.log(`cp run-verify: skipped (slug=${slug})`);
  } else if (r.source === 'none') {
    // Warning was already printed by lib/verify; nothing more to add.
  } else if (r.ok) {
    console.log(`✓ cp run-verify: tests passed via ${r.source} (${r.command})`);
  } else {
    console.error(`✗ cp run-verify: tests FAILED via ${r.source} (${r.command}) — exit ${r.exitCode}`);
  }
  process.exit(r.exitCode);
}

module.exports = { name: 'run-verify', run, runVerify: verify.runVerify };
