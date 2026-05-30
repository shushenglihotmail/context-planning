'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot } = require('../../lib/paths');
const provider = require('../../lib/provider');
const lifecycle = require('../../lib/lifecycle');
const worktree = require('../../lib/worktree');

function printUsage(stream) {
  stream.write(
    'Usage: cp worktree <create|list|remove> [...]\n' +
    '\n' +
    '  Manage cp-tracked git worktrees registered in\n' +
    '  .planning/WORKTREES.md.\n' +
    '\n' +
    'Subcommands:\n' +
    '  create <name>   Create a new worktree and register it.\n' +
    '  list            List registered worktrees (with on-disk status).\n' +
    '  remove <slug>   Remove a worktree and its registry entry.\n' +
    '\n' +
    'Flags:\n' +
    '  -h, --help      Show this message and exit.\n' +
    '\n' +
    'Run `cp worktree <subcommand> --help` for per-subcommand options.\n'
  );
}

function printCreateUsage(stream) {
  stream.write(
    'Usage: cp worktree create <name> [--branch <b>] [--from <base>]\n' +
    '                                 [--path <dir>] [--phase <N>]\n' +
    '                                 [--no-create] [--no-commit] [--dry-run]\n' +
    '                                 [--use-provider]\n' +
    '\n' +
    '  Run `git worktree add` and append a row to .planning/WORKTREES.md.\n' +
    '\n' +
    'Args:\n' +
    '  <name>          Free-form worktree name (slugified for paths).\n' +
    '\n' +
    'Flags:\n' +
    '  --branch <b>    Branch name (default: phase/<slug>).\n' +
    '  --from <base>   Base ref for the new branch (default: current HEAD).\n' +
    '  --path <dir>    Worktree directory (default: ../<repo>-<slug>).\n' +
    '  --phase <N>     Phase number to associate with this worktree.\n' +
    '  --no-create     Skip `git worktree add`; only register in WORKTREES.md.\n' +
    '  --no-commit     Write WORKTREES.md but skip the auto-commit.\n' +
    '  --dry-run       Print what would change without writing.\n' +
    '  --use-provider  Hand off to the provider\'s worktree skill (if any).\n' +
    '  -h, --help      Show this message and exit.\n' +
    '\n' +
    'Examples:\n' +
    '  cp worktree create p7-parallel-phases --phase 7\n' +
    '  cp worktree create review --from main --branch review/codex\n'
  );
}

function printListUsage(stream) {
  stream.write(
    'Usage: cp worktree list [--json]\n' +
    '\n' +
    '  List worktrees registered in .planning/WORKTREES.md and cross-\n' +
    '  reference each entry with `git worktree list`.\n' +
    '\n' +
    'Flags:\n' +
    '  --json          Output JSON with both the registry and git\'s view.\n' +
    '  -h, --help      Show this message and exit.\n'
  );
}

function printRemoveUsage(stream) {
  stream.write(
    'Usage: cp worktree remove <slug> [--force] [--no-commit]\n' +
    '\n' +
    '  Run `git worktree remove` and drop the matching row from\n' +
    '  .planning/WORKTREES.md. Use `cp worktree list` to find slugs.\n' +
    '\n' +
    'Args:\n' +
    '  <slug>          The slug shown by `cp worktree list`.\n' +
    '\n' +
    'Flags:\n' +
    '  --force         Pass --force to `git worktree remove`.\n' +
    '  --no-commit     Write WORKTREES.md but skip the auto-commit.\n' +
    '  -h, --help      Show this message and exit.\n'
  );
}

// Best-effort canonical path: collapses Windows short names (FOO~1) and
// resolves symlinks. Falls back to path.resolve() if the path doesn't
// exist (which can happen for registry entries whose worktree was
// removed externally).
//
// On Windows, the JS realpathSync historically preserves 8.3 short
// names while realpathSync.native (GetFinalPathNameByHandle) expands
// them. Try .native first.
function canonical(p) {
  const realNative = fs.realpathSync.native;
  if (realNative) {
    try { return realNative(p); } catch { /* fall through */ }
  }
  try { return fs.realpathSync(p); }
  catch { return path.resolve(p); }
}

function samePath(a, b) {
  const ca = canonical(a);
  const cb = canonical(b);
  if (process.platform === 'win32') {
    return ca.toLowerCase() === cb.toLowerCase();
  }
  return ca === cb;
}

