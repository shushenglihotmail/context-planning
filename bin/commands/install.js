'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot, pluginRoot } = require('../../lib/paths');
const { available } = require('./_helpers');
const hooks = require('../../lib/hooks');

const CI_SENTINEL = '# cp:ci v1';
const CI_DEST_REL = path.join('.github', 'workflows', 'cp-audit.yml');
const CI_SOURCE_REL = path.join('templates', 'ci', 'cp-audit.yml.example');

/**
 * Parse a `--repo <path>` or `--repo=<path>` flag out of args.
 * Returns { repoPath, rest } where rest is args with the flag removed.
 * Returns { repoPath: null } if the flag isn't present. Throws (string
 * thrown for the caller to format) on malformed input (e.g. trailing
 * `--repo` with no value).
 */
function _parseRepoFlag(args) {
  const rest = [];
  let repoPath = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--repo') {
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        throw '--repo requires a path argument (e.g. --repo /path/to/repo)';
      }
      repoPath = next;
      i++; // skip value
    } else if (a.startsWith('--repo=')) {
      const v = a.slice('--repo='.length);
      if (!v) throw '--repo= requires a non-empty path';
      repoPath = v;
    } else {
      rest.push(a);
    }
  }
  return { repoPath, rest };
}

/**
 * Resolve the target repo root for a per-repo install. If `--repo` was
 * supplied, validate and return the absolute path; otherwise fall back
 * to walking up from cwd. Exits the process with a helpful message on
 * validation errors so we never silently scribble into the wrong place.
 */
function _resolveRepoRoot(repoFlag) {
  if (!repoFlag) return repoRoot();
  const abs = path.resolve(repoFlag);
  let stat;
  try { stat = fs.statSync(abs); }
  catch {
    console.error(`cp install --repo ${repoFlag}: path does not exist`);
    process.exit(2);
  }
  if (!stat.isDirectory()) {
    console.error(`cp install --repo ${repoFlag}: not a directory`);
    process.exit(2);
  }
  // Soft check: warn (not fatal) if the path doesn't look like a repo root,
  // so a typo lands a visible heads-up instead of silently writing into a
  // random folder. We accept the user's choice either way.
  const looksLikeRepo = fs.existsSync(path.join(abs, '.git')) ||
                        fs.existsSync(path.join(abs, 'package.json'));
  if (!looksLikeRepo) {
    console.error(`warning: ${abs} has no .git or package.json — installing anyway`);
  }
  return abs;
}

function _runHooks(args) {
  const uninstall = args.includes('--uninstall-hooks');
  const force = args.includes('--force');
  let parsed;
  try { parsed = _parseRepoFlag(args); }
  catch (msg) { console.error(`cp install --hooks: ${msg}`); process.exit(2); }
  const root = parsed.repoPath
    ? _resolveRepoRoot(parsed.repoPath)
    : hooks.gitRoot();
  if (!root) {
    console.error('cp install --hooks: not inside a git repo (use --repo <path> to target one)');
    process.exit(2);
  }
  if (parsed.repoPath && !fs.existsSync(path.join(root, '.git'))) {
    console.error(`cp install --hooks --repo ${parsed.repoPath}: no .git/ found in target`);
    process.exit(2);
  }
  if (uninstall) {
    const r = hooks.uninstallHooks(root);
    for (const h of r.removed) console.log(`✓ removed ${path.relative(root, h.path)}`);
    for (const s of r.skipped) console.log(`· skipped ${path.relative(root, s.path)} (${s.reason})`);
    if (r.removed.length === 0 && r.skipped.length === 0) {
      console.log('· no cp hooks installed');
    }
    return;
  }
  const r = hooks.installHooks(root, { force });
  for (const h of r.installed) console.log(`✓ installed ${path.relative(root, h.path)}`);
  for (const s of r.skipped) console.log(`· skipped ${path.relative(root, s.path)} (${s.reason}; use --force to overwrite)`);
  if (r.skipped.length > 0 && !force) process.exitCode = 3;
}

function _runCi(args) {
  const force = args.includes('--force');
  let parsed;
  try { parsed = _parseRepoFlag(args); }
  catch (msg) { console.error(`cp install --ci: ${msg}`); process.exit(2); }
  const projectRoot = _resolveRepoRoot(parsed.repoPath);
  const src = path.join(pluginRoot(), CI_SOURCE_REL);
  if (!fs.existsSync(src)) {
    console.error(`cp install --ci: template not found at ${src}`);
    process.exit(2);
  }
  const dest = path.join(projectRoot, CI_DEST_REL);
  let existing = null;
  try {
    existing = fs.readFileSync(dest, 'utf8');
  } catch (_) {
    existing = null;
  }
  if (existing && !existing.includes(CI_SENTINEL) && !force) {
    console.log(`· skipped ${CI_DEST_REL} (user-owned; use --force to overwrite)`);
    process.exitCode = 3;
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const content = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dest, content);
  console.log(`✓ installed ${CI_DEST_REL}`);
}

