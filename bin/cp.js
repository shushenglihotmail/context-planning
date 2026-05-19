#!/usr/bin/env node
'use strict';

/**
 * cp — context-planning CLI entry.
 *
 * Subcommands:
 *   cp install <harness>            Install command/skill files into a coding-agent harness
 *   cp init                         Initialise .planning/ in the current repo (idempotent)
 *   cp doctor                       Show resolved config, provider status, GSD compat
 *   cp config get [<key>]           Print a config value (or whole `cp` block)
 *   cp config set <key> <value>     Update a cp.<key> value
 *   cp version                      Print version
 */

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const {
  repoRoot,
  planningDir,
  ensureDir,
  readTemplate,
  pluginRoot,
} = require('../lib/paths');
const provider = require('../lib/provider');
const compat = require('../lib/gsd-compat');
const importer = require('../lib/import');

function usage() {
  console.log(`cp v${pkg.version} — context-planning CLI

Usage:
  cp install <harness>            Install into a harness (copilot | claude)
  cp init                         Scaffold .planning/ in this repo
  cp gsd-import [--root <dir>] [--json] [--apply]
                                  Read-only audit of any planning project
                                  (--apply runs \`cp init\` after the audit)
  cp doctor                       Show resolved config, provider status, GSD compat
  cp config get [<key>]           Print a cp.<key> value (or whole cp block)
  cp config set <key> <value>     Update a cp.<key> value (top-level GSD keys: use cp config set without 'cp.' prefix — we'll resolve)
  cp version                      Print version
  cp help                         Show this message
`);
}

function cmdVersion() {
  console.log(pkg.version);
}

function cmdInit() {
  const root = repoRoot();
  const dir = planningDir(root);
  ensureDir(dir);
  ensureDir(path.join(dir, 'phases'));
  ensureDir(path.join(dir, 'quick'));

  const wasGsdProject = compat.isGsdProject(root);
  const sharedPresent = compat.presentSharedFiles(root);

  const files = [
    ['PROJECT.md', 'PROJECT.md'],
    ['ROADMAP.md', 'ROADMAP.md'],
    ['STATE.md', 'STATE.md'],
    ['MILESTONES.md', 'MILESTONES.md'],
  ];

  let created = 0;
  for (const [target, tpl] of files) {
    const dest = path.join(dir, target);
    if (!fs.existsSync(dest)) {
      const content = renderTemplate(readTemplate(tpl), {
        PROJECT_NAME: path.basename(root),
        DATE: today(),
        TRIGGER: 'cp init',
        CORE_VALUE: '(not set yet — fill PROJECT.md)',
        CURRENT_PHASE_NAME: 'pre-planning',
        PHASE_NUM: '0',
        TOTAL_PHASES: '0',
        PLAN_NUM: '0',
        TOTAL_PLANS_IN_PHASE: '0',
        STATUS: 'Ready to plan',
        LAST_ACTIVITY: 'init',
        CONTINUE_HERE_PATH_OR_NONE: 'None',
        MILESTONE_NAME: 'v0.1 — first milestone',
        PHASE_RANGE: '1',
      });
      fs.writeFileSync(dest, content);
      created++;
      console.log(`  + ${path.relative(root, dest)}`);
    } else {
      console.log(`  = ${path.relative(root, dest)} (exists, kept)`);
    }
  }

  // config.json: merge-or-create.
  const cfgPath = provider.configPath(root);
  if (!fs.existsSync(cfgPath)) {
    provider.saveConfig(provider.loadDefaults(), root);
    console.log(`  + ${path.relative(root, cfgPath)}`);
    created++;
  } else {
    // Merge cp.* if missing — loadConfig() does this automatically.
    provider.loadConfig(root);
    console.log(`  = ${path.relative(root, cfgPath)} (kept; cp block ensured)`);
  }

  console.log(`\n${created} new file(s).`);
  if (wasGsdProject) {
    console.log(
      `\nDetected a GSD project (research/ / todos/ / seeds/ / REQUIREMENTS.md).`
    );
    console.log(
      `cp wrote a 'cp' block into config.json but did not modify any GSD files.`
    );
    console.log(
      `You can switch back to GSD any time; cp is additive only.`
    );
  } else if (sharedPresent.length > 0 && !wasGsdProject) {
    console.log(
      `\n${sharedPresent.length} shared file(s) detected — cp will treat this`
    );
    console.log(`as a GSD-compatible project.`);
  }
  console.log(`\nNext: edit .planning/PROJECT.md, then run /cp-new-milestone or /cp-plan-phase.`);
}