function runCreate(args, root) {
  if (args.includes('--help') || args.includes('-h')) {
    printCreateUsage(process.stdout);
    process.exit(0);
  }
  let name = null;
  let branch = null;
  let from = null;
  let wpath = null;
  let phase = null;
  let noCreate = false;
  let noCommit = false;
  let dryRun = false;
  let useProvider = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--branch') branch = args[++i];
    else if (a === '--from') from = args[++i];
    else if (a === '--path') wpath = args[++i];
    else if (a === '--phase') phase = args[++i];
    else if (a === '--no-create') noCreate = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--use-provider') useProvider = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!name) { printCreateUsage(process.stderr); process.exit(2); }

  const slug = worktree.slugify(name);
  const finalPath = wpath ? path.resolve(wpath) : worktree.defaultWorktreePath(root, slug);
  const finalBranch = branch || worktree.defaultBranchName(slug);

  // Provider delegation: when --use-provider is set, resolve the worktree
  // role and emit a hand-off line. The harness is responsible for
  // invoking the named skill; cp still records the registry entry so
  // future `cp worktree list` shows it.
  if (useProvider) {
    const skill = provider.resolveSkill('worktree', root);
    if (skill.installed && skill.skill) {
      console.log(`Provider hand-off:`);
      console.log(`  provider: ${skill.name}${skill.fallback ? ' (fallback)' : ''}`);
      console.log(`  skill:    ${skill.skill}`);
      console.log(`  invoke:   load the "${skill.skill}" skill, then run:`);
      console.log(`              git worktree add ${finalPath} -b ${finalBranch}${from ? ' ' + from : ''}`);
      console.log(`  registry: cp will record .planning/WORKTREES.md when you re-run without --use-provider`);
      console.log(`  (cp did NOT create the worktree itself — provider in charge)`);
      process.exitCode = 0;
      return;
    }
    console.error(`--use-provider: no worktree skill available (configured: ${skill.name}, installed: ${skill.installed}).`);
    console.error(`Falling back to cp-native worktree creation. Re-run without --use-provider to silence this message.`);
  }

  // Native path: shell out via lib/worktree.runGitWorktreeAdd (v0.4.4).
  const created = worktree.isoDay();
  if (!noCreate && !dryRun) {
    const r = worktree.runGitWorktreeAdd(root, { worktreePath: finalPath, branch: finalBranch, from });
    if (r.status !== 0) {
      const gitArgs = ['worktree', 'add', finalPath, '-b', finalBranch].concat(from ? [from] : []);
      console.error(`git ${gitArgs.join(' ')} failed:`);
      if (r.stdout) process.stderr.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      process.exit(1);
    }
    process.stdout.write(r.stdout || '');
  } else if (noCreate) {
    console.log(`(--no-create) skipping git worktree add ${finalPath} -b ${finalBranch}${from ? ' ' + from : ''}`);
  } else {
    console.log(`(dry-run) would run: git worktree add ${finalPath} -b ${finalBranch}${from ? ' ' + from : ''}`);
  }

  const entry = {
    slug,
    branch: finalBranch,
    path: finalPath,
    phase: phase || null,
    created,
    notes: '',
  };

  const r = worktree.addRegistryEntry(root, entry);
  if (r.alreadyPresent) {
    console.log(`(note: an entry for slug "${slug}" was already in WORKTREES.md — updated path/branch in place)`);
  }
  if (dryRun) {
    console.log(`(dry-run) would update ${path.relative(root, worktree.worktreesPath(root))}`);
    return;
  }
  lifecycle.writeBatch(r.actions);
  console.log(`✓ worktree registered:  ${slug}  →  ${finalPath}  (branch ${finalBranch})`);

  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: register worktree ${slug}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function runList(args, root) {
  if (args.includes('--help') || args.includes('-h')) {
    printListUsage(process.stdout);
    process.exit(0);
  }
  const json = args.includes('--json');
  const entries = worktree.listRegistry(root);

  // Cross-reference with git's view via lib/worktree.listGitWorktrees (v0.4.4).
  const gitTrees = worktree.listGitWorktrees(root);

  if (json) {
    console.log(JSON.stringify({ registered: entries, git: gitTrees }, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(`No cp-tracked worktrees yet.`);
    console.log(`Create one with:  cp worktree create <name>`);
    return;
  }

  console.log(`Registered worktrees (.planning/WORKTREES.md):`);
  for (const e of entries) {
    const onDisk = gitTrees.find((g) => samePath(g.path, e.path));
    const status = onDisk ? '✓ on disk' : '✗ missing';
    console.log(`  ${e.slug.padEnd(20)} ${e.branch.padEnd(28)} ${status}`);
    console.log(`    ${e.path}${e.phase ? '  [phase ' + e.phase + ']' : ''}`);
  }
}

function runRemove(args, root) {
  if (args.includes('--help') || args.includes('-h')) {
    printRemoveUsage(process.stdout);
    process.exit(0);
  }
  let slug = null;
  let force = false;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--force') force = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!slug) slug = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!slug) { printRemoveUsage(process.stderr); process.exit(2); }

  const r = worktree.removeRegistryEntry(root, slug);
  if (!r.removed) {
    console.error(`No worktree registered under slug "${slug}". Run \`cp worktree list\` to see slugs.`);
    process.exit(1);
  }

  // Shell out via lib/worktree.runGitWorktreeRemove (v0.4.4).
  const gr = worktree.runGitWorktreeRemove(root, { worktreePath: r.removed.path, force });
  if (gr.status !== 0) {
    const gitArgs = ['worktree', 'remove'].concat(force ? ['--force'] : []).concat([r.removed.path]);
    console.error(`git ${gitArgs.join(' ')} failed:`);
    if (gr.stdout) process.stderr.write(gr.stdout);
    if (gr.stderr) process.stderr.write(gr.stderr);
    console.error(`\n(Registry entry NOT removed. Pass --force to remove anyway, or clean up the worktree first.)`);
    process.exit(1);
  }
  if (gr.stdout) process.stdout.write(gr.stdout);

  lifecycle.writeBatch(r.actions);
  console.log(`✓ worktree removed:  ${slug}  (${r.removed.path})`);

  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: remove worktree ${slug}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function run(args = []) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printUsage(process.stdout);
    process.exit(0);
  }
  const sub = args.shift();
  const root = repoRoot();

  if (sub === 'create') return runCreate(args, root);
  if (sub === 'list')   return runList(args, root);
  if (sub === 'remove' || sub === 'rm') return runRemove(args, root);
  console.error(`Unknown worktree subcommand: ${sub}`);
  printUsage(process.stderr);
  process.exit(2);
}

module.exports = { name: 'worktree', run };
