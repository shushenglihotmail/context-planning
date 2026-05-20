'use strict';

const path = require('path');
const { repoRoot, pluginRoot } = require('../../lib/paths');
const { available } = require('./_helpers');

function run(args = []) {
  const harness = args[0];
  if (!harness) {
    console.error('Usage: cp install <copilot|claude|cursor|aider|echo-provider> [--force]');
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
