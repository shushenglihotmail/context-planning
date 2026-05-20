/**
 * test/unit-v034.js — coverage for the three Mediums + one Low closed in v0.3.4.
 *
 *   1. writeBatch rollback when the rename phase fails after earlier renames
 *      already landed (CONCERNS Medium → CLOSED).
 *   2. Installer collision protection: cp install detects locally-modified
 *      command/skill files and refuses to overwrite without --force
 *      (CONCERNS Medium → CLOSED).
 *   3. argv normalization: --key=value now works the same as --key value
 *      (CONCERNS Low → CLOSED).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const lifecycle = require(path.join(REPO, 'lib', 'lifecycle'));
const installCommon = require(path.join(REPO, 'install', 'common'));
const copilot = require(path.join(REPO, 'install', 'copilot'));
const claude = require(path.join(REPO, 'install', 'claude'));
const { normalizeArgv } = require(path.join(REPO, 'bin', 'cp'));

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

// =============================================================
section('lib/lifecycle: writeBatch happy path still works (regression)');
{
  const root = mktmp('wb-happy');
  const a = path.join(root, 'a.md');
  const b = path.join(root, 'b.md');
  lifecycle.writeBatch([
    { kind: 'write', path: a, after: 'A1' },
    { kind: 'write', path: b, after: 'B1' },
  ]);
  ok('a.md written', fs.readFileSync(a, 'utf8') === 'A1');
  ok('b.md written', fs.readFileSync(b, 'utf8') === 'B1');
  // Now update + delete in one batch
  lifecycle.writeBatch([
    { kind: 'write', path: a, after: 'A2' },
    { kind: 'delete', path: b },
  ]);
  ok('a.md updated', fs.readFileSync(a, 'utf8') === 'A2');
  ok('b.md deleted', !fs.existsSync(b));
}

// =============================================================
section('lib/lifecycle: writeBatch rolls back when rename phase fails');
{
  // Inject a rename failure between staging and the LAST rename. Simulate by
  // pre-creating a destination as a non-empty directory of the same name as
  // a planned dest file — fs.renameSync(temp, destDir) throws on every OS.
  const root = mktmp('wb-rollback');
  const ok1 = path.join(root, 'one.md');
  const ok2 = path.join(root, 'two.md');
  const trap = path.join(root, 'three.md');
  // Seed prior content
  fs.writeFileSync(ok1, 'one-OLD\n');
  fs.writeFileSync(ok2, 'two-OLD\n');
  // 'three.md' will be a directory containing a child file, so the rename
  // attempt on Linux/Mac fails with ENOTEMPTY and on Windows with EPERM/EEXIST.
  fs.mkdirSync(trap);
  fs.writeFileSync(path.join(trap, 'child'), 'block\n');

  let threw = null;
  try {
    lifecycle.writeBatch([
      { kind: 'write', path: ok1,  after: 'one-NEW\n' },
      { kind: 'write', path: ok2,  after: 'two-NEW\n' },
      { kind: 'write', path: trap, after: 'three-NEW\n' },
    ]);
  } catch (e) {
    threw = e;
  }
  ok('writeBatch threw',  threw !== null);
  ok('error mentions rename phase', threw && /rename phase failed/.test(threw.message));
  ok('error mentions rolled back',  threw && /Rolled back/.test(threw.message));

  // The two earlier dests should be restored to their OLD content.
  ok('one.md rolled back to OLD',
    fs.readFileSync(ok1, 'utf8') === 'one-OLD\n');
  ok('two.md rolled back to OLD',
    fs.readFileSync(ok2, 'utf8') === 'two-OLD\n');

  // No `.cp-tmp-*` orphans left under the batch root.
  const orphans = fs.readdirSync(root).filter((f) => f.includes('.cp-tmp-'));
  ok('zero .cp-tmp-* orphans after rollback', orphans.length === 0, `found ${orphans.join(',')}`);
}

// =============================================================
section('lib/lifecycle: writeBatch rollback for new (non-existing) dest');
{
  const root = mktmp('wb-rollback-new');
  const newFile = path.join(root, 'newly-created.md');
  const trap = path.join(root, 'trap');
  fs.mkdirSync(trap);
  fs.writeFileSync(path.join(trap, 'child'), 'block\n');

  let threw = null;
  try {
    lifecycle.writeBatch([
      { kind: 'write', path: newFile, after: 'brand new\n' },
      { kind: 'write', path: trap,    after: 'will fail\n' },
    ]);
  } catch (e) { threw = e; }
  ok('writeBatch threw', threw !== null);
  // newFile did not exist before -> rollback removes it.
  ok('rollback removed not-previously-existing file', !fs.existsSync(newFile));
}

// =============================================================
section('install/common: writeFileSafe collision detection');
{
  const root = mktmp('install-collide');
  const f = path.join(root, 'cp-foo.md');

  // First write: file doesn't exist -> 'written'
  const r1 = installCommon.writeFileSafe(f, 'v1 content');
  ok('first write -> status=written', r1.status === 'written');
  ok('first write actually wrote', fs.readFileSync(f, 'utf8') === 'v1 content');

  // Re-write same content: 'identical', no-op
  const r2 = installCommon.writeFileSafe(f, 'v1 content');
  ok('same-content rewrite -> status=identical', r2.status === 'identical');

  // User edits the file
  fs.writeFileSync(f, 'USER EDITED');

  // Default re-install: refuses to overwrite, returns 'user-modified'
  const r3 = installCommon.writeFileSafe(f, 'v2 content');
  ok('user-modified refused -> status=user-modified', r3.status === 'user-modified');
  ok('user-modified file UNCHANGED on disk',
    fs.readFileSync(f, 'utf8') === 'USER EDITED');

  // --force overrides
  const r4 = installCommon.writeFileSafe(f, 'v2 content', { force: true });
  ok('force=true -> status=written', r4.status === 'written');
  ok('force=true actually wrote', fs.readFileSync(f, 'utf8') === 'v2 content');
}

// =============================================================
section('install/copilot: e2e collision protection');
{
  const fakeRepo = mktmp('install-copilot-repo');

  // Initial install — should be 'written' for everything.
  const r1 = copilot.install({ pluginRoot: REPO, repoRoot: fakeRepo });
  ok('initial install wrote at least one skill', r1.written > 0);
  ok('initial install: no user-modified files', r1.userModified.length === 0);

  // Re-install: every file should be 'identical' now (idempotent).
  const r2 = copilot.install({ pluginRoot: REPO, repoRoot: fakeRepo });
  ok('re-install: zero new writes', r2.written === 0, `wrote ${r2.written}`);
  ok('re-install: all identical', r2.identical > 0);

  // User edits one skill file.
  const aSkill = path.join(fakeRepo, '.github', 'skills', 'cp-map-codebase', 'SKILL.md');
  if (fs.existsSync(aSkill)) {
    fs.writeFileSync(aSkill, '# locally edited\n');

    // Re-install WITHOUT --force: must refuse to overwrite the edited file.
    const r3 = copilot.install({ pluginRoot: REPO, repoRoot: fakeRepo });
    ok('non-force re-install: refuses user-edited file',
      r3.userModified.includes('cp-map-codebase'));
    ok('user-edited file STILL has user content',
      fs.readFileSync(aSkill, 'utf8') === '# locally edited\n');

    // With --force: overwrites.
    const r4 = copilot.install({ pluginRoot: REPO, repoRoot: fakeRepo, force: true });
    ok('force re-install: overwrote user file', r4.written >= 1);
    ok('user-edited file NOW restored',
      fs.readFileSync(aSkill, 'utf8') !== '# locally edited\n');
  } else {
    ok('skipping cp-map-codebase skill check (no skill found)', false,
      'expected file did not exist after initial install');
  }
}

// =============================================================
section('install/claude: e2e collision protection');
{
  const fakeRepo = mktmp('install-claude-repo');
  const r1 = claude.install({ pluginRoot: REPO, repoRoot: fakeRepo });
  ok('claude initial install wrote slash commands', r1.written > 0);

  const r2 = claude.install({ pluginRoot: REPO, repoRoot: fakeRepo });
  ok('claude re-install: zero new writes', r2.written === 0);

  // Edit one command and re-install.
  const aCmd = path.join(fakeRepo, '.claude', 'commands', 'cp-status.md');
  if (fs.existsSync(aCmd)) {
    fs.writeFileSync(aCmd, '# edited cp-status command\n');
    const r3 = claude.install({ pluginRoot: REPO, repoRoot: fakeRepo });
    ok('claude: refuses edited command',
      r3.userModified.includes('cp-status.md'));
    ok('claude: edited content preserved',
      fs.readFileSync(aCmd, 'utf8') === '# edited cp-status command\n');
  }
}

// =============================================================
section('bin/cp: normalizeArgv splits --key=value');
{
  ok('bare flag preserved',
    JSON.stringify(normalizeArgv(['--force'])) === '["--force"]');
  ok('--key value pair preserved',
    JSON.stringify(normalizeArgv(['--name', 'foo'])) === '["--name","foo"]');
  ok('--key=value split',
    JSON.stringify(normalizeArgv(['--name=foo'])) === '["--name","foo"]');
  ok('--key= split with empty value',
    JSON.stringify(normalizeArgv(['--name='])) === '["--name",""]');
  ok('--key=value with spaces in value preserved',
    JSON.stringify(normalizeArgv(['--name=hello world'])) === '["--name","hello world"]');
  ok('= in non-flag positional left alone',
    JSON.stringify(normalizeArgv(['key=val'])) === '["key=val"]');
  ok('multiple flags mixed',
    JSON.stringify(normalizeArgv(['scaffold-phase', '1', '--name=MVP', '--plans=2']))
      === '["scaffold-phase","1","--name","MVP","--plans","2"]');
  ok('first --',
    JSON.stringify(normalizeArgv(['--'])) === '["--"]');
}

// =============================================================
section('bin/cp: --key=value e2e via real CLI');
{
  const root = mktmp('e2e-equals');
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "cp-test@example.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "cp-test"', { cwd: root, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, 'README.md'), '# seed\n');
  execSync('git add README.md && git commit -q -m "seed"', { cwd: root, stdio: 'pipe' });

  const cli = path.join(REPO, 'bin', 'cp.js');
  execSync(`node "${cli}" init --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: init"', { cwd: root, stdio: 'pipe' });
  execSync(`node "${cli}" scaffold-milestone v0.1 --no-commit`, { cwd: root, stdio: 'pipe' });

  // The historic-broken case: --name=value (single-token).
  execSync(`node "${cli}" scaffold-phase 1 --name=MVP --plans=2 --no-commit`, { cwd: root, stdio: 'pipe' });
  const phaseDir = path.join(root, '.planning', 'phases', '01-mvp');
  ok('scaffold-phase --name=MVP created 01-mvp phase dir', fs.existsSync(phaseDir));
  // cp writes short-form PLAN.md per phase; --plans=N just pre-fills N empty
  // checkboxes inside that single file.
  const planContent = fs.existsSync(path.join(phaseDir, 'PLAN.md'))
    ? fs.readFileSync(path.join(phaseDir, 'PLAN.md'), 'utf8')
    : '';
  const checkboxCount = (planContent.match(/^- \[ \]/gm) || []).length;
  ok('scaffold-phase --plans=2 emitted 2 pre-filled plan checkboxes',
    checkboxCount === 2, `got ${checkboxCount}`);
}

// Cleanup
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
