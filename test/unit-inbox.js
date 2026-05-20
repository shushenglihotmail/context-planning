/**
 * test/unit-inbox.js — coverage for lib/inbox.js + the `cp capture` /
 * `cp inbox` CLI surfaces shipped in v0.4.0.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const inbox = require(path.join(REPO, 'lib', 'inbox'));
const lifecycle = require(path.join(REPO, 'lib', 'lifecycle'));

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
function bootProject(prefix) {
  const root = mktmp(prefix);
  execSync('git init -q', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email "t@e.com"', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name "t"', { cwd: root, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'pipe' });
  fs.writeFileSync(path.join(root, 'README.md'), '# seed\n');
  execSync('git add -A && git commit -q -m "seed"', { cwd: root, stdio: 'pipe' });
  execSync(`node "${path.join(REPO, 'bin', 'cp.js')}" init --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync('git add -A && git commit -q -m "cp: init"', { cwd: root, stdio: 'pipe' });
  return root;
}

// =============================================================
section('lib/inbox: parse + render round-trip');
{
  const empty = inbox.parseInbox('');
  ok('parse empty -> empty arrays',
    empty.open.length === 0 && empty.triaged.length === 0);

  const r1 = inbox.renderInbox({ open: [], triaged: [] });
  ok('render empty has Open + Triaged sections',
    /^## Open\s*$/m.test(r1) && /^## Triaged\s*$/m.test(r1));
  ok('render empty has placeholder comments',
    /new items get appended/.test(r1) && /triaged items move/.test(r1));

  const r2 = inbox.renderInbox({
    open: [
      { ts: '2026-05-19T09:00', text: 'first' },
      { ts: '2026-05-19T11:00', text: 'second' },
    ],
    triaged: [
      { ts: '2026-05-18T08:00', text: 'older', destination: 'quick:rename' },
    ],
  });
  const p2 = inbox.parseInbox(r2);
  ok('round-trip: 2 open',     p2.open.length === 2);
  ok('round-trip: 1 triaged',  p2.triaged.length === 1);
  ok('round-trip: open[0] text', p2.open[0].text === 'first');
  ok('round-trip: triaged dest', p2.triaged[0].destination === 'quick:rename');
  ok('round-trip: idx is 1-based', p2.open[0].idx === 1 && p2.open[1].idx === 2);
}

// =============================================================
section('lib/inbox: parser tolerates noise');
{
  const messy = `# Inbox
Some prose nobody asked for.

## Open

- [ ] [2026-05-19T09:00] first item
not a checkbox line
- [ ] [2026-05-19T10:00] second
- [x] [2026-05-19T11:00] checked-but-in-open-section (ignored)

## Triaged

- [x] [2026-05-19T12:00] → quick:bar: triaged item
random text
`;
  const p = inbox.parseInbox(messy);
  ok('open count = 2 (skipped malformed)', p.open.length === 2,
    `got ${p.open.length}`);
  ok('checked-in-open section ignored',
    !p.open.some((it) => /checked-but-in-open/.test(it.text)));
  ok('triaged count = 1', p.triaged.length === 1);
  ok('triaged destination parsed', p.triaged[0].destination === 'quick:bar');
}

// =============================================================
section('lib/inbox: appendItem');
{
  const root = mktmp('inbox-append');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

  const r1 = inbox.appendItem(root, 'first capture', {
    now: new Date('2026-05-19T09:00:00'),
  });
  ok('returns single write action',
    r1.actions.length === 1 && r1.actions[0].kind === 'write');
  ok('item.idx = 1 for first append', r1.item.idx === 1);
  ok('item.ts is ISO-minute', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r1.item.ts));

  // Apply the action manually (mirrors what the CLI does via writeBatch).
  lifecycle.writeBatch(r1.actions);
  ok('INBOX.md was created',
    fs.existsSync(path.join(root, '.planning', 'INBOX.md')));

  const r2 = inbox.appendItem(root, 'second capture', {
    now: new Date('2026-05-19T10:00:00'),
  });
  lifecycle.writeBatch(r2.actions);
  const state = inbox.listInbox(root);
  ok('inbox now has 2 open items', state.open.length === 2);
  ok('sort by ts ascending', state.open[0].text === 'first capture');

  // Empty text -> error
  let threw = null;
  try { inbox.appendItem(root, '   '); } catch (e) { threw = e; }
  ok('appendItem("") throws', threw !== null);

  // Duplicate dedup: same minute + same text -> alreadyPresent=true, still appends
  const r3 = inbox.appendItem(root, 'first capture', {
    now: new Date('2026-05-19T09:00:00'),
  });
  ok('duplicate flagged alreadyPresent', r3.alreadyPresent === true);
}

// =============================================================
section('lib/inbox: markTriaged');
{
  const root = mktmp('inbox-tick');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

  lifecycle.writeBatch(inbox.appendItem(root, 'a',
    { now: new Date('2026-05-19T09:00') }).actions);
  lifecycle.writeBatch(inbox.appendItem(root, 'b',
    { now: new Date('2026-05-19T10:00') }).actions);

  let before = inbox.listInbox(root);
  ok('2 open before tick', before.open.length === 2);

  // Tick item #1 (idx is 1-based within Open).
  const r = inbox.markTriaged(root, 1, 'quick:rename');
  lifecycle.writeBatch(r.actions);
  ok('returned item.destination', r.item.destination === 'quick:rename');

  const after = inbox.listInbox(root);
  ok('1 open after tick', after.open.length === 1);
  ok('1 triaged after tick', after.triaged.length === 1);
  ok('remaining open item is the OTHER one', after.open[0].text === 'b');
  ok('triaged keeps original ts', after.triaged[0].ts === '2026-05-19T09:00');
  ok('triaged keeps destination', after.triaged[0].destination === 'quick:rename');

  // Invalid idx -> throws
  let threw = null;
  try { inbox.markTriaged(root, 999); } catch (e) { threw = e; }
  ok('markTriaged(999) throws', threw && /No open inbox item/.test(threw.message));

  // After tick, the remaining open item is now at idx=1 (re-numbered)
  const next = inbox.listInbox(root);
  ok('remaining open is now idx=1', next.open[0].idx === 1);
}

// =============================================================
section('lib/inbox: empty / null destination');
{
  const root = mktmp('inbox-nodest');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  lifecycle.writeBatch(inbox.appendItem(root, 'x',
    { now: new Date('2026-05-19T09:00') }).actions);

  // null destination
  const r = inbox.markTriaged(root, 1, null);
  lifecycle.writeBatch(r.actions);
  const state = inbox.listInbox(root);
  ok('triaged with null destination round-trips',
    state.triaged.length === 1 && state.triaged[0].destination === null);
}

// =============================================================
section('lib/inbox: listInbox handles missing file');
{
  const root = mktmp('inbox-missing');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  const r = inbox.listInbox(root);
  ok('exists=false when no INBOX.md', r.exists === false);
  ok('empty arrays', r.open.length === 0 && r.triaged.length === 0);
}

// =============================================================
section('end-to-end: cp capture + cp inbox CLI');
{
  const root = bootProject('cli-capture');
  const cli = path.join(REPO, 'bin', 'cp.js');

  // capture two items
  execSync(`node "${cli}" capture "first inbox item" --no-commit`, { cwd: root, stdio: 'pipe' });
  execSync(`node "${cli}" capture "second inbox item" --no-commit`, { cwd: root, stdio: 'pipe' });

  const inboxFile = path.join(root, '.planning', 'INBOX.md');
  ok('INBOX.md created by cp capture', fs.existsSync(inboxFile));

  // inbox --json
  const jsonOut = execSync(`node "${cli}" inbox --json`, { cwd: root, stdio: 'pipe' }).toString();
  const j = JSON.parse(jsonOut);
  ok('--json shape: open=2', j.open.length === 2, `got ${j.open.length}`);
  ok('--json shape: triaged=0', j.triaged.length === 0);

  // tick #1 with --note
  execSync(`node "${cli}" inbox --tick 1 --note "quick:rename-thing" --no-commit`, { cwd: root, stdio: 'pipe' });
  const j2 = JSON.parse(execSync(`node "${cli}" inbox --json`, { cwd: root, stdio: 'pipe' }).toString());
  ok('after tick: 1 open', j2.open.length === 1);
  ok('after tick: 1 triaged', j2.triaged.length === 1);
  ok('triaged destination preserved', j2.triaged[0].destination === 'quick:rename-thing');

  // Default `cp inbox` doesn't show triaged
  const plainOut = execSync(`node "${cli}" inbox`, { cwd: root, stdio: 'pipe' }).toString();
  ok('default view: shows the remaining open item',
    /second inbox item/.test(plainOut));
  ok('default view: hint about hidden triaged',
    /1 triaged item\(s\) hidden/.test(plainOut));

  // --all reveals it
  const allOut = execSync(`node "${cli}" inbox --all`, { cwd: root, stdio: 'pipe' }).toString();
  ok('--all view: shows the triaged item',
    /## Triaged/.test(allOut) && /first inbox item/.test(allOut));
  ok('--all view: shows the destination',
    /quick:rename-thing/.test(allOut));

  // Auto-commit behaviour: `cp capture` without --no-commit creates a commit
  const beforeCount = parseInt(
    execSync('git rev-list --count HEAD', { cwd: root, stdio: 'pipe' }).toString().trim(), 10
  );
  execSync(`node "${cli}" capture "auto-commit test"`, { cwd: root, stdio: 'pipe' });
  const afterCount = parseInt(
    execSync('git rev-list --count HEAD', { cwd: root, stdio: 'pipe' }).toString().trim(), 10
  );
  ok('cp capture auto-commits (count +1)', afterCount === beforeCount + 1,
    `before=${beforeCount} after=${afterCount}`);

  // The auto-commit must NOT sweep unrelated dirty files (v0.3.3 invariant)
  fs.writeFileSync(path.join(root, 'dirty.js'), '// sweep me\n');
  execSync(`node "${cli}" capture "another"`, { cwd: root, stdio: 'pipe' });
  const lastCommitFiles = execSync(
    'git show --name-only --pretty=format:""',
    { cwd: root, stdio: 'pipe' }
  ).toString().trim().split(/\r?\n/).filter(Boolean);
  ok('cp capture commit excludes dirty.js',
    !lastCommitFiles.includes('dirty.js'),
    `commit files: ${lastCommitFiles.join(',')}`);
  ok('cp capture commit touches INBOX.md',
    lastCommitFiles.some((f) => f.endsWith('INBOX.md')));
}

// Cleanup
for (const d of tracked) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
