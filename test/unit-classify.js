'use strict';

/**
 * Tests for lib/classify.js — v1.4 message-broker classifier helpers.
 *
 * Covers:
 *   - validateClassification accepts well-formed objects
 *   - validateClassification rejects missing/invalid fields
 *   - validateClassification requires intent when class=control
 *   - recordClassification stamps ts and appends to state.json
 *   - recordClassification throws on invalid classification
 *   - recordClassification rejects bogus phase ids
 *   - rubric() reads commands/cp/classify.md when present
 *   - rubric() returns fallback prose when missing
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const classify = require('../lib/classify');
const supervisor = require('../lib/supervisor');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

function tmpdir(suffix = '') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cp-classify-${suffix}-`));
}

// ---------- validateClassification ----------

section('validateClassification accepts well-formed objects');
{
  const good = {
    user_message: 'also handle empty list',
    class: 'in-flow',
    confidence: 'L1',
    rationale: 'additive instruction',
  };
  const r = classify.validateClassification(good);
  ok('ok=true', r.ok === true);
  ok('no errors', Array.isArray(r.errors) && r.errors.length === 0);
}

section('validateClassification rejects invalid shapes');
{
  ok('null rejected', classify.validateClassification(null).ok === false);
  ok('array rejected', classify.validateClassification([]).ok === false);
  ok('missing user_message rejected',
    classify.validateClassification({class: 'side', confidence: 'L1'}).ok === false);
  ok('empty user_message rejected',
    classify.validateClassification({user_message: '', class: 'side', confidence: 'L1'}).ok === false);
  ok('bad class rejected',
    classify.validateClassification({user_message: 'x', class: 'nope', confidence: 'L1'}).ok === false);
  ok('bad confidence rejected',
    classify.validateClassification({user_message: 'x', class: 'side', confidence: 'L4'}).ok === false);
  ok('rationale wrong type rejected',
    classify.validateClassification({user_message: 'x', class: 'side', confidence: 'L1', rationale: 42}).ok === false);
}

section('validateClassification requires intent when class=control');
{
  const noIntent = {user_message: 'pause', class: 'control', confidence: 'L1'};
  ok('control without intent rejected', classify.validateClassification(noIntent).ok === false);
  const withIntent = {user_message: 'pause', class: 'control', confidence: 'L1', intent: 'pause'};
  ok('control with intent accepted', classify.validateClassification(withIntent).ok === true);
  const emptyIntent = {user_message: 'pause', class: 'control', confidence: 'L1', intent: ''};
  ok('control with empty intent rejected', classify.validateClassification(emptyIntent).ok === false);
}

// ---------- recordClassification ----------

section('recordClassification stamps ts and appends to state.json');
{
  const dir = tmpdir('record');
  supervisor.initRun('rec-1', {workflow: 'milestone'}, {projectDir: dir});
  const entry = {
    user_message: 'also add a test',
    class: 'in-flow',
    confidence: 'L1',
    rationale: 'additive scope',
  };
  const st = classify.recordClassification('rec-1', 'plan', entry, {projectDir: dir});
  const hist = st.phases && st.phases.plan && st.phases.plan.classifier_history;
  ok('history is array of length 1', Array.isArray(hist) && hist.length === 1);
  ok('ts auto-stamped', typeof hist[0].ts === 'string' && hist[0].ts.length > 0);
  ok('user_message preserved', hist[0].user_message === 'also add a test');

  // second entry
  classify.recordClassification('rec-1', 'plan', {
    user_message: 'stop',
    class: 'control',
    confidence: 'L1',
    intent: 'pause',
  }, {projectDir: dir});
  const st2 = supervisor.readState('rec-1', {projectDir: dir});
  ok('two entries', st2.phases.plan.classifier_history.length === 2);
}

section('recordClassification throws on invalid classification');
{
  const dir = tmpdir('rec-bad');
  supervisor.initRun('rec-bad-1', {workflow: 'milestone'}, {projectDir: dir});
  let threw = false;
  try {
    classify.recordClassification('rec-bad-1', 'plan', {user_message: 'x', class: 'nope', confidence: 'L1'}, {projectDir: dir});
  } catch (_) { threw = true; }
  ok('throws on bad class', threw);
}

section('recordClassification rejects bogus phase ids');
{
  const dir = tmpdir('rec-bad-phase');
  supervisor.initRun('rec-bp', {workflow: 'milestone'}, {projectDir: dir});
  for (const bad of ['', 'a/b', 'has space', '../escape']) {
    let threw = false;
    try {
      classify.recordClassification('rec-bp', bad, {
        user_message: 'x', class: 'side', confidence: 'L1',
      }, {projectDir: dir});
    } catch (_) { threw = true; }
    ok('rejects phaseId ' + JSON.stringify(bad), threw);
  }
}

// ---------- rubric ----------

section('rubric() reads commands/cp/classify.md when present');
{
  // Use the live repo's classify.md
  const r = classify.rubric(process.cwd());
  ok('returns non-empty string', typeof r === 'string' && r.length > 100);
  ok('mentions in-flow class', r.includes('in-flow'));
  ok('mentions L1/L2/L3', r.includes('L1') && r.includes('L2') && r.includes('L3'));
}

section('rubric() returns fallback when classify.md missing');
{
  const dir = tmpdir('no-rubric');
  const r = classify.rubric(dir);
  ok('returns fallback string', typeof r === 'string' && r.includes('class'));
  ok('mentions confidence', r.includes('confidence'));
}

// ---------- summary ----------

if (failed > 0) {
  console.log(`\n${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll classifier checks passed. (${passed})`);
