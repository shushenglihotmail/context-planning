'use strict';

/**
 * v1.4 supervised-runtime integration tests.
 *
 * Exercises the engine helpers end-to-end in the order a real
 * harness-LLM supervisor would use them:
 *
 *   initRun → setPath(phase outputs) → snapshot → write files →
 *   recordClassification (broker decision) → commit →
 *   restart → re-commit (idempotent flow)
 *
 * The supervisor library is invoked the same way the supervisor
 * skill prompts the harness LLM to call it. State and git both end
 * up in a throwaway tmp project.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const supervisor = require('../lib/supervisor');
const classify   = require('../lib/classify');
const checkpoint = require('../lib/checkpoint');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function git(args, cwd) {
  const r = spawnSync('git', args, {cwd: cwd, encoding: 'utf8'});
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (r.stderr || ''));
  }
  return r.stdout.trim();
}

function mkProject(suffix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cp-integ-${suffix}-`));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'cp-test@example.com'], dir);
  git(['config', 'user.name', 'cp-test'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'initial'], dir);
  return dir;
}

// ----------------------------------------------------------------

section('end-to-end: supervisor drives a one-phase workflow');
{
  const dir = mkProject('e2e');
  const slug = 'e2e-1';

  // 1. Supervisor boots the run.
  supervisor.initRun(slug, {workflow: 'quick', milestone: 'mini'}, {projectDir: dir});
  ok('run exists after initRun', supervisor.runExists(slug, {projectDir: dir}));

  // 2. Supervisor declares the phase + its scoped outputs.
  supervisor.setPath(slug, 'phases.plan',
    {status: 'pending', outputs: ['lib/']},
    {projectDir: dir}
  );

  // 3. Supervisor brackets the phase: snapshot HEAD.
  const snap = checkpoint.snapshot(slug, 'plan', {projectDir: dir});
  ok('snapshot captures HEAD', typeof snap.sha === 'string' && snap.sha.length === 40);

  // 4. "Sub-agent" produces an output inside the declared scope.
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'plan-output.js'), 'module.exports = "plan";\n');

  // 5. Sub-agent reports back; broker classifies the message.
  const cls = classify.recordClassification(slug, 'plan',
    {user_message: 'plan output written', class: 'in-flow', confidence: 'L1', rationale: 'normal completion'},
    {projectDir: dir}
  );
  const stateAfterCls = supervisor.readState(slug, {projectDir: dir});
  ok('classifier_history recorded', Array.isArray(stateAfterCls.phases.plan.classifier_history)
    && stateAfterCls.phases.plan.classifier_history.length === 1);
  ok('classification class persisted',
    stateAfterCls.phases.plan.classifier_history[0].class === 'in-flow');

  // 6. Supervisor commits the declared outputs.
  const com = checkpoint.commit(slug, 'plan', {projectDir: dir});
  ok('commit returns sha', typeof com.commit === 'string' && com.commit.length === 40);
  ok('skippedOutOfScope is zero (clean scope)', com.skippedOutOfScope === 0);

  const stateAfterCommit = supervisor.readState(slug, {projectDir: dir});
  ok('phase status complete', stateAfterCommit.phases.plan.status === 'complete');
  ok('commit_sha persisted',  stateAfterCommit.phases.plan.commit_sha === com.commit);
  ok('classifier_history preserved across commit',
    stateAfterCommit.phases.plan.classifier_history.length === 1);

  // 7. Verify the engine commit message format.
  const msg = git(['log', '-1', '--pretty=%s'], dir);
  ok('commit message follows cp run format',
    msg === `cp run quick: plan (${slug})`,
    `got "${msg}"`);
}

// ----------------------------------------------------------------

section('restart flow: rollback + re-execute the same phase');
{
  const dir = mkProject('restart');
  const slug = 'rs-1';

  supervisor.initRun(slug, {workflow: 'quick'}, {projectDir: dir});
  supervisor.setPath(slug, 'phases.plan',
    {status: 'pending', outputs: ['lib/']},
    {projectDir: dir}
  );
  const snap = checkpoint.snapshot(slug, 'plan', {projectDir: dir});

  // first attempt
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'attempt-a.js'), '"bad output"\n');
  classify.recordClassification(slug, 'plan',
    {user_message: 'first attempt looks off', class: 'side', confidence: 'L2', rationale: 'want a retry'},
    {projectDir: dir}
  );
  checkpoint.commit(slug, 'plan', {projectDir: dir});

  // supervisor restarts the phase
  const r = checkpoint.restart(slug, 'plan', {projectDir: dir});
  ok('restartedTo === snapshot sha', r.restartedTo === snap.sha);
  ok('attempt-a removed by restart',
    !fs.existsSync(path.join(dir, 'lib', 'attempt-a.js')));

  const stPost = supervisor.readState(slug, {projectDir: dir});
  ok('phase re-pended after restart', stPost.phases.plan.status === 'pending');
  ok('restart_history has 1 entry',
    Array.isArray(stPost.phases.plan.restart_history)
    && stPost.phases.plan.restart_history.length === 1);
  ok('classifier_history preserved across restart',
    Array.isArray(stPost.phases.plan.classifier_history)
    && stPost.phases.plan.classifier_history.length === 1);

  // second attempt
  fs.mkdirSync(path.join(dir, 'lib'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'lib', 'attempt-b.js'), '"good output"\n');
  classify.recordClassification(slug, 'plan',
    {user_message: 'second attempt looks good', class: 'in-flow', confidence: 'L1'},
    {projectDir: dir}
  );
  const com2 = checkpoint.commit(slug, 'plan', {projectDir: dir});
  ok('second commit succeeds', typeof com2.commit === 'string');

  const stFinal = supervisor.readState(slug, {projectDir: dir});
  ok('final phase complete', stFinal.phases.plan.status === 'complete');
  ok('classifier_history grew to 2',
    stFinal.phases.plan.classifier_history.length === 2);
}

// ----------------------------------------------------------------

section('scope enforcement: out-of-scope writes are not committed');
{
  const dir = mkProject('scope');
  const slug = 'sc-1';

  supervisor.initRun(slug, {workflow: 'quick'}, {projectDir: dir});
  supervisor.setPath(slug, 'phases.plan',
    {status: 'pending', outputs: ['lib/']},
    {projectDir: dir}
  );
  checkpoint.snapshot(slug, 'plan', {projectDir: dir});

  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'in.js'), 'ok\n');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'out.md'), 'should be skipped\n');

  const com = checkpoint.commit(slug, 'plan', {projectDir: dir});
  ok('out-of-scope file skipped (>=1)', com.skippedOutOfScope >= 1);

  // docs/out.md must still be dirty in the working tree.
  const st = git(['status', '--porcelain'], dir);
  ok('docs/ left dirty after commit', st.includes('docs/'));

  // The committed tree must NOT contain docs/out.md.
  const tree = git(['ls-tree', '-r', 'HEAD'], dir);
  ok('docs/out.md not committed', !tree.includes('docs/out.md'));
  ok('lib/in.js committed', tree.includes('lib/in.js'));
}

// ----------------------------------------------------------------

console.log(`\n${failed === 0 ? 'All' : ''} integration checks ${failed === 0 ? 'passed' : 'failed'}. (${passed} passed, ${failed} failed)`);
process.exit(failed === 0 ? 0 : 1);
