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
const lifecycle = require('../lib/lifecycle');
const codebaseMapper = require('../lib/codebase-mapper');
const inbox = require('../lib/inbox');
const worktree = require('../lib/worktree');

function usage() {
  console.log(`cp v${pkg.version} — context-planning CLI

Usage:
  cp install <harness>            Install into a harness (copilot | claude | cursor | aider)
  cp init                         Scaffold .planning/ in this repo
  cp gsd-import [--root <dir>] [--json] [--apply]
                                  Read-only audit of any planning project
                                  (--apply runs \`cp init\` after the audit)
  cp doctor                       Show resolved config, provider status, GSD compat
  cp status [--json]              Show "you are here": current milestone, phase, next plan
  cp tick <plan-id> [--undo] [--no-commit]
                                  Mark a plan done in ROADMAP + phase PLAN.md
                                  (idempotent; commits unless --no-commit)
  cp write-summary <plan-id> --from <json-file> [--body <md-file>] [--overwrite]
                                  Write {NN-MM}-SUMMARY.md with validated frontmatter
                                  (normalises snake_case -> kebab-case aliases)
  cp scaffold-milestone <name> [--planned] [--no-commit] [--dry-run]
                                  Add \`### 🚧 <name> (In Progress)\` heading to ROADMAP
                                  (use --planned for \`### 📋 <name> (Planned)\`)
  cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>]
                                  Add \`### Phase N: <name>\` under active milestone +
                                  create .planning/phases/{NN-slug}/PLAN.md
  cp scaffold-codebase [--force] [--no-commit] [--dry-run]
                                  Create .planning/codebase/ with 7 stub docs
                                  (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE,
                                  CONVENTIONS, TESTING, CONCERNS). Filled by
                                  \`/cp-map-codebase\`.
  cp codebase-status [--json]     Inventory .planning/codebase/ — which docs
                                  exist, line counts, which still look like stubs
  cp capture <text>               Append a free-form item to .planning/INBOX.md
                                  with a timestamp (use \`/cp-capture\` to triage)
  cp inbox [--json] [--all] [--tick <N> [--note <dest>]]
                                  List open items (default) or all; --tick N moves
                                  open item N to Triaged (optionally with a note like
                                  --note "quick:rename-version-flag")
  cp statusline [--format <fmt>] [--json] [--no-color]
                                  Print a one-line prompt-friendly status string
                                  (for shell PS1, Starship, tmux, etc). Silent
                                  outside a cp project. Format tokens: %M
                                  (milestone), %P (phase), %D (done/total),
                                  %N (next plan id), %B (branch).
  cp worktree create <name> [--branch <b>] [--from <base>] [--path <dir>] [--phase <N>] [--no-create]
  cp worktree list [--json]
  cp worktree remove <slug> [--force]
                                  Manage cp-tracked git worktrees. \`create\`
                                  runs \`git worktree add <path> -b cp/<slug>\`
                                  and records it in .planning/WORKTREES.md.
                                  Delegates to the configured provider's
                                  worktree skill when --use-provider is set
                                  (Superpowers: using-git-worktrees).
  cp complete-milestone [<name>] [--dry-run] [--no-commit] [--json]
                                  Full milestone close-out (verify, aggregate digest,
                                  collapse in ROADMAP, clear context, reset STATE, commit)
  cp config get [<key>]           Print a cp.<key> value (or whole cp block)
  cp config set <key> <value>     Update a cp.<key> value
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
    console.error('Usage: cp install <copilot|claude|cursor|aider> [--force]');
    process.exit(2);
  }
  const force = args.includes('--force');
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

// ---------- lifecycle commands ----------

function cmdStatus(args) {
  const root = repoRoot();
  const json = args.includes('--json');
  const r = lifecycle.statusReport(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  console.log(`cp v${pkg.version}`);
  console.log(`Repo:        ${root}`);
  console.log(`Milestone:   ${r.milestone || '(none in-progress)'}${r.milestoneStatus ? ` [${r.milestoneStatus}]` : ''}`);
  if (r.phases.length === 0) {
    console.log('Phases:      (none yet — run `/cp-plan-phase 1`)');
  } else {
    console.log('Phases:');
    for (const p of r.phases) {
      const bar = p.total > 0 ? `${p.done}/${p.total}` : '0/0';
      const mark = p.total > 0 && p.done === p.total ? '✓' : '·';
      console.log(`  ${mark} Phase ${p.num} ${p.name}: ${bar} plans done`);
    }
  }
  if (r.nextPlan) {
    console.log(`\nNext plan:   ${r.nextPlan.planId} (Phase ${r.nextPlan.phaseNum}: ${r.nextPlan.phaseName})`);
    console.log(`             ${r.nextPlan.desc}`);
    console.log(`\nDo:          /cp-execute-phase ${r.nextPlan.phaseNum}`);
  } else if (r.milestone) {
    console.log(`\nAll plans done. Run \`cp complete-milestone\` (or \`/cp-complete-milestone\`).`);
  }
}

