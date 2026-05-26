'use strict';

/**
 * Integration test for v1.2 fan-out runtime against the dev-v2 workflow template.
 *
 * Exercises the full pipeline:
 *   loadTemplate -> validate -> phasesFromTemplate
 *     -> buildParentPrompt (parent agent contract)
 *     -> parseParentOutput (agent reply)
 *     -> enforceChildCount
 *     -> resolveItemOrder
 *     -> expandPhases (with cross-item subtree-wait edges)
 */

const assert = require('node:assert/strict');
const path = require('path');

const {
  loadTemplate,
  validate,
  phasesFromTemplate,
} = require('../lib/workflow');
const {
  buildParentPrompt,
  parseParentOutput,
  enforceChildCount,
  resolveItemOrder,
} = require('../lib/runtime-fanout');
const { expandPhases } = require('../lib/fanout');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err && err.message ? err.message : String(err)}`);
    console.log('  ✗', name);
  }
}

function agentReply(items) {
  return 'Decomposition plan:\n\n```json\n' + JSON.stringify({ items }, null, 2) + '\n```\n';
}

console.log('integration-fanout-v12');

const templatePath = path.resolve(__dirname, '..', 'templates', 'workflows', 'dev-v2.yaml');
const template = loadTemplate(templatePath);

check('dev-v2 template loads with the expected three phases', () => {
  assert.strictEqual(template.meta.workflow, 'dev-v2');
  assert.strictEqual(template.meta.binds_to, 'milestone');
  assert.strictEqual(template.phases.length, 3);
  assert.deepStrictEqual(template.phases.map((p) => p.id), ['plan', 'child-plan', 'child-execute']);
});

check('dev-v2 template passes schema validation cleanly', () => {
  const result = validate(template);
  if (!result.ok) console.log('validation errors:', result.errors);
  assert.ok(result.ok, `validate ok (errors: ${result.errors.join('; ')})`);
});

const phases = phasesFromTemplate(template);
const parentPhase = phases.find((p) => p.id === 'plan');

check('phasesFromTemplate derives parent phase with default bounds', () => {
  assert.strictEqual(parentPhase.max_children, 10);
  assert.strictEqual(parentPhase.min_children, 1);
});

check('phasesFromTemplate derives children with parent and after fields', () => {
  const childPlan = phases.find((p) => p.id === 'child-plan');
  const childExec = phases.find((p) => p.id === 'child-execute');
  assert.strictEqual(childPlan.parent, 'plan');
  assert.strictEqual(childExec.parent, 'plan');
  assert.deepStrictEqual(childExec.after, ['child-plan']);
});

check('buildParentPrompt for plan phase quotes bounds and ordering rule', () => {
  const prompt = buildParentPrompt(parentPhase, 'Decompose the milestone.');
  assert.ok(prompt.includes('between 1 and 10 items'));
  assert.ok(prompt.includes('Default execution order is the order you list items'));
  assert.ok(prompt.includes('all-or-nothing'));
});

// --- Scenario A: agent emits items with NO depends_on (array mode) ---
const arrayModeItems = parseParentOutput(agentReply([
  { id: 'auth-core', title: 'Auth core' },
  { id: 'api-routes', title: 'API routes' },
  { id: 'ui-shell', title: 'UI shell' },
]));

check('array-mode reply: enforceChildCount accepts 3 items under max 10', () => {
  assert.strictEqual(enforceChildCount(parentPhase, arrayModeItems).length, 3);
});

check('array-mode reply: resolveItemOrder returns mode array', () => {
  assert.deepStrictEqual(resolveItemOrder(arrayModeItems), { mode: 'array' });
});

const arrayExpanded = expandPhases(phases, { plan: arrayModeItems });

check('array-mode expansion: every parent and child appears once per item', () => {
  const ids = arrayExpanded.map((row) => row.id);
  assert.deepStrictEqual(ids, [
    'plan',
    'child-plan::auth-core', 'child-execute::auth-core',
    'child-plan::api-routes', 'child-execute::api-routes',
    'child-plan::ui-shell', 'child-execute::ui-shell',
  ]);
});

check('array-mode: child-execute keeps same-item child-plan dep', () => {
  assert.deepStrictEqual(
    arrayExpanded.find((row) => row.id === 'child-execute::auth-core').after,
    ['child-plan::auth-core'],
  );
});

check('array-mode: item-2 children wait on every item-1 child', () => {
  assert.deepStrictEqual(
    arrayExpanded.find((row) => row.id === 'child-plan::api-routes').after,
    ['child-plan::auth-core', 'child-execute::auth-core'],
  );
  assert.deepStrictEqual(
    arrayExpanded.find((row) => row.id === 'child-execute::api-routes').after,
    ['child-plan::api-routes', 'child-plan::auth-core', 'child-execute::auth-core'],
  );
});

check('array-mode: item-3 children wait on item-2 subtree (chain, not full ancestry)', () => {
  const childPlanUi = arrayExpanded.find((row) => row.id === 'child-plan::ui-shell');
  assert.deepStrictEqual(childPlanUi.after, ['child-plan::api-routes', 'child-execute::api-routes']);
});

// --- Scenario B: agent emits items with FULL depends_on (DAG mode) ---
const dagItems = parseParentOutput(agentReply([
  { id: 'auth-core', title: 'Auth core', depends_on: [] },
  { id: 'api-routes', title: 'API routes', depends_on: ['auth-core'] },
  { id: 'docs', title: 'Docs', depends_on: ['auth-core'] },
  { id: 'ui-shell', title: 'UI shell', depends_on: ['api-routes'] },
]));

check('dag-mode reply: parser accepts depends_on on every item', () => {
  assert.strictEqual(dagItems.length, 4);
  for (const item of dagItems) assert.ok(Array.isArray(item.depends_on));
});

check('dag-mode reply: enforceChildCount accepts 4 items under max 10', () => {
  assert.strictEqual(enforceChildCount(parentPhase, dagItems).length, 4);
});

const dagResolved = resolveItemOrder(dagItems);

check('dag-mode reply: resolveItemOrder reports dag with auth-core first', () => {
  assert.strictEqual(dagResolved.mode, 'dag');
  assert.strictEqual(dagResolved.order[0], 'auth-core');
  assert.ok(dagResolved.order.indexOf('api-routes') < dagResolved.order.indexOf('ui-shell'));
});

const dagExpanded = expandPhases(phases, { plan: dagItems });

check('dag-mode expansion: auth-core children have no cross-item deps', () => {
  assert.deepStrictEqual(dagExpanded.find((row) => row.id === 'child-plan::auth-core').after, []);
  assert.deepStrictEqual(dagExpanded.find((row) => row.id === 'child-execute::auth-core').after, ['child-plan::auth-core']);
});

check('dag-mode expansion: api-routes children wait on full auth-core subtree', () => {
  assert.deepStrictEqual(
    dagExpanded.find((row) => row.id === 'child-plan::api-routes').after,
    ['child-plan::auth-core', 'child-execute::auth-core'],
  );
});

check('dag-mode expansion: docs (parallel to api-routes) also waits on auth-core only', () => {
  assert.deepStrictEqual(
    dagExpanded.find((row) => row.id === 'child-plan::docs').after,
    ['child-plan::auth-core', 'child-execute::auth-core'],
  );
  // docs does NOT wait on api-routes — declared parallel
  const docsPlan = dagExpanded.find((row) => row.id === 'child-plan::docs');
  assert.ok(!docsPlan.after.includes('child-plan::api-routes'));
  assert.ok(!docsPlan.after.includes('child-execute::api-routes'));
});

check('dag-mode expansion: ui-shell children wait on api-routes only (not auth-core directly)', () => {
  const uiPlan = dagExpanded.find((row) => row.id === 'child-plan::ui-shell');
  assert.deepStrictEqual(uiPlan.after, ['child-plan::api-routes', 'child-execute::api-routes']);
  // Transitive ancestry through api-routes is the executor's concern, not the expander's.
});

// --- Scenario C: agent emits PARTIAL depends_on (should fall back to array) ---
const partialItems = parseParentOutput(agentReply([
  { id: 'one', title: 'One' },
  { id: 'two', title: 'Two', depends_on: [] },
  { id: 'three', title: 'Three' },
]));

check('partial-mode reply: resolveItemOrder reports array (silent fallback)', () => {
  assert.deepStrictEqual(resolveItemOrder(partialItems), { mode: 'array' });
});

const partialExpanded = expandPhases(phases, { plan: partialItems });

check('partial-mode expansion: array-order chain regardless of declared depends_on', () => {
  assert.deepStrictEqual(
    partialExpanded.find((row) => row.id === 'child-plan::two').after,
    ['child-plan::one', 'child-execute::one'],
  );
  assert.deepStrictEqual(
    partialExpanded.find((row) => row.id === 'child-plan::three').after,
    ['child-plan::two', 'child-execute::two'],
  );
});

// --- Scenario D: error paths ---
check('cycle in dag mode is rejected with a clear error', () => {
  const cyclicItems = parseParentOutput(agentReply([
    { id: 'a', title: 'A', depends_on: ['b'] },
    { id: 'b', title: 'B', depends_on: ['a'] },
  ]));
  assert.throws(() => resolveItemOrder(cyclicItems), /cycle detected among items/);
});

check('unknown depends_on id in dag mode is rejected', () => {
  const items = parseParentOutput(agentReply([
    { id: 'a', title: 'A', depends_on: [] },
    { id: 'b', title: 'B', depends_on: ['missing'] },
  ]));
  assert.throws(() => resolveItemOrder(items), /unknown id 'missing'/);
});

check('depends_on with a non-string value is rejected at parse time', () => {
  assert.throws(
    () => parseParentOutput(agentReply([{ id: 'a', title: 'A', depends_on: [1] }])),
    /depends_on\[0\] must be a string/,
  );
});

check('over-max items rejected by enforceChildCount before expansion', () => {
  const items = Array.from({ length: 11 }, (_, i) => ({ id: `x-${i}`, title: `X${i}` }));
  const parsed = parseParentOutput(agentReply(items));
  assert.throws(() => enforceChildCount(parentPhase, parsed), /above max_children \(10\)/);
});

check('zero items rejected by enforceChildCount under min_children=1', () => {
  const parsed = parseParentOutput(agentReply([]));
  assert.throws(() => enforceChildCount(parentPhase, parsed), /below min_children \(1\)/);
});

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
