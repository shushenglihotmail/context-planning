'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');
const { repoRoot, planningDir } = require('../../lib/paths');
const provider = require('../../lib/provider');
const compat = require('../../lib/gsd-compat');

function run(args = []) {
  const jsonMode = args.includes('--json');
  const quiet = args.includes('--quiet');
  const root = repoRoot();
  const cfg = provider.loadConfig(root);
  const cpBlock = cfg.cp || {};
  const configured = cpBlock.workflow_provider || 'superpowers';
  const detect = require('../../lib/detect');
  const report = detect.detectAllInstalled(cfg);

  // --json: machine-parsable full report
  if (jsonMode) {
    const roles = [
      'brainstorm', 'plan', 'execute', 'review',
      'finish', 'worktree', 'tdd', 'debug', 'verify',
    ];
    const resolvedRoles = {};
    for (const role of roles) {
      const rr = provider.resolveSkill(role, root);
      resolvedRoles[role] = {
        provider: rr.name,
        skill: rr.skill,
        installed: rr.installed,
        fallback: !!rr.fallback,
      };
    }
    const json = {
      version: pkg.version,
      root,
      configured,
      harnesses: report.harnesses,
      providers: report.providers,
      roles: resolvedRoles,
    };
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  // --quiet: minimal output (configured + roles only)
  if (quiet) {
    console.log(`Configured: ${configured}`);
    const roles = [
      'brainstorm', 'plan', 'execute', 'review',
      'finish', 'worktree', 'tdd', 'debug', 'verify',
    ];
    for (const role of roles) {
      const rr = provider.resolveSkill(role, root);
      const tag = rr.fallback ? ` [fallback]` : '';
      const skill = rr.skill || '(none)';
      const mark = rr.installed ? '✓' : '✗';
      console.log(`  ${mark} ${role.padEnd(10)} -> ${rr.name}/${skill}${tag}`);
    }
    return;
  }

  // Full sectioned output
  const planningPresent = fs.existsSync(planningDir(root));
  const schemaVersion = cpBlock.version || 1;

  console.log(`cp v${pkg.version}  (invocable as \`cplan\` or \`cp\`)`);
  console.log(`Repo root:    ${root}`);
  console.log(
    `.planning/:   ${planningPresent ? 'present' : 'missing (run `cp init`)'}`
  );
  console.log(`Config:       ${provider.configPath(root)}  (schema v${schemaVersion})`);

  // Section 1: Harnesses
  console.log(`\nHarnesses detected:`);
  for (const h of report.harnesses) {
    if (!h.scannedRoots.length || h.scannedRoots.every((r) => !r.root)) {
      console.log(`  — ${h.name.padEnd(10)} (file-based — no plugin slot)`);
    } else {
      const rootSummaries = h.scannedRoots.map((r) => {
        const shortRoot = r.root.replace(/^~\//, '~/');
        return `${shortRoot} (${r.expanded.length} plugins)`;
      }).join(', ');
      const mark = h.pluginCount > 0 ? '✓' : '✗';
      if (h.pluginCount > 0) {
        console.log(`  ${mark} ${h.name.padEnd(10)} ${rootSummaries}`);
      } else {
        console.log(`  ${mark} ${h.name.padEnd(10)} (no plugins found at ${h.scannedRoots.map((r) => r.root).join(', ')})`);
      }
    }
  }

  // Section 2: Providers
  console.log(`\nProviders detected:`);
  for (const p of report.providers) {
    if (p.installed) {
      const hitDescs = p.hits.map((hit) => {
        if (hit.source === 'always') return '(always available)';
        return `via ${hit.via} @ ${hit.evidence ? path.basename(path.dirname(hit.evidence)) + '/' + path.basename(hit.evidence) : '?'}`;
      });
      console.log(`  ✓ ${p.name.padEnd(18)} ${hitDescs.join(', ')}`);
    } else {
      console.log(`  ✗ ${p.name.padEnd(18)} (not detected)`);
    }
  }

  // Section 3: Configured
  console.log(`\nConfigured workflow_provider:  ${configured}       [\`cp config set workflow_provider <name>\` to switch]`);

  // Section 4: Roles
  const roles = [
    'brainstorm', 'plan', 'execute', 'review',
    'finish', 'worktree', 'tdd', 'debug', 'verify',
  ];
  console.log(`\nRoles → resolved skill:`);
  for (const role of roles) {
    const rr = provider.resolveSkill(role, root);
    const tag = rr.fallback ? ` [fallback from missing ${rr.primaryMissing}]` : '';
    const skill = rr.skill || '(no mapping)';
    const mark = rr.installed ? '✓' : '✗';
    console.log(`  ${mark} ${role.padEnd(10)} -> ${rr.name}/${skill}${tag}`);
  }

  // Section 5: GSD compat
  const r = compat.report(root);
  console.log(`\nGSD compatibility:`);
  console.log(`  cp-aware config:    ${r.cpAware ? '✓' : '✗'}`);
  console.log(`  GSD sentinels:      ${r.gsdProject ? '✓ detected' : '— none'}`);
  console.log(`  shared files:       ${r.sharedFiles.length ? r.sharedFiles.join(', ') : '— none'}`);
  console.log(`  phase dirs:         ${r.phases.length}`);
  if (r.warnings.length) {
    console.log(`  warnings:`);
    for (const w of r.warnings) console.log(`    - ${w}`);
  }
}

module.exports = { name: 'doctor', run };