function cmdTick(args) {
  const root = repoRoot();
  let planId = null;
  let undo = false;
  let noCommit = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--undo') undo = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!planId) planId = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!planId) { console.error('Usage: cp tick <plan-id> [--undo] [--no-commit] [--dry-run]'); process.exit(2); }

  let result;
  try {
    result = lifecycle.tickPlan(root, planId, { dryRun, done: !undo });
  } catch (e) {
    console.error(`tick: ${e.message}`);
    process.exit(1);
  }
  for (const a of result.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  if (result.actions.length === 0) {
    console.log(`(no change — plan ${planId} already ${undo ? 'unticked' : 'ticked'})`);
    return;
  }
  if (dryRun) return;
  if (!noCommit) {
    const verb = undo ? 'untick' : 'tick';
    const commit = lifecycle.gitCommit(root, `cp: ${verb} plan ${planId}`, {
      paths: lifecycle.pathsFromActions(result.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function cmdWriteSummary(args) {
  const root = repoRoot();
  let planId = null;
  let fromPath = null;
  let bodyPath = null;
  let overwrite = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from') fromPath = args[++i];
    else if (a === '--body') bodyPath = args[++i];
    else if (a === '--overwrite') overwrite = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!planId) planId = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!planId || !fromPath) {
    console.error('Usage: cp write-summary <plan-id> --from <json> [--body <md>] [--overwrite] [--dry-run]');
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
    r = lifecycle.writeSummary(root, planId, data, { dryRun, body, overwrite });
  } catch (e) {
    console.error(`write-summary: ${e.message}`);
    process.exit(1);
  }
  console.log(`${dryRun ? '·' : '✓'} ${path.relative(root, r.path)}`);
  if (dryRun) {
    console.log('--- normalised frontmatter ---');
    console.log(JSON.stringify(r.fm, null, 2));
  }
}

function cmdScaffoldMilestone(args) {
  const root = repoRoot();
  let name = null;
  let dryRun = false;
  let noCommit = false;
  let status = 'in-progress';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--planned') status = 'planned';
    else if (a === '--status') status = args[++i];
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!name) {
    console.error('Usage: cp scaffold-milestone <name> [--planned] [--no-commit] [--dry-run]');
    process.exit(2);
  }

  let r;
  try {
    r = lifecycle.scaffoldMilestone(root, name, { dryRun, status });
  } catch (e) {
    console.error(`scaffold-milestone: ${e.message}`);
    process.exit(1);
  }

  if (!r.ok) {
    console.error(`scaffold-milestone: ${r.reason}`);
    if (r.reason === 'milestone-exists') {
      console.error(`  "${r.milestone}" already exists (status: ${r.status}).`);
    }
    process.exit(1);
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  console.log(`Milestone:   ${r.milestone} [${r.status}]`);
  if (dryRun) return;
  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-milestone ${r.milestone}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function cmdScaffoldPhase(args) {
  const root = repoRoot();
  let num = null;
  let name = null;
  let plans = 0;
  let milestoneName = null;
  let dryRun = false;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name') name = args[++i];
    else if (a === '--plans') plans = parseInt(args[++i], 10) || 0;
    else if (a === '--milestone') milestoneName = args[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!num) num = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  if (!num || !name) {
    console.error('Usage: cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>] [--no-commit] [--dry-run]');
    process.exit(2);
  }

  let r;
  try {
    r = lifecycle.scaffoldPhase(root, num, { dryRun, name, plans, milestone: milestoneName });
  } catch (e) {
    console.error(`scaffold-phase: ${e.message}`);
    process.exit(1);
  }

  if (!r.ok) {
    console.error(`scaffold-phase: ${r.reason}`);
    if (r.reason === 'phase-exists') {
      console.error(`  ${path.relative(root, r.phaseDir)} already exists.`);
    } else if (r.reason === 'milestone-not-found') {
      console.error(`  No milestone named "${milestoneName}" in ROADMAP.md.`);
    } else if (r.reason === 'no-active-milestone') {
      console.error(`  No in-progress milestone. Run \`cp scaffold-milestone <name>\` first or pass --milestone.`);
    }
    process.exit(1);
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    console.log(`${dryRun ? '·' : '✓'} ${rel}`);
  }
  console.log(`Phase ${r.phaseNum} added to milestone "${r.milestone}"${r.plans.length ? ` (${r.plans.length} plan${r.plans.length === 1 ? '' : 's'}: ${r.plans.join(', ')})` : ''}`);
  if (dryRun) return;
  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-phase ${r.phaseNum} (${name})`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function cmdScaffoldCodebase(args) {
  const root = repoRoot();
  let dryRun = false;
  let force = false;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--force') force = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }

  let r;
  try {
    r = codebaseMapper.scaffoldCodebase(root, { dryRun, force });
  } catch (e) {
    console.error(`scaffold-codebase: ${e.message}`);
    process.exit(1);
  }

  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    const mark = dryRun ? '·' : (a.kind === 'mkdir' ? '+' : '✓');
    console.log(`${mark} ${a.kind.padEnd(5)} ${rel}`);
  }
  if (r.skipped.length) {
    console.log(`\nSkipped ${r.skipped.length} existing file(s) — use --force to overwrite:`);
    for (const s of r.skipped) console.log(`  = ${s}`);
  }
  console.log(`\nCodebase dir: ${path.relative(root, r.codebaseDir)}`);
  console.log(`Created:      ${r.created.length} stub(s)`);
  if (dryRun) return;
  if (!noCommit && r.actions.some((a) => a.kind === 'write' || a.kind === 'mkdir')) {
    const commit = lifecycle.gitCommit(root, `cp: scaffold-codebase (${r.created.length} stubs)`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed     ${commit}`);
  }
  if (r.created.length > 0) {
    console.log(`\nNext: run /cp-map-codebase to fill the stubs with a real analysis.`);
  }
}

function cmdCodebaseStatus(args) {
  const root = repoRoot();
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }
  const r = codebaseMapper.codebaseStatus(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (!r.dirExists) {
    console.log(`.planning/codebase/ not present — run \`cp scaffold-codebase\` first.`);
    process.exit(1);
  }
  console.log(`Codebase dir: ${path.relative(root, r.codebaseDir)}`);
  console.log('');
  console.log('  status  focus     file              lines   bytes');
  console.log('  ------  --------  ----------------  ------  ------');
  for (const row of r.rows) {
    let status;
    if (!row.exists) status = 'missing';
    else if (row.looksStub) status = 'stub   ';
    else status = 'filled ';
    const lines = row.exists ? String(row.lines).padStart(5) : '    -';
    const bytes = row.exists ? String(row.bytes).padStart(5) : '    -';
    console.log(`  ${status} ${row.focus.padEnd(8)}  ${row.file.padEnd(16)} ${lines}  ${bytes}`);
  }
  console.log('');
  console.log(`All present:  ${r.allExist ? '✓' : '✗'}`);
  console.log(`All filled:   ${r.allFilled ? '✓' : '✗ (run /cp-map-codebase)'}`);
}

function cmdCompleteMilestone(args) {
  const root = repoRoot();
  let name = null;
  let dryRun = false;
  let noCommit = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('-')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else if (!name) name = a;
    else { console.error(`unexpected arg: ${a}`); process.exit(2); }
  }

  const r = lifecycle.completeMilestone(root, { name, dryRun, noCommit });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    return;
  }

  if (!r.ok) {
    console.error(`complete-milestone: ${r.reason}`);
    if (r.reason === 'incomplete') {
      console.error(`\nMilestone "${r.milestone}" still has work to do:`);
      for (const rep of r.verify.reports.filter(x => !x.ok)) {
        console.error(`  Phase ${rep.phaseNum} ${rep.name}: plans ${rep.plansDone}/${rep.plansTotal} done; missing SUMMARY: ${rep.summariesMissing.join(', ') || '—'}`);
      }
    } else if (r.hint) {
      console.error(r.hint);
    }
    process.exit(1);
  }

  console.log(`Milestone:   ${r.milestone}`);
  console.log(`Phases:      ${r.phases.join(', ')}`);
  console.log(`Subsystems:  ${r.agg.subsystems.join(', ') || '—'}`);
  console.log(`Files:       ${r.agg.filesCreated.length} created, ${r.agg.filesModified.length} modified`);
  console.log(`\nActions${dryRun ? ' (dry-run)' : ''}:`);
  for (const a of r.actions) {
    const rel = path.relative(root, a.path);
    const mark = a.kind === 'write' ? '✓' : a.kind === 'delete' ? '✗' : '·';
    console.log(`  ${mark} ${a.kind.padEnd(6)} ${rel}${a.reason ? '  (' + a.reason + ')' : ''}`);
  }
  if (!dryRun && r.commit) console.log(`\nCommitted:   ${r.commit}`);
}

function cmdCapture(args) {
  // Collect everything up to first -- flag as the text. Allow --no-commit too.
  let noCommit = false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-commit') noCommit = true;
    else if (a === '--dry-run') {
      // Treat dry-run as no-commit + no-write. Useful for the slash command
      // when proposing what would be captured.
      console.error(`(dry-run not supported on capture — use \`cp inbox\` to see what would happen)`);
      process.exit(2);
    } else if (a.startsWith('--')) { console.error(`unknown option: ${a}`); process.exit(2); }
    else positional.push(a);
  }
  const text = positional.join(' ').trim();
  if (!text) {
    console.error('Usage: cp capture <text> [--no-commit]');
    process.exit(2);
  }
  const root = repoRoot();
  let r;
  try { r = inbox.appendItem(root, text); }
  catch (e) { console.error(`capture: ${e.message}`); process.exit(1); }

  lifecycle.writeBatch(r.actions);
  console.log(`✓ inbox #${r.item.idx}  [${r.item.ts}]  ${r.item.text}`);
  if (r.alreadyPresent) {
    console.log(`  (note: an identical item already exists at the same minute — kept both)`);
  }

  if (!noCommit) {
    const commit = lifecycle.gitCommit(root, `cp: capture inbox item #${r.item.idx}`, {
      paths: lifecycle.pathsFromActions(r.actions),
    });
    if (commit) console.log(`committed ${commit}`);
  }
}

