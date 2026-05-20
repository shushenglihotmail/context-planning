'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('../lib/paths');

let passed = 0, failed = 0;
const tracked = [];

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
function section(label) { console.log(`\n=== ${label} ===`); }

// =============================================================
section('lib/paths: milestoneSlug');
{
  ok('basic slug', paths.milestoneSlug('v0.7 Design Capture') === 'v0-7-design-capture');
  ok('trims', paths.milestoneSlug('  Spaces  ') === 'spaces');
  ok('punctuation collapses', paths.milestoneSlug('v1.0 — Final!') === 'v1-0-final');
  ok('empty -> fallback', paths.milestoneSlug('') === 'milestone');
  ok('only punctuation -> fallback', paths.milestoneSlug('---') === 'milestone');
}

section('lib/paths: milestoneDir / milestoneDesignFile');
{
  const root = mktmp('paths');
  const md = paths.milestoneDir('v0.7 Design Capture', root);
  ok('milestoneDir contains slug', md.endsWith(path.join('milestones', 'v0-7-design-capture')));
  const mdf = paths.milestoneDesignFile('v0.7 Design Capture', root);
  ok('milestoneDesignFile is DESIGN.md inside milestoneDir',
    mdf === path.join(md, 'DESIGN.md'));
}

section('lib/paths: designFile resolves phase dir');
{
  const root = mktmp('paths-df');
  ok('null when no phase exists', paths.designFile('16', root) === null);

  const phaseDir = path.join(root, '.planning', 'phases', '16-design-capture-infrastructure');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '');

  const df = paths.designFile('16', root);
  ok('resolves to DESIGN.md inside the phase dir',
    df === path.join(phaseDir, 'DESIGN.md'));

  const df2 = paths.designFile('16-design-capture-infrastructure', root);
  ok('resolves by slug too', df2 === path.join(phaseDir, 'DESIGN.md'));
}

// =============================================================
section('lib/lifecycle: scaffoldPhase emits DESIGN.md');
{
  const lifecycle = require('../lib/lifecycle');
  const root = mktmp('scaffold-design');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n\n### 🚧 Test Milestone (In Progress)\n');

  const r = lifecycle.scaffoldPhase(root, '99', { name: 'design test', plans: 1 });
  ok('scaffoldPhase ok', r.ok === true);

  const planPath = path.join(r.phaseDir, 'PLAN.md');
  ok('PLAN.md exists', fs.existsSync(planPath));

  const designPath = path.join(r.phaseDir, 'DESIGN.md');
  ok('DESIGN.md exists', fs.existsSync(designPath));

  const design = fs.readFileSync(designPath, 'utf8');
  ok('DESIGN.md has phase: "99" frontmatter', /^phase:\s*"99"\s*$/m.test(design));
  ok('DESIGN.md has milestone: Test Milestone', /^milestone:\s*Test Milestone\s*$/m.test(design));
  ok('DESIGN.md title substituted', /^# Design: Phase 99: design test\s*$/m.test(design));
  ok('DESIGN.md has Status section', design.includes('## Status'));
  ok('DESIGN.md has Architecture section', design.includes('## Architecture'));
  ok('DESIGN.md has no unsubstituted placeholders',
    !design.includes('{{') && !design.includes('}}'),
    `found: ${(design.match(/\{\{[^}]+\}\}/g)||[]).join(',')}`);

  const wrote = r.actions.find((a) => a.path === designPath);
  ok('actions include DESIGN.md write', !!wrote && wrote.kind === 'write');
}

// =============================================================
// Cleanup
for (const d of tracked) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
