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
section('lib/lifecycle: scaffoldMilestone emits milestones/<slug>/DESIGN.md');
{
  const lifecycle = require('../lib/lifecycle');
  const root = mktmp('scaffold-milestone-design');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n');

  const r = lifecycle.scaffoldMilestone(root, 'v0.7 Design Capture');
  ok('scaffoldMilestone ok', r.ok === true);

  const roadmap = fs.readFileSync(path.join(root, '.planning', 'ROADMAP.md'), 'utf8');
  ok('roadmap has milestone heading', roadmap.includes('v0.7 Design Capture'));

  const mdPath = paths.milestoneDesignFile('v0.7 Design Capture', root);
  ok('milestone DESIGN.md exists', fs.existsSync(mdPath));

  const design = fs.readFileSync(mdPath, 'utf8');
  ok('milestone DESIGN has milestone_slug frontmatter',
    /^milestone_slug:\s*"v0-7-design-capture"\s*$/m.test(design));
  ok('milestone DESIGN title substituted',
    /^# Design: v0\.7 Design Capture\s*$/m.test(design));
  ok('milestone DESIGN has no unsubstituted placeholders',
    !design.includes('{{') && !design.includes('}}'));

  const wrote = r.actions.find((a) => a.path === mdPath);
  ok('actions include milestone DESIGN.md write', !!wrote && wrote.kind === 'write');
}

// =============================================================
section('lib/milestone: aggregateSummaries surfaces phaseDesignRefs[]');
{
  const milestone = require('../lib/milestone');
  const root = mktmp('agg-design');
  const phasePath = path.join(root, '.planning', 'phases', '16-test-phase');
  fs.mkdirSync(phasePath, { recursive: true });
  fs.writeFileSync(path.join(phasePath, 'DESIGN.md'), '# Design: Phase 16\n');

  const summaries = [
    { phase: '16', plan: '01', phasePath, data: { subsystem: 'tooling', 'key-decisions': ['dec1'] } },
    { phase: '16', plan: '02', phasePath, data: { subsystem: 'tooling', 'key-decisions': ['dec2'] } },
  ];

  const agg = milestone.aggregateSummaries(summaries);
  ok('phaseDesignRefs key exists', Array.isArray(agg.phaseDesignRefs));
  ok('phaseDesignRefs deduped to 1 entry per phase', agg.phaseDesignRefs.length === 1);
  ok('phaseDesignRefs[0].phase = "16"',
    agg.phaseDesignRefs[0] && agg.phaseDesignRefs[0].phase === '16');
}

section('lib/milestone: aggregateSummaries empty when no DESIGN.md');
{
  const milestone = require('../lib/milestone');
  const root = mktmp('agg-nodes');
  const phasePath = path.join(root, '.planning', 'phases', '17-no-design');
  fs.mkdirSync(phasePath, { recursive: true });
  // No DESIGN.md.
  const summaries = [{ phase: '17', plan: '01', phasePath, data: {} }];
  const agg = milestone.aggregateSummaries(summaries);
  ok('phaseDesignRefs empty when no DESIGN', agg.phaseDesignRefs.length === 0);
}

// =============================================================
section('lib/milestone: promoteMilestoneContext');
{
  const milestoneLib = require('../lib/milestone');
  const root = mktmp('promote');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });

  ok('null when no context', milestoneLib.promoteMilestoneContext(root, 'X') === null);

  fs.writeFileSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md'), '   \n');
  ok('null when context empty', milestoneLib.promoteMilestoneContext(root, 'X') === null);

  fs.writeFileSync(path.join(root, '.planning', 'MILESTONE-CONTEXT.md'),
    '# Brainstorm\n\nQ: what?\nA: this.\n');
  const r1 = milestoneLib.promoteMilestoneContext(root, 'v0.7 Test');
  ok('action = created', r1 && r1.action === 'created');
  ok('after has Brainstorm transcript heading', r1.after.includes('## Brainstorm transcript'));
  ok('after has Q&A body', r1.after.includes('Q: what?'));
  ok('after has slug frontmatter', r1.after.includes('milestone_slug: "v0-7-test"'));

  fs.mkdirSync(path.dirname(r1.path), { recursive: true });
  fs.writeFileSync(r1.path, '---\nmilestone: v0.7 Test\n---\n\n# Design: v0.7 Test\n\n## Status\nAccepted\n');
  const r2 = milestoneLib.promoteMilestoneContext(root, 'v0.7 Test');
  ok('action = appended', r2 && r2.action === 'appended');
  ok('appended preserves Status section', r2.after.includes('## Status') && r2.after.includes('Accepted'));
  ok('appended adds Brainstorm transcript', r2.after.includes('## Brainstorm transcript'));
}