function cmdInbox(args) {
  let json = false;
  let showAll = false;
  let tickIdx = null;
  let note = null;
  let noCommit = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--all') showAll = true;
    else if (a === '--no-commit') noCommit = true;
    else if (a === '--tick') {
      tickIdx = args[++i];
      if (tickIdx == null) { console.error('--tick requires <N>'); process.exit(2); }
    } else if (a === '--note') {
      note = args[++i];
      if (note == null) { console.error('--note requires <destination>'); process.exit(2); }
    } else { console.error(`unknown option: ${a}`); process.exit(2); }
  }
  const root = repoRoot();

  if (tickIdx !== null) {
    let r;
    try { r = inbox.markTriaged(root, tickIdx, note); }
    catch (e) { console.error(`inbox: ${e.message}`); process.exit(1); }
    lifecycle.writeBatch(r.actions);
    const destPart = r.item.destination ? ` → ${r.item.destination}` : '';
    console.log(`✓ triaged${destPart}  [${r.item.ts}]  ${r.item.text}`);
    if (!noCommit) {
      const commit = lifecycle.gitCommit(root, `cp: triage inbox item${destPart}`, {
        paths: lifecycle.pathsFromActions(r.actions),
      });
      if (commit) console.log(`committed ${commit}`);
    }
    return;
  }

  const state = inbox.listInbox(root);
  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  if (!state.exists) {
    console.log(`Inbox is empty (no ${path.relative(root, state.path)} yet).`);
    console.log(`Add an item:  cp capture "your idea here"`);
    return;
  }

  console.log(`Inbox: ${path.relative(root, state.path)}`);
  console.log(`Open: ${state.open.length}  Triaged: ${state.triaged.length}`);
  console.log('');
  if (state.open.length === 0) {
    console.log('  (no open items — capture a new one with `cp capture "..."`)');
  } else {
    console.log('## Open');
    for (const it of state.open) {
      console.log(`  ${String(it.idx).padStart(3)}  [${it.ts}]  ${it.text}`);
    }
  }
  if (showAll && state.triaged.length > 0) {
    console.log('');
    console.log('## Triaged');
    for (const it of state.triaged) {
      const dest = it.destination ? `→ ${it.destination}` : '→';
      console.log(`  ${String(it.idx).padStart(3)}  [${it.ts}]  ${dest}  ${it.text}`);
    }
  } else if (!showAll && state.triaged.length > 0) {
    console.log('');
    console.log(`(${state.triaged.length} triaged item(s) hidden — use \`cp inbox --all\`)`);
  }
}