function cmdDoctor() {
  const root = repoRoot();
  console.log(`cp v${pkg.version}`);
  console.log(`Repo root:    ${root}`);
  console.log(
    `.planning/:   ${fs.existsSync(planningDir(root)) ? 'present' : 'missing (run `cp init`)'}`
  );
  console.log(`Config:       ${provider.configPath(root)}`);

  const cfg = provider.loadConfig(root);
  const cpBlock = cfg.cp || {};
  console.log(`Provider:     ${cpBlock.workflow_provider || '(unset, default: superpowers)'}`);

  // GSD compat report
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

  const roles = [
    'brainstorm', 'plan', 'execute', 'review',
    'finish', 'worktree', 'tdd', 'debug', 'verify',
  ];
  console.log(`\nRoles -> resolved skill:`);
  for (const role of roles) {
    const rr = provider.resolveSkill(role, root);
    const tag = rr.fallback ? ` [fallback from missing ${rr.primaryMissing}]` : '';
    const skill = rr.skill || '(no mapping)';
    const mark = rr.installed ? '✓' : '✗';
    console.log(`  ${mark} ${role.padEnd(10)} -> ${rr.name}/${skill}${tag}`);
  }
}

function cmdConfig(args) {
  const root = repoRoot();
  const cfg = provider.loadConfig(root);
  const sub = args[0];
  if (sub === 'get') {
    const key = args[1];
    if (!key) {
      console.log(JSON.stringify(cfg.cp || {}, null, 2));
      return;
    }
    const v = provider.cpGet(cfg, key);
    console.log(v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : v);
    return;
  }
  if (sub === 'set') {
    const key = args[1];
    let val = args[2];
    if (!key) {
      console.error('Usage: cp config set <key> <value>');
      process.exit(2);
    }
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (val !== '' && !isNaN(Number(val))) val = Number(val);
    provider.cpSet(cfg, key, val);
    provider.saveConfig(cfg, root);
    console.log(`set cp.${key} = ${JSON.stringify(val)}`);
    return;
  }
  console.error('Usage: cp config get [<key>] | set <key> <value>');
  process.exit(2);
}

function cmdGsdImport(args) {
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
      cmdInit();
    } finally {
      process.chdir(prevCwd);
    }
    return;
  }

  process.exit(importer.exitCode(report));
}

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

function cmdInstall(args) {
  const harness = args[0];
  if (!harness) {
    console.error('Usage: cp install <copilot|claude>');
    process.exit(2);
  }
  let installer;
  try {
    installer = require(path.join(pluginRoot(), 'install', `${harness}.js`));
  } catch (e) {
    console.error(`Unknown harness: ${harness}`);
    console.error(`Available: copilot${available('claude') ? ', claude' : ''}`);
    process.exit(2);
  }
  installer.install({ pluginRoot: pluginRoot(), repoRoot: repoRoot() });
}

function available(name) {
  return fs.existsSync(path.join(pluginRoot(), 'install', `${name}.js`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function renderTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    text
  );
}

function main(argv) {
  const [, , cmd, ...rest] = argv;
  switch (cmd) {
    case 'install': return cmdInstall(rest);
    case 'init': return cmdInit();
    case 'gsd-import': return cmdGsdImport(rest);
    case 'doctor': return cmdDoctor();
    case 'config': return cmdConfig(rest);
    case 'version':
    case '--version':
    case '-v': return cmdVersion();
    case 'help':
    case '--help':
    case '-h':
    case undefined: return usage();
    default:
      console.error(`unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }
}

main(process.argv);
