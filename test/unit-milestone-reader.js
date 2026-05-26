'use strict';

/**
 * Unit tests for lib/milestone.js readPhases + scaffoldTierFiles.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readPhases, scaffoldTierFiles } = require('../lib/milestone');
const { validatePhase } = require('../lib/types');

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

function roadmap(body) {
  return `# Roadmap\n\n## Phases\n\n${body.trim()}\n`;
}

function phase(num, name, plans, extra) {
  const planLines = plans == null ? '' : `\n\nPlans:\n${plans.join('\n')}\n`;
  return `### Phase ${num}: ${name}\n${extra || ''}${planLines}`;
}

function withoutBom(file) {
  const bytes = fs.readFileSync(file);
  return !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);
}

console.log('unit-milestone-reader');

// readPhases
check('empty ROADMAP returns empty array', () => {
  assert.deepStrictEqual(readPhases(''), []);
});

const pending = readPhases(roadmap(phase('49', 'Foundations', [
  '- [ ] 49-01: First plan',
  '- [ ] 49-02: readPhases + scaffold',
  '- [ ] 49-03: workflow reader',
])))[0];
check('single phase with none checked is pending', () => {
  assert.strictEqual(pending.status, 'pending');
});
check('single phase with explicit plans has length 3', () => {
  assert.strictEqual(pending.plans.length, 3);
});

check('single phase with all checked is complete', () => {
  const p = readPhases(roadmap(phase('49', 'Done', [
    '- [x] 49-01: First',
    '- [x] 49-02: Second',
    '- [X] 49-03: Third',
  ])))[0];
  assert.strictEqual(p.status, 'complete');
});

const mixed = readPhases(roadmap(phase('49', 'Mixed', [
  '- [x] 49-01: First',
  '- [ ] 49-02: Second',
  '- [ ] 49-03: Third',
])))[0];
check('phase with mixed checkbox states is in-progress', () => {
  assert.strictEqual(mixed.status, 'in-progress');
});

check('phase id parsing preserves integer and decimal ids', () => {
  const phases = readPhases(roadmap([
    phase('1', 'One', []),
    phase('2.1', 'Two point one', []),
    phase('49', 'Forty nine', []),
    phase('10', 'Ten', []),
  ].join('\n')));
  assert.deepStrictEqual(phases.map((p) => p.id), ['1', '2.1', '49', '10']);
});

check('plan id parsing preserves integer and decimal phase prefixes', () => {
  const phases = readPhases(roadmap([
    phase('49', 'Forty nine', ['- [ ] 49-01: First']),
    phase('2.1', 'Decimal', ['- [ ] 2.1-03: Third']),
  ].join('\n')));
  assert.deepStrictEqual(phases.flatMap((p) => p.plans.map((plan) => plan.id)), ['49-01', '2.1-03']);
});

check('ROADMAP with multiple milestones extracts all phases', () => {
  const phases = readPhases(roadmap(`### 🚧 v1.0 Alpha (In Progress)\n\n${phase('1', 'Alpha', [])}\n\n### 📋 v1.1 Beta (Planned)\n\n${phase('2', 'Beta', [])}`));
  assert.deepStrictEqual(phases.map((p) => p.id), ['1', '2']);
});

check('phase workflow frontmatter is extracted', () => {
  const p = readPhases(roadmap(phase('49', 'Workflow', ['- [ ] 49-01: First'], '\n---\nworkflow: dev\n---\n')))[0];
  assert.strictEqual(p.workflow, 'dev');
});

check('phase without workflow leaves workflow undefined', () => {
  assert.strictEqual(pending.workflow, undefined);
});

check('read phase output passes validatePhase', () => {
  assert.deepStrictEqual(validatePhase(pending), { ok: true, errors: [] });
});

check('collapsed milestone details block phases are parsed', () => {
  const phases = readPhases(roadmap(`<details>\n<summary>✅ v1.0 Done (Phases 1-1) — SHIPPED 2026-05-25</summary>\n\n${phase('1', 'Collapsed', ['- [x] 01-01: Finished'])}\n\n</details>`));
  assert.strictEqual(phases[0].id, '1');
});

check('plan description text includes everything after id and colon', () => {
  const p = readPhases(roadmap(phase('49', 'Descriptions', ['- [ ] 49-01: Implement reader: keep inner colon'])))[0];
  assert.strictEqual(p.plans[0].desc, 'Implement reader: keep inner colon');
});

check('status derivation covers 0/3, 3/3, and 1/3 states', () => {
  const statuses = readPhases(roadmap([
    phase('1', 'Zero', ['- [ ] 01-01: A', '- [ ] 01-02: B', '- [ ] 01-03: C']),
    phase('2', 'All', ['- [x] 02-01: A', '- [x] 02-02: B', '- [x] 02-03: C']),
    phase('3', 'Some', ['- [x] 03-01: A', '- [ ] 03-02: B', '- [ ] 03-03: C']),
  ].join('\n'))).map((p) => p.status);
  assert.deepStrictEqual(statuses, ['pending', 'complete', 'in-progress']);
});

check('plans array order matches ROADMAP order', () => {
  assert.deepStrictEqual(pending.plans.map((p) => p.id), ['49-01', '49-02', '49-03']);
});

check('done flag per plan matches checkbox state', () => {
  assert.deepStrictEqual(mixed.plans.map((p) => p.done), [true, false, false]);
});

check('empty plans list produces empty plans array and pending status', () => {
  const p = readPhases(roadmap('### Phase 6: Legacy without plans\n\nNotes only.'))[0];
  assert.deepStrictEqual({ plans: p.plans, status: p.status }, { plans: [], status: 'pending' });
});

check('milestone phase name is extracted from heading', () => {
  const p = readPhases(roadmap(phase('7', 'Build parser', [])))[0];
  assert.strictEqual(p.name, 'Build parser');
});

check('INSERTED suffix on phase heading is ignored', () => {
  const p = readPhases(roadmap('### Phase 2.1: Hotfix parser (INSERTED)\n\nPlans:\n- [ ] 2.1-01: Patch'))[0];
  assert.strictEqual(p.name, 'Hotfix parser');
});

check('phase id 2.1 is preserved as string', () => {
  const p = readPhases(roadmap(phase('2.1', 'Decimal id', [])))[0];
  assert.strictEqual(p.id, '2.1');
});

check('trailing whitespace and blank-line patterns are tolerated', () => {
  const p = readPhases('# R\n\n## Phases\n\n### Phase 3: Spacing   \n\nPlans:\n   - [ ] 03-01: Trim me   \n\n')[0];
  assert.strictEqual(p.plans[0].desc, 'Trim me');
});

check('bold Workflow annotation is extracted', () => {
  const p = readPhases(roadmap('### Phase 5: Annotated\n\n**Workflow**: dev\n\nPlans:\n- [ ] 05-01: A'))[0];
  assert.strictEqual(p.workflow, 'dev');
});

// scaffoldTierFiles
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-milestone-reader-'));
const originalCwd = process.cwd();
try {
  const root = path.join(sandbox, 'planning');
  const slug = 'v1-2-unified-phase-model';
  const dir = path.join(root, 'milestones', slug);
  const designPath = path.join(dir, 'DESIGN.md');
  const statePath = path.join(dir, 'STATE.md');

  const created = scaffoldTierFiles(slug, 'Unify phase readers.', { root });
  check('both tier files are created when neither exists', () => {
    assert.deepStrictEqual(created, { designCreated: true, stateCreated: true });
  });
  check('milestone directory is created if absent', () => {
    assert.strictEqual(fs.existsSync(dir), true);
  });
  check('DESIGN.md contains the brief text', () => {
    assert.match(fs.readFileSync(designPath, 'utf8'), /Unify phase readers\./);
  });
  check('DESIGN.md contains the milestone name heading', () => {
    assert.match(fs.readFileSync(designPath, 'utf8'), /# Design: v1\.2 Unified Phase Model/);
  });
  check('STATE.md contains milestone slug in frontmatter', () => {
    assert.match(fs.readFileSync(statePath, 'utf8'), /milestone_slug: "v1-2-unified-phase-model"/);
  });
  check('created files are UTF-8 without BOM', () => {
    assert.strictEqual(withoutBom(designPath) && withoutBom(statePath), true);
  });

  fs.writeFileSync(designPath, 'existing design', 'utf8');
  fs.writeFileSync(statePath, 'existing state', 'utf8');
  const notCreated = scaffoldTierFiles(slug, 'Replacement brief', { root });
  check('neither tier file is overwritten when both exist', () => {
    assert.deepStrictEqual(notCreated, { designCreated: false, stateCreated: false });
  });
  check('existing file contents are preserved', () => {
    assert.deepStrictEqual([fs.readFileSync(designPath, 'utf8'), fs.readFileSync(statePath, 'utf8')], ['existing design', 'existing state']);
  });

  const designOnlyRoot = path.join(sandbox, 'design-only');
  const designOnlyDir = path.join(designOnlyRoot, 'milestones', slug);
  fs.mkdirSync(designOnlyDir, { recursive: true });
  fs.writeFileSync(path.join(designOnlyDir, 'STATE.md'), 'existing state', 'utf8');
  check('DESIGN.md only is created when STATE.md exists', () => {
    assert.deepStrictEqual(scaffoldTierFiles(slug, 'Brief', { root: designOnlyRoot }), { designCreated: true, stateCreated: false });
  });

  const stateOnlyRoot = path.join(sandbox, 'state-only');
  const stateOnlyDir = path.join(stateOnlyRoot, 'milestones', slug);
  fs.mkdirSync(stateOnlyDir, { recursive: true });
  fs.writeFileSync(path.join(stateOnlyDir, 'DESIGN.md'), 'existing design', 'utf8');
  check('STATE.md only is created when DESIGN.md exists', () => {
    assert.deepStrictEqual(scaffoldTierFiles(slug, 'Brief', { root: stateOnlyRoot }), { designCreated: false, stateCreated: true });
  });

  const defaultRoot = path.join(sandbox, 'default-root');
  fs.mkdirSync(defaultRoot, { recursive: true });
  process.chdir(defaultRoot);
  check('scaffoldTierFiles works with default opts', () => {
    assert.deepStrictEqual(scaffoldTierFiles('v1-2-default-root', 'Default root brief'), { designCreated: true, stateCreated: true });
    assert.strictEqual(fs.existsSync(path.join(defaultRoot, '.planning', 'milestones', 'v1-2-default-root', 'DESIGN.md')), true);
  });
} finally {
  process.chdir(originalCwd);
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exitCode = 1;
}