function cmdStatusline(args) {
  let format = null;
  let json = false;
  let noColor = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--no-color') noColor = true;
    else if (a === '--format') {
      format = args[++i];
      if (format == null) { console.error('--format requires a value'); process.exit(2); }
    } else { console.error(`unknown option: ${a}`); process.exit(2); }
  }

  // Stay silent outside a cp/git project. Used in shell prompts — must never
  // emit noise that breaks PS1.
  let root;
  try { root = repoRoot(); }
  catch { process.exit(0); }
  const planning = require('../lib/paths').planningDir(root);
  if (!fs.existsSync(path.join(planning, 'ROADMAP.md'))) process.exit(0);

  let r;
  try { r = lifecycle.statusReport(root); }
  catch { process.exit(0); }
  if (!r.ok) process.exit(0);

  // Compute the active phase: first phase with done < total. Fall back to
  // last phase if all done.
  let activePhase = r.phases.find((p) => p.done < p.total);
  if (!activePhase && r.phases.length > 0) activePhase = r.phases[r.phases.length - 1];

  const phaseLabel = activePhase
    ? `${String(activePhase.num).padStart(2, '0')}-${activePhase.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
    : null;
  const doneTotal = activePhase ? `${activePhase.done}/${activePhase.total}` : null;
  const nextId = r.nextPlan ? r.nextPlan.planId : null;

  // Try to grab the current git branch (best-effort, silent on failure).
  let branch = '';
  try {
    branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { branch = ''; }

  if (json) {
    console.log(JSON.stringify({
      milestone: r.milestone,
      milestoneStatus: r.milestoneStatus,
      phase: activePhase ? { num: activePhase.num, name: activePhase.name, label: phaseLabel, done: activePhase.done, total: activePhase.total } : null,
      nextPlan: r.nextPlan,
      branch,
    }, null, 2));
    return;
  }

  // Color helpers (ANSI). Detection is conservative: only emit when stdout
  // is a TTY AND --no-color was NOT passed AND NO_COLOR env is unset.
  const useColor = !noColor && process.stdout.isTTY && !process.env.NO_COLOR;
  const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  const dim = (s) => c('2', s);
  const bold = (s) => c('1', s);
  const cyan = (s) => c('36', s);
  const green = (s) => c('32', s);
  const yellow = (s) => c('33', s);

  // Custom format support: %M %P %D %N %B tokens.
  if (format) {
    const out = format
      .replace(/%M/g, r.milestone || '')
      .replace(/%P/g, phaseLabel || '')
      .replace(/%D/g, doneTotal || '')
      .replace(/%N/g, nextId || '')
      .replace(/%B/g, branch || '');
    console.log(out);
    return;
  }

  // Default format. Examples:
  //   cp ▸ v0.4 ▸ 02-mvp 1/3 → 02-02
  //   cp ▸ v0.4 ▸ ✓ done
  //   cp ▸ (no milestone)
  const arrow = dim('▸');
  const prefix = bold(cyan('cp'));
  if (!r.milestone) {
    console.log(`${prefix} ${arrow} ${dim('(no milestone)')}`);
    return;
  }
  const mPart = green(r.milestone);
  if (!activePhase) {
    console.log(`${prefix} ${arrow} ${mPart}`);
    return;
  }
  const phasePart = activePhase.done >= activePhase.total
    ? `${green('✓')} ${dim('done')}`
    : `${yellow(phaseLabel)} ${dim(doneTotal)}${nextId ? ' ' + arrow + ' ' + cyan(nextId) : ''}`;
  console.log(`${prefix} ${arrow} ${mPart} ${arrow} ${phasePart}`);
}

function cmdWorktree(args) {
  const sub = args.shift();
  if (!sub) {
    console.error('Usage: cp worktree <create|list|remove> [...]');
    process.exit(2);
  }
  const root = repoRoot();

  if (sub === 'create') return cmdWorktreeCreate(args, root);
  if (sub === 'list')   return cmdWorktreeList(args, root);
  if (sub === 'remove' || sub === 'rm') return cmdWorktreeRemove(args, root);
  console.error(`Unknown worktree subcommand: ${sub}`);
  process.exit(2);
}

function cmdWorktreeCreate(args, root) {
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
  if (!name) { console.error('Usage: cp worktree create <name> [--branch <b>] [--from <base>] [--path <dir>] [--phase <N>]'); process.exit(2); }

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

function cmdWorktreeList(args, root) {
  let json = args.includes('--json');
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
    const onDisk = gitTrees.find((g) => path.resolve(g.path) === path.resolve(e.path));
    const status = onDisk ? '✓ on disk' : '✗ missing';
    console.log(`  ${e.slug.padEnd(20)} ${e.branch.padEnd(28)} ${status}`);
    console.log(`    ${e.path}${e.phase ? '  [phase ' + e.phase + ']' : ''}`);
  }
}

function cmdWorktreeRemove(args, root) {
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
  if (!slug) { console.error('Usage: cp worktree remove <slug> [--force]'); process.exit(2); }

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

/**
 * Pre-process argv to normalize `--key=value` → `--key value`. Lets every
 * subcommand's hand-rolled parser keep using the simpler "next-slot" model
 * without each one having to handle `=` separately.
 *
 * v0.3.4 — closes CONCERNS Low "argv parser doesn't support --key=value".
 *
 * - Leaves bare flags (`--force`, `-v`) alone.
 * - Splits `--name=value` → ['--name', 'value']. The empty `--key=` form
 *   becomes ['--key', ''] which is preserved as a real empty-string value.
 * - Does NOT touch short combined flags like `-abc` (we don't use any).
 */
function normalizeArgv(argv) {
  const out = [];
  for (const tok of argv) {
    if (typeof tok === 'string' && tok.startsWith('--') && tok.includes('=')) {
      const eq = tok.indexOf('=');
      out.push(tok.slice(0, eq));
      out.push(tok.slice(eq + 1));
    } else {
      out.push(tok);
    }
  }
  return out;
}

function main(argv) {
  const normalized = normalizeArgv(argv.slice(2));
  const [cmd, ...rest] = normalized;
  switch (cmd) {
    case 'install': return cmdInstall(rest);
    case 'init': return cmdInit();
    case 'gsd-import': return cmdGsdImport(rest);
    case 'doctor': return cmdDoctor();
    case 'status': return cmdStatus(rest);
    case 'tick': return cmdTick(rest);
    case 'write-summary': return cmdWriteSummary(rest);
    case 'scaffold-milestone': return cmdScaffoldMilestone(rest);
    case 'scaffold-phase': return cmdScaffoldPhase(rest);
    case 'scaffold-codebase': return cmdScaffoldCodebase(rest);
    case 'codebase-status': return cmdCodebaseStatus(rest);
    case 'capture': return cmdCapture(rest);
    case 'inbox': return cmdInbox(rest);
    case 'statusline': return cmdStatusline(rest);
    case 'worktree': return cmdWorktree(rest);
    case 'complete-milestone': return cmdCompleteMilestone(rest);
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

if (require.main === module) {
  main(process.argv);
}

module.exports = { normalizeArgv };