function _printUsage(stream) {
  stream.write(
    'Usage: cp install <copilot|claude|cursor|aider|echo-provider> [--global | --repo <path>] [--force]\n' +
    '       cp install --hooks [--repo <path>] [--force]   install git hooks\n' +
    '       cp install --uninstall-hooks [--repo <path>]   remove cp-owned git hooks\n' +
    '       cp install --ci [--repo <path>] [--force]      install GitHub Actions audit workflow\n' +
    '\n' +
    'Harness install (per-harness wiring of /cp-* skill files):\n' +
    '  copilot         Writes .github/skills/cp-<name>/SKILL.md + .github/context-planning.md\n' +
    '  claude          Writes .claude/skills/cp-<name>/SKILL.md + .claude/CLAUDE.md tail block\n' +
    '  cursor          Writes .cursor/rules/cp-<name>.mdc + ambient context-planning.mdc\n' +
    '  aider           Writes .aider/cp-commands/<name>.md + .aider/CP-CONTEXT.md;\n' +
    '                  patches .aider.conf.yml read: list\n' +
    '  echo-provider   Installs the no-op echo provider into .planning/providers/\n' +
    '\n' +
    'Flags:\n' +
    '  --global        Wire the harness at the user-home scope (~/.copilot, ~/.claude,\n' +
    '                  ~/.cursor, ~/.aider) instead of any repo. Result: /cp-* commands\n' +
    '                  visible in every repo on this machine for that harness. Still\n' +
    '                  per-harness — run once per harness you use.\n' +
    '  --repo <path>   Target a specific repo (per-repo install). Use this when you\n' +
    '                  want to wire a repo without cd-ing into it first. Mutually\n' +
    '                  exclusive with --global.\n' +
    '  --force         Overwrite locally modified files (otherwise installer keeps them\n' +
    '                  and exits 3).\n' +
    '\n' +
    'Where to run it:\n' +
    '  Default         No flag, no --repo: cp walks up from cwd to find .git or\n' +
    '                  package.json. Run from inside the target repo.\n' +
    '  --repo <path>   Run from anywhere; cp uses <path> as the repo root.\n' +
    '  --global        Run from anywhere; files land under your home dir.\n' +
    '\n' +
    'Note: `npm i -g context-planning` installs the cp binary on PATH. This\n' +
    'command then wires that binary into a specific harness — they are two\n' +
    'separate install steps.\n'
  );
}

function run(args = []) {
  // --help / -h prints usage to stdout and exits 0.
  if (args.includes('--help') || args.includes('-h')) {
    _printUsage(process.stdout);
    process.exit(0);
  }
  // --hooks / --uninstall-hooks short-circuit (no harness arg required).
  if (args.includes('--hooks') || args.includes('--uninstall-hooks')) {
    return _runHooks(args);
  }
  // --ci short-circuit (CI template install).
  if (args.includes('--ci')) {
    return _runCi(args);
  }
  // --global wires the harness at the user-home scope (~/.copilot, ~/.claude,
  // ~/.cursor, ~/.aider) instead of the repo. The harness installers read
  // CP_INSTALL_SCOPE=user to switch their target dir, so we set the env var
  // here before delegating. The env var stays the internal contract; the
  // user-facing knob is --global.
  const globalScope = args.includes('--global');
  let parsed;
  try { parsed = _parseRepoFlag(args); }
  catch (msg) { console.error(`cp install: ${msg}`); process.exit(2); }
  if (globalScope && parsed.repoPath) {
    console.error('cp install: --global and --repo are mutually exclusive');
    process.exit(2);
  }
  if (globalScope) process.env.CP_INSTALL_SCOPE = 'user';

  const harness = parsed.rest.find((a) => !a.startsWith('--'));
  if (!harness) {
    _printUsage(process.stderr);
    process.exit(2);
  }
  const force = parsed.rest.includes('--force');

  // Special case: echo-provider installs to .planning/providers/
  if (harness === 'echo-provider') {
    const echoInstaller = require(path.join(pluginRoot(), 'install', 'echo-provider.js'));
    const result = echoInstaller.install();
    for (const r of result.results) {
      console.log(`✓ ${r.file} (${r.status})`);
    }
    console.log('\necho-provider installed. Switch with:');
    console.log('  cp config set workflow_provider echo-provider');
    return;
  }

  let installer;
  try {
    installer = require(path.join(pluginRoot(), 'install', `${harness}.js`));
  } catch (e) {
    console.error(`Unknown harness: ${harness}`);
    console.error(`Available: copilot${available('claude') ? ', claude' : ''}${available('cursor') ? ', cursor' : ''}${available('aider') ? ', aider' : ''}`);
    process.exit(2);
  }
  // Resolve the target repo root:
  //   --repo <path>   → that path (validated)
  //   --global        → still compute one (best-effort, cwd-derived) since
  //                     a few harness installers reference repoRoot even in
  //                     user scope (e.g. aider's .aider.conf.yml patch).
  //   neither         → walk up from cwd.
  const targetRepo = parsed.repoPath
    ? _resolveRepoRoot(parsed.repoPath)
    : repoRoot();
  const result = installer.install({ pluginRoot: pluginRoot(), repoRoot: targetRepo, force });
  // Non-zero exit when there are user-modified files we refused to overwrite
  // (signals the caller — e.g. CI — that the install was incomplete).
  if (result && Array.isArray(result.userModified) && result.userModified.length > 0 && !force) {
    process.exitCode = 3;
  }
}

module.exports = { name: 'install', run, CI_SENTINEL, CI_DEST_REL };
