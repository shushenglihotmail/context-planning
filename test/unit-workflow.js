'use strict';

/**
 * Tests for lib/workflow.js — YAML workflow template loading, validation, and
 * parallel execution wave computation.
 */

const fs = require('fs');
const path = require('path');

const workflow = require('../lib/workflow');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}
function section(title) { console.log(`\n=== ${title} ===`); }

function fixture(name) {
  return path.join(__dirname, 'fixtures', 'workflows', name);
}

function deepEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function errorIncludes(result, text) {
  const needle = String(text).toLowerCase();
  return result.errors.some((e) => e.toLowerCase().includes(needle));
}

function warningIncludes(result, text) {
  const needle = String(text).toLowerCase();
  return result.warnings.some((w) => w.toLowerCase().includes(needle));
}

function validTemplate(overrides) {
  const template = {
    meta: { workflow: 'valid', version: 1, binds_to: 'custom' },
    principles: [],
    defaults: {},
    phases: [{ id: 'one', depends_on: [] }],
  };
  return Object.assign(template, overrides || {});
}

const cleanupDirs = [];
function makeScratchDir(name) {
  const dir = path.join(__dirname, 'fixtures', 'workflows', `.scratch-${name}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  cleanupDirs.push(dir);
  return dir;
}

section('1. loadTemplate happy paths');
const linear = workflow.loadTemplate(fixture('linear.yaml'));
ok('loads linear template object', !!linear && typeof linear === 'object');
ok('linear meta.workflow is preserved', linear.meta.workflow === 'linear');
ok('linear meta.version is preserved', linear.meta.version === 1);
ok('linear meta.binds_to is normalized from custom to quick (51-03)', linear.meta.binds_to === 'quick');
ok('linear principles has 2 entries', Array.isArray(linear.principles) && linear.principles.length === 2);
ok('linear defaults model preserved', linear.defaults && linear.defaults.model === 'default');
ok('linear first phase id preserved', linear.phases[0].id === 'brainstorm');
ok('linear first phase depends_on defaults to []', deepEquals(linear.phases[0].depends_on, []));
ok('linear second phase depends_on preserved', deepEquals(linear.phases[1].depends_on, ['brainstorm']));
ok('linear phase role preserved', linear.phases[0].role === 'researcher');
ok('linear phase prompt preserved', linear.phases[1].prompt === 'Create the plan');
ok('meta excludes principles/defaults/phases keys', !Object.prototype.hasOwnProperty.call(linear.meta, 'phases') && !Object.prototype.hasOwnProperty.call(linear.meta, 'principles') && !Object.prototype.hasOwnProperty.call(linear.meta, 'defaults'));
const parallel = workflow.loadTemplate(fixture('parallel.yaml'));
ok('loads parallel template by full path', parallel.meta.workflow === 'parallel' && parallel.phases.length === 4);
ok('parallel meta.binds_to is preserved', parallel.meta.binds_to === 'phase');

section('2. loadTemplate binds_to/defaults');
const noOptional = workflow.loadTemplate(fixture('cycle.yaml'));
ok('missing binds_to defaults to quick (51-03)', noOptional.meta.binds_to === 'quick');
ok('missing principles defaults to []', deepEquals(noOptional.principles, []));
ok('missing defaults defaults to {}', deepEquals(noOptional.defaults, {}));

section('3. loadTemplate parse error');
let parseError = null;
try {
  workflow.loadTemplate(fixture('bad-yaml.yaml'));
} catch (err) {
  parseError = err;
}
ok('bad YAML throws', !!parseError);
ok('parse error mentions file path', parseError && parseError.message.includes(fixture('bad-yaml.yaml')));
ok('parse error mentions parse or YAML detail', parseError && (/parse/i.test(parseError.message) || /yaml|bracket|invalid/i.test(parseError.message)));

section('4. resolveTemplate');
const tempRoot = makeScratchDir('project');
const tempWorkflowDir = path.join(tempRoot, '.planning', 'workflows');
fs.mkdirSync(tempWorkflowDir, { recursive: true });
const namedPath = path.join(tempWorkflowDir, 'named.yaml');
fs.writeFileSync(namedPath, 'workflow: named\nversion: 1\nphases:\n  - id: one\n', 'utf8');
const resolvedNamed = workflow.resolveTemplate('named', { projectDir: tempRoot });
ok('resolveTemplate finds project workflow', resolvedNamed === namedPath);
const missingRoot = makeScratchDir('missing');
let resolveError = null;
try {
  workflow.resolveTemplate('absent-workflow-name', { projectDir: missingRoot });
} catch (err) {
  resolveError = err;
}
ok('resolveTemplate throws when no workflow exists', !!resolveError);
ok('resolveTemplate not found error is clear', resolveError && /not found/i.test(resolveError.message));
ok('resolveTemplate error lists searched paths', resolveError && resolveError.message.includes(path.join(missingRoot, '.planning', 'workflows', 'absent-workflow-name.yaml')));
const customRoot = makeScratchDir('custom');
fs.mkdirSync(path.join(customRoot, '.planning', 'workflows'), { recursive: true });
const customPath = path.join(customRoot, '.planning', 'workflows', 'custom-name.yaml');
fs.writeFileSync(customPath, 'workflow: custom-name\nversion: 1\nphases:\n  - id: one\n', 'utf8');
ok('resolveTemplate uses opts.projectDir custom location', workflow.resolveTemplate('custom-name', { projectDir: customRoot }) === customPath);

section('5. validate happy paths');
const linearValidation = workflow.validate(linear);
ok('linear validation ok', linearValidation.ok === true);
ok('linear validation has no errors', linearValidation.errors.length === 0);
ok('linear validation has no warnings', linearValidation.warnings.length === 0);
const parallelValidation = workflow.validate(parallel);
ok('parallel validation ok', parallelValidation.ok === true);
const fivePrinciples = validTemplate({ principles: ['a', 'b', 'c', 'd', 'e'] });
ok('exactly 5 principles has no count warning', !warningIncludes(workflow.validate(fivePrinciples), 'cognitive'));

section('6. validate schema errors');
let result = workflow.validate(validTemplate({ meta: { version: 1, binds_to: 'custom' } }));
ok('missing meta.workflow reports workflow error', errorIncludes(result, 'workflow'));
result = workflow.validate(validTemplate({ meta: { workflow: 123, version: 1, binds_to: 'custom' } }));
ok('non-string meta.workflow reports workflow error', errorIncludes(result, 'workflow'));
result = workflow.validate(validTemplate({ meta: { workflow: 'valid', binds_to: 'custom' } }));
ok('missing meta.version reports version error', errorIncludes(result, 'version'));
result = workflow.validate(validTemplate({ meta: { workflow: 'valid', version: '1', binds_to: 'custom' } }));
ok('string meta.version reports version error', errorIncludes(result, 'version'));
result = workflow.validate(validTemplate({ meta: { workflow: 'valid', version: 1, binds_to: 'unknown' } }));
ok('invalid meta.binds_to reports binds_to error', errorIncludes(result, 'binds_to'));
result = workflow.validate({ meta: { workflow: 'valid', version: 1, binds_to: 'custom' }, principles: [], defaults: {} });
ok('missing phases reports phases error', errorIncludes(result, 'phases'));
result = workflow.validate(validTemplate({ phases: 'string' }));
ok('string phases reports phases error', errorIncludes(result, 'phases'));
result = workflow.validate(validTemplate({ phases: [] }));
ok('empty phases reports phases error', errorIncludes(result, 'phases'));
result = workflow.validate(validTemplate({ phases: [{ role: 'missing', depends_on: [] }] }));
ok('missing phase id reports indexed error', result.errors.some((e) => e.includes('phases[0]')));
result = workflow.validate(validTemplate({ phases: [{ id: '', depends_on: [] }] }));
ok('empty phase id reports id error', errorIncludes(result, 'id'));
result = workflow.validate(validTemplate({ phases: [{ id: 'one', depends_on: 'string' }] }));
ok('string depends_on reports depends_on error', errorIncludes(result, 'depends_on'));
result = workflow.validate(validTemplate({ phases: [{ id: 'one', depends_on: [123] }] }));
ok('non-string depends_on entry reports depends_on error', errorIncludes(result, 'depends_on'));

section('7. validate semantic errors');
result = workflow.validate(validTemplate({ phases: [{ id: 'dup', depends_on: [] }, { id: 'dup', depends_on: [] }] }));
ok('duplicate phase id reports duplicate error', errorIncludes(result, 'duplicate'));
const dangling = workflow.loadTemplate(fixture('dangling-dep.yaml'));
result = workflow.validate(dangling);
ok('dangling dep reports unknown dep', errorIncludes(result, 'unknown phase'));
ok('dangling dep error names dependency', errorIncludes(result, 'nonexistent'));
result = workflow.validate(validTemplate({ principles: 'string' }));
ok('non-array principles reports principles error', errorIncludes(result, 'principles'));
result = workflow.validate(validTemplate({ principles: [42] }));
ok('non-string principle reports index', result.errors.some((e) => e.includes('principles[0]')));
const cycle = workflow.loadTemplate(fixture('cycle.yaml'));
result = workflow.validate(cycle);
ok('cycle template reports cycle error', errorIncludes(result, 'cycle'));

section('8. validate cycle message');
const cycleMessage = result.errors.find((e) => e.includes('Cycle detected')) || '';
ok('cycle message contains arrow character', cycleMessage.includes('→'));
ok('cycle message contains cycle phase ids', cycleMessage.includes('a') && cycleMessage.includes('b'));

section('9. validate warnings');
const twelvePrinciples = validTemplate({ principles: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] });
result = workflow.validate(twelvePrinciples);
ok('12 principles emits a warning', result.warnings.length > 0);
ok('principles warning includes count and overload text', result.warnings.some((w) => w.includes('12') && (/cognitive|>10/i.test(w))));
const outOfOrder = validTemplate({ phases: [{ id: 'plan', depends_on: ['brainstorm'] }, { id: 'brainstorm', depends_on: [] }] });
result = workflow.validate(outOfOrder);
ok('non-topological file order emits warning', warningIncludes(result, 'topological') || warningIncludes(result, 'order'));
ok('warnings without errors still validate ok', result.ok === true && result.errors.length === 0);

section('10. computeWaves happy paths');
const linearWaves = workflow.computeWaves(linear);
ok('linear has 3 waves', linearWaves.length === 3);
ok('linear first wave has 1 phase', linearWaves[0].length === 1);
ok('linear wave 0 phase is brainstorm', linearWaves[0][0].id === 'brainstorm');
ok('linear wave 1 phase is plan', linearWaves[1][0].id === 'plan');
ok('linear wave 2 phase is execute', linearWaves[2][0].id === 'execute');
const parallelWaves = workflow.computeWaves(parallel);
ok('parallel has 3 waves', parallelWaves.length === 3);
ok('parallel middle wave has two phases', parallelWaves[1].length === 2);
ok('wave elements are phase objects', !!parallelWaves[1][0].id && typeof parallelWaves[1][0] === 'object');
ok('parallel wave preserves file order', parallelWaves[1][0].id === 'research-a' && parallelWaves[1][1].id === 'research-b');
ok('phase fields remain present in waves', parallelWaves[1][0].role === 'researcher' && parallelWaves[1][0].prompt === 'Research track A');

section('11. computeWaves edge cases');
const single = validTemplate({ phases: [{ id: 'only', depends_on: [], persist_output: true }] });
const singleWaves = workflow.computeWaves(single);
ok('single phase template returns one wave', singleWaves.length === 1 && singleWaves[0].length === 1);
let cycleThrown = false;
try {
  workflow.computeWaves(cycle);
} catch (err) {
  cycleThrown = true;
}
ok('computeWaves on cycle throws', cycleThrown);
const diamond = validTemplate({
  phases: [
    { id: 'a', depends_on: [] },
    { id: 'b', depends_on: ['a'] },
    { id: 'c', depends_on: ['a'] },
    { id: 'd', depends_on: ['b', 'c'] },
  ],
});
const diamondWaves = workflow.computeWaves(diamond);
ok('diamond DAG has 3 waves', diamondWaves.length === 3);
ok('diamond middle wave is b,c', diamondWaves[1].map((p) => p.id).join(',') === 'b,c');
ok('persist_output preserved through waves', singleWaves[0][0].persist_output === true);
const emptyDep = validTemplate({ phases: [{ id: 'root', depends_on: [] }, { id: 'leaf', depends_on: ['root'] }] });
ok('empty depends_on phase appears in first wave', workflow.computeWaves(emptyDep)[0][0].id === 'root');

section('12. end-to-end');
ok('linear load + validate + waves succeeds', workflow.validate(workflow.loadTemplate(fixture('linear.yaml'))).ok && workflow.computeWaves(workflow.loadTemplate(fixture('linear.yaml'))).length === 3);
ok('parallel load + validate + waves succeeds', workflow.validate(workflow.loadTemplate(fixture('parallel.yaml'))).ok && workflow.computeWaves(workflow.loadTemplate(fixture('parallel.yaml'))).length === 3);
const missingId = workflow.loadTemplate(fixture('missing-id.yaml'));
ok('missing-id template loads', missingId.phases.length === 2);
ok('missing-id template validation fails', workflow.validate(missingId).ok === false);
ok('dangling-dep template validation fails', workflow.validate(dangling).ok === false);

for (const dir of cleanupDirs) {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
