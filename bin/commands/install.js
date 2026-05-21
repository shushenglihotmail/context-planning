'use strict';

const path = require('path');
const { repoRoot, pluginRoot } = require('../../lib/paths');
const { available } = require('./_helpers');
const hooks = require('../../lib/hooks');

function _runHooks(args) {
  const uninstall = args.includes('--uninstall-hooks');
  const force = args.includes('--force');
  const root = hooks.gitRoot();
  if (!root) {
    console.error('cp install --hooks: not inside a git repo');
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

function run(args = []) {
  // --hooks / --uninstall-hooks short-circuit (no harness arg required).
  if (args.includes('--hooks') || args.includes('--uninstall-hooks')) {
    return _runHooks(args);
  }
  const harness = args[0];
  if (!harness) {
    console.error('Usage: cp install <copilot|claude|cursor|aider|echo-provider> [--force]');
    console.error('       cp install --hooks [--force]      install git hooks');
    console.error('       cp install --uninstall-hooks      remove cp-owned git hooks');
    process.exit(2);
  }
  const force = args.includes('--force');

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
  const result = installer.install({ pluginRoot: pluginRoot(), repoRoot: repoRoot(), force });
  // Non-zero exit when there are user-modified files we refused to overwrite
  // (signals the caller — e.g. CI — that the install was incomplete).
  if (result && Array.isArray(result.userModified) && result.userModified.length > 0 && !force) {
    process.exitCode = 3;
  }
}

module.exports = { name: 'install', run };
