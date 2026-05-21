/**
 * test/unit-installers.js — coverage for `cp install cursor` + `cp install aider`
 * (v0.4.2). Reuses the test style from test/unit-v034.js.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'bin', 'cp.js');
const cursorInstaller = require(path.join(REPO, 'install', 'cursor'));
const aiderInstaller = require(path.join(REPO, 'install', 'aider'));

let passed = 0;
let failed = 0;
const tracked = [];

function section(title) { console.log(`\n=== ${title} ===`); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log(`  \u2713 ${label}`); return; }
  failed++;
  console.log(`  \u2717 ${label}${extra ? `  (${extra})` : ''}`);
}
function mktmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `cp-${prefix}-`));
  tracked.push(d);
  return d;
}
function bootRepo(prefix) {
  const root = mktmp(prefix);
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  return root;
}
function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

// =============================================================
section('cursor.buildRule: synthesises frontmatter from cp command body');
{
  const body = `---
description: Map an existing codebase
---

# /cp-map-codebase

Body of command.
`;
  const rule = cursorInstaller.buildRule({ name: 'map-codebase', body, alwaysApply: false });
  ok('rule has its own frontmatter', /^---\ndescription:/.test(rule));
  ok('description extracted from source',
    /description:\s*"Map an existing codebase"/.test(rule),
    `got: ${rule.slice(0, 200)}`);
  ok('alwaysApply: false honoured', /alwaysApply:\s*false/.test(rule));
  ok('source frontmatter stripped from body',
    !rule.split(/^---$/m).slice(2).join('---').includes('description: Map an existing'),
    'body still contained the original description: line');
  ok('body content preserved', /# \/cp-map-codebase/.test(rule));
}
{
  // No source frontmatter: should still produce valid frontmatter.
  const body = `# raw heading\n\nbody only`;
  const rule = cursorInstaller.buildRule({ name: 'no-fm', body, alwaysApply: true });
  ok('no-fm: still has wrapper frontmatter', /^---\ndescription:/.test(rule));
  ok('no-fm: alwaysApply: true honoured', /alwaysApply:\s*true/.test(rule));
  ok('no-fm: fallback description has the name', /cp slash-command: no-fm/.test(rule));
  ok('no-fm: original body intact', /# raw heading/.test(rule) && /body only/.test(rule));
}

// =============================================================
section('cursor installer e2e');
{
  const root = bootRepo('cursor');
  const r = run(['install', 'cursor'], root);
  ok('exit 0', r.status === 0, `stderr: ${r.stderr}`);

  const rulesDir = path.join(root, '.cursor', 'rules');
  ok('.cursor/rules exists', fs.existsSync(rulesDir));

  const files = fs.readdirSync(rulesDir);
  ok('context-planning.mdc present', files.includes('context-planning.mdc'));
  ok('at least one cp-*.mdc present',
    files.some((f) => /^cp-.*\.mdc$/.test(f)));

  const ctxBody = fs.readFileSync(path.join(rulesDir, 'context-planning.mdc'), 'utf8');
  ok('ambient rule: alwaysApply: true', /alwaysApply:\s*true/.test(ctxBody));
  ok('ambient rule: mentions cp', /context-planning/.test(ctxBody));
  ok('ambient rule: includes drift-defense block',
    /cp:drift-defense v1/.test(ctxBody) && /Drift defense/.test(ctxBody));
  ok('ambient rule: lists cp audit verb',
    /cp audit/.test(ctxBody));
  ok('ambient rule: lists cp reconcile verb',
    /cp reconcile/.test(ctxBody));

  // Per-command rule
  const cmdFile = files.find((f) => f.startsWith('cp-new-milestone'));
  ok('cp-new-milestone.mdc exists', cmdFile != null);
  if (cmdFile) {
    const body = fs.readFileSync(path.join(rulesDir, cmdFile), 'utf8');
    ok('cp-new-milestone: alwaysApply: false', /alwaysApply:\s*false/.test(body));
  }

  // Re-run is idempotent (= unchanged)
  const r2 = run(['install', 'cursor'], root);
  ok('re-run exit 0', r2.status === 0);
  ok('re-run reports unchanged',
    /unchanged/.test(r2.stdout), `stdout did not mention "unchanged"`);

  // Hand-edit a rule and re-install: should refuse without --force, exit 3
  const hand = path.join(rulesDir, files.find((f) => /^cp-/.test(f)));
  fs.writeFileSync(hand, fs.readFileSync(hand, 'utf8') + '\n<!-- user edit -->\n');
  const r3 = run(['install', 'cursor'], root);
  ok('hand-edit + no-force: exit 3',
    r3.status === 3, `got ${r3.status}; stderr: ${r3.stderr}`);
  ok('hand-edit: warning printed',
    /LOCALLY MODIFIED/.test(r3.stdout) || /kept/.test(r3.stdout),
    `stdout: ${r3.stdout.slice(0, 400)}`);

  // --force clobbers
  const r4 = run(['install', 'cursor', '--force'], root);
  ok('--force exit 0', r4.status === 0);
  const after = fs.readFileSync(hand, 'utf8');
  ok('--force removed user edit', !/<!-- user edit -->/.test(after));
}

// =============================================================
section('aider.buildContextBriefing structure');
{
  const briefing = aiderInstaller.buildContextBriefing([
    { name: 'new-milestone' }, { name: 'plan-phase' },
  ]);
  ok('briefing mentions cp', /context-planning/i.test(briefing));
  ok('briefing mentions /cp-new-milestone', /\/cp-new-milestone/.test(briefing));
  ok('briefing mentions /cp-plan-phase', /\/cp-plan-phase/.test(briefing));
  ok('briefing has CLI cheat-sheet', /cp init/.test(briefing) && /cp tick/.test(briefing));
  ok('briefing trailing newline', briefing.endsWith('\n'));
  ok('briefing without pluginRoot omits drift block',
    !/cp:drift-defense v1/.test(briefing));
}

section('aider.buildContextBriefing with pluginRoot injects drift block');
{
  const briefing = aiderInstaller.buildContextBriefing(
    [{ name: 'new-milestone' }],
    REPO
  );
  ok('drift block present', /cp:drift-defense v1/.test(briefing));
  ok('drift block lists cp audit', /cp audit/.test(briefing));
  ok('drift block lists cp reconcile', /cp reconcile/.test(briefing));
}

// =============================================================
section('aider.patchAiderConfig: create / update / idempotent');
{
  const root = mktmp('aider-conf');

  // create case
  const r1 = aiderInstaller.patchAiderConfig(root);
  ok('create: status=created', r1.status === 'created');
  const conf = fs.readFileSync(r1.path, 'utf8');
  ok('create: file contains read: list with CP-CONTEXT.md',
    /read:[\s\S]*\.aider\/CP-CONTEXT\.md/.test(conf), conf);
  ok('create: NO legacy fence markers (parsed YAML now)',
    !/managed by cp installer/.test(conf));
  // Validate YAML parses cleanly with the yaml module:
  const parsed = require('yaml').parse(conf);
  ok('create: read is a YAML list containing CP-CONTEXT.md',
    Array.isArray(parsed.read) && parsed.read.includes('.aider/CP-CONTEXT.md'));

  // idempotent re-run
  const r2 = aiderInstaller.patchAiderConfig(root);
  ok('idempotent: status=identical', r2.status === 'identical', `got ${r2.status}`);
}

section('aider.patchAiderConfig: preserves user read: entries (v0.4.4 fix)');
{
  const root = mktmp('aider-conf-user');
  const conf = path.join(root, '.aider.conf.yml');
  fs.writeFileSync(conf, 'read:\n  - my-team-docs.md\n  - other.md\nmodel: gpt-4o\n');

  const r = aiderInstaller.patchAiderConfig(root);
  ok('user-read-preserved: status=updated', r.status === 'updated', `got ${r.status}`);

  const after = require('yaml').parse(fs.readFileSync(conf, 'utf8'));
  ok('user-read-preserved: my-team-docs.md still present',
    Array.isArray(after.read) && after.read.includes('my-team-docs.md'));
  ok('user-read-preserved: other.md still present',
    after.read.includes('other.md'));
  ok('user-read-preserved: CP-CONTEXT.md added',
    after.read.includes('.aider/CP-CONTEXT.md'));
  ok('user-read-preserved: user model: key intact',
    after.model === 'gpt-4o');

  // Re-running on the merged result is idempotent.
  const r2 = aiderInstaller.patchAiderConfig(root);
  ok('user-read-preserved: re-run identical',
    r2.status === 'identical', `got ${r2.status}`);
}

section('aider.patchAiderConfig: migrates legacy fenced block (v0.4.2/v0.4.3 → v0.4.4)');
{
  const root = mktmp('aider-conf-legacy');
  const conf = path.join(root, '.aider.conf.yml');
  // Simulate a v0.4.2 install that wrote a fenced block:
  fs.writeFileSync(conf,
    'model: gpt-4o\n' +
    '# >>> context-planning (cp) — managed by cp installer\n' +
    'read:\n  - .aider/CP-CONTEXT.md\n' +
    '# <<< context-planning (cp)\n');

  const r = aiderInstaller.patchAiderConfig(root);
  ok('legacy-migrate: status=migrated', r.status === 'migrated', `got ${r.status}`);

  const text = fs.readFileSync(conf, 'utf8');
  ok('legacy-migrate: fence markers stripped', !/managed by cp installer/.test(text));
  const parsed = require('yaml').parse(text);
  ok('legacy-migrate: CP-CONTEXT.md still listed',
    Array.isArray(parsed.read) && parsed.read.includes('.aider/CP-CONTEXT.md'));
  ok('legacy-migrate: user model: key survived',
    parsed.model === 'gpt-4o');

  // Re-running is identical now.
  const r2 = aiderInstaller.patchAiderConfig(root);
  ok('legacy-migrate: post-migration re-run identical',
    r2.status === 'identical', `got ${r2.status}`);
}

// =============================================================
section('aider installer e2e');
{
  const root = bootRepo('aider');
  const r = run(['install', 'aider'], root);
  ok('exit 0', r.status === 0, `stderr: ${r.stderr}`);

  ok('.aider/CP-CONTEXT.md exists',
    fs.existsSync(path.join(root, '.aider', 'CP-CONTEXT.md')));
  const ctxBody = fs.readFileSync(path.join(root, '.aider', 'CP-CONTEXT.md'), 'utf8');
  ok('aider CP-CONTEXT.md has drift block',
    /cp:drift-defense v1/.test(ctxBody));
  ok('.aider/cp-commands/ exists',
    fs.existsSync(path.join(root, '.aider', 'cp-commands')));
  ok('.aider.conf.yml exists',
    fs.existsSync(path.join(root, '.aider.conf.yml')));

  const cmdDir = path.join(root, '.aider', 'cp-commands');
  const cmdFiles = fs.readdirSync(cmdDir);
  ok('per-command files installed',
    cmdFiles.includes('new-milestone.md') && cmdFiles.includes('plan-phase.md'));

  const conf = fs.readFileSync(path.join(root, '.aider.conf.yml'), 'utf8');
  ok('conf contains read: CP-CONTEXT.md',
    /CP-CONTEXT\.md/.test(conf));

  // Idempotent re-run
  const r2 = run(['install', 'aider'], root);
  ok('re-run exit 0', r2.status === 0);
  ok('re-run reports unchanged',
    /unchanged/.test(r2.stdout) || /identical/.test(r2.stdout));

  // Hand-edit + re-install: refuse without --force
  const ctxPath = path.join(root, '.aider', 'CP-CONTEXT.md');
  fs.writeFileSync(ctxPath, fs.readFileSync(ctxPath, 'utf8') + '\n<!-- handedit -->\n');
  const r3 = run(['install', 'aider'], root);
  ok('hand-edit + no-force: exit 3', r3.status === 3, `got ${r3.status}`);

  // --force clobbers
  const r4 = run(['install', 'aider', '--force'], root);
  ok('--force exit 0', r4.status === 0);
  const restored = fs.readFileSync(ctxPath, 'utf8');
  ok('--force removed user edit', !/handedit/.test(restored));
}

// =============================================================
section('cp install <unknown harness>: usage error');
{
  const root = bootRepo('unknown');
  const r = run(['install', 'pyramid'], root);
  ok('exit 2', r.status === 2, `got ${r.status}`);
  ok('lists available harnesses', /copilot/.test(r.stderr) && /claude/.test(r.stderr));
  ok('mentions cursor + aider in Available',
    /cursor/.test(r.stderr) && /aider/.test(r.stderr),
    `stderr: ${r.stderr}`);
}

// Cleanup
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