section('lib/milestone: writeSummary validates key-decisions');
{
  const milestoneLib = require('../lib/milestone');
  const root = mktmp('ws-validate');
  fs.mkdirSync(path.join(root, '.planning', 'phases', '50-test'), { recursive: true });

  const empty = { phase: '50', plan: '01', 'key-decisions': [] };
  let caught = null;
  try { milestoneLib.writeSummary(root, '50-01', empty); }
  catch (e) { caught = e; }
  ok('empty key-decisions throws', caught !== null);
  ok('error message mentions key-decisions',
    caught && caught.message.includes("'key-decisions' is required"));
  ok('error message references spec',
    caught && caught.message.includes('docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md'));

  const missing = { phase: '50', plan: '01' };
  let caught2 = null;
  try { milestoneLib.writeSummary(root, '50-01', missing); }
  catch (e) { caught2 = e; }
  ok('missing key-decisions throws', caught2 !== null);

  const valid = { phase: '50', plan: '01', 'key-decisions': ['decision 1'] };
  let caught3 = null;
  try { milestoneLib.writeSummary(root, '50-01', valid); }
  catch (e) { caught3 = e; }
  ok('valid input does not throw', caught3 === null);
}

section('CLI: cp write-summary exits 2 on empty key-decisions');
{
  const { spawnSync } = require('child_process');
  const root = mktmp('ws-cli');
  fs.mkdirSync(path.join(root, '.planning', 'phases', '50-test'), { recursive: true });
  const json = path.join(root, 'bad.json');
  fs.writeFileSync(json, JSON.stringify({ phase: '50', plan: '01', 'key-decisions': [] }), 'utf8');

  const cpBin = path.join(__dirname, '..', 'bin', 'cp.js');
  const r = spawnSync(process.execPath, [cpBin, 'write-summary', '50-01', '--from', json], {
    cwd: root,
    encoding: 'utf8',
  });
  ok('exit code is 2', r.status === 2);
  ok('stderr includes key-decisions error',
    (r.stderr || '').includes("'key-decisions' is required"));
}

section('lib/lifecycle: scaffoldPhase emits REVIEW-LOG.md');
{
  const lifecycle = require('../lib/lifecycle');
  const root = mktmp('scaffold-review');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(root, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n## Phases\n\n### 🚧 Test Milestone (In Progress)\n');
  const r = lifecycle.scaffoldPhase(root, '98', { name: 'review test', plans: 1 });
  ok('scaffoldPhase ok', r.ok === true);
  const reviewPath = path.join(r.phaseDir, 'REVIEW-LOG.md');
  ok('REVIEW-LOG.md exists', fs.existsSync(reviewPath));
  const rl = fs.readFileSync(reviewPath, 'utf8');
  ok('REVIEW-LOG has phase frontmatter', /^phase:\s*"98"\s*$/m.test(rl));
  ok('REVIEW-LOG has entries marker', rl.includes('REVIEW-LOG-ENTRIES-BELOW'));
  ok('REVIEW-LOG no placeholders', !rl.includes('{{') && !rl.includes('}}'));
  const wrote = r.actions.find((a) => a.path === reviewPath);
  ok('actions include REVIEW-LOG.md write', !!wrote && wrote.kind === 'write');
  ok('scaffoldPhase now emits 4 actions', r.actions.length === 4);
}

section('lib/milestone: aggregateSummaries surfaces reviewLogRefs[] + reviewCount');
{
  const milestone = require('../lib/milestone');
  const root = mktmp('agg-review');
  const phasePath = path.join(root, '.planning', 'phases', '20-test');
  fs.mkdirSync(phasePath, { recursive: true });
  fs.writeFileSync(path.join(phasePath, 'REVIEW-LOG.md'),
    '---\nphase: "20"\n---\n# Review Log\n\n<!-- REVIEW-LOG-ENTRIES-BELOW -->\n\n## 2026-05-20 — Plan 20-01 Task 1 — code-quality\n\n**Verdict:** approved\n\n---\n\n## 2026-05-20 — Plan 20-01 Task 2 — spec-compliance\n\n**Verdict:** rejected\n\n---\n');
  const summaries = [{ phase: '20', plan: '01', phasePath, data: {} }];
  const agg = milestone.aggregateSummaries(summaries);
  ok('reviewLogRefs key exists', Array.isArray(agg.reviewLogRefs));
  ok('reviewLogRefs has 1 entry (deduped by phase)', agg.reviewLogRefs.length === 1);
  ok('reviewCount tallies all entries across phases', agg.reviewCount === 2);
}

section('lib/milestone: aggregateSummaries empty review counts');
{
  const milestone = require('../lib/milestone');
  const root = mktmp('agg-noreview');
  const phasePath = path.join(root, '.planning', 'phases', '21-norl');
  fs.mkdirSync(phasePath, { recursive: true });
  const summaries = [{ phase: '21', plan: '01', phasePath, data: {} }];
  const agg = milestone.aggregateSummaries(summaries);
  ok('reviewLogRefs empty', agg.reviewLogRefs.length === 0);
  ok('reviewCount zero', agg.reviewCount === 0);
}

// =============================================================
// Cleanup
for (const d of tracked) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
