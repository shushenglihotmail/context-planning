---
phase: 16-design-capture-infrastructure
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - templates/DESIGN.md
  - lib/paths.js
  - lib/lifecycle.js
  - lib/milestone.js
  - test/unit-design.js
  - package.json
  - .github/skills/cp-new-milestone/SKILL.md
  - .github/skills/cp-plan-phase/SKILL.md
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "scaffold-phase emits DESIGN.md alongside PLAN.md"
    - "scaffold-milestone creates .planning/milestones/<slug>/DESIGN.md"
    - "aggregateSummaries surfaces phaseDesignRefs[]"
    - "completeMilestone promotes MILESTONE-CONTEXT.md into milestone DESIGN.md"
    - "templates/DESIGN.md follows the ADR + SP-brainstorm union from the spec"
  artifacts:
    - "templates/DESIGN.md exists with all required sections"
    - "test/unit-design.js passes with no failures"
    - "npm test all green (20 files now)"
  key_links:
    - "docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md (spec)"
    - "docs/superpowers/plans/2026-05-20-v0-7-plan-16-01-design-md-infrastructure.md (SP-side pointer)"
---

<objective>
Plan 16-01: DESIGN.md Infrastructure (Phase 16, milestone v0.7 Design Capture)

Purpose: Add the milestone-tier and phase-tier `DESIGN.md` files to cp's
scaffold + aggregation pipeline so SP brainstorming output has a persistent,
structured home. Implements the DESIGN.md slice of the v0.7 spec.

Output: `templates/DESIGN.md` + path helpers + scaffold extensions +
aggregator extension + promotion at milestone close + tests + skill docs.
</objective>

<execution_context>
@.planning/config.json
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md
</context>

<tasks>

<!--
Plan format: SP writing-plans bite-sized checkbox style. The
subagent-driven-development skill should treat each `### Task N` block as
one fresh-subagent dispatch. Each step inside the task is a single action
(2-5 min). Each task ends with a commit step.
-->

# Implementation Plan (Bite-Sized Tasks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## File Structure (read before starting)

| File | Action | Responsibility |
|---|---|---|
| `templates/DESIGN.md` | Create | Union ADR + SP-brainstorm template (one file, both tiers, `{{TIER_KEY}}` substitution) |
| `lib/paths.js` | Modify | Add `designFile()`, `milestoneSlug()`, `milestoneDir()`, `milestoneDesignFile()` helpers + exports |
| `lib/lifecycle.js` | Modify | Extend `scaffoldPhase()` to emit DESIGN.md action; extend `scaffoldMilestone()` to emit milestone dir + DESIGN.md action; extend `completeMilestone()` to call new promotion step |
| `lib/milestone.js` | Modify | Extend `aggregateSummaries()` output with `phaseDesignRefs[]` field; new `promoteMilestoneContext()` helper |
| `test/unit-design.js` | Create | New test file (path helpers, scaffold extensions, aggregator promotion) |
| `package.json` | Modify | Add new test to `npm test` script |
| `.github/skills/cp-new-milestone/SKILL.md` | Modify | Step 3 references both MILESTONE-CONTEXT.md and milestone DESIGN.md |
| `.github/skills/cp-plan-phase/SKILL.md` | Modify | Insert new Step 3.5 |

**Out of scope (handled in 16-02 / 16-03):** REVIEW-LOG.md, `writeSummary()` validation.

---

## Task 1: Create templates/DESIGN.md

**Files:**
- Create: `templates/DESIGN.md`

- [ ] **Step 1: Write the template file** with the following exact content:

```markdown
---
# Tier marker: cp scaffold substitutes one of:
#   phase: "{{PHASE_NUM}}"     (for phase-tier DESIGN.md)
#   milestone_slug: "{{MILESTONE_SLUG}}"  (for milestone-tier DESIGN.md)
{{TIER_KEY}}
milestone: {{MILESTONE_NAME}}
status: proposed
created: {{DATE}}
updated: {{DATE}}
deciders: []
supersedes: []
superseded_by: null
---

# Design: {{TITLE}}

## Status

{Proposed | Accepted on YYYY-MM-DD | Superseded by …}

## Context

<!-- Forces driving this design: constraints, prior decisions, requirements. -->

## Decision

<!-- What we decided. Short, declarative. -->

## Consequences

### Positive
-

### Negative
-

### Neutral
-

---

## Architecture

<!-- Boxes-and-lines, ASCII diagrams welcome. -->

## Components

<!-- Each unit: name, purpose, public interface, dependencies. -->

## Data Flow

<!-- How data moves through the components. -->

## Error Handling

<!-- Failure modes and recovery. -->

## Testing Strategy

<!-- Unit / integration / e2e split, coverage targets. -->

## Alternatives Considered

### Option A — <name>

**Pros:**

**Cons:**

**Verdict:** rejected because…

## Open Questions

- [ ]

## References

-
```

- [ ] **Step 2: Verify the file**

Run: `node -e "const fs=require('fs'); const t=fs.readFileSync('templates/DESIGN.md','utf8'); if (!t.includes('{{TIER_KEY}}')||!t.includes('## Architecture')||!t.includes('## Alternatives Considered')) { console.error('template missing required substitutions'); process.exit(1); } console.log('OK');"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add templates/DESIGN.md
git commit -m "cp(16-01): add templates/DESIGN.md (union ADR + SP brainstorm)"
```

---

## Task 2: Add path helpers in lib/paths.js

**Files:**
- Modify: `lib/paths.js` (insert four new functions after `summaryFile`, around line 102)

- [ ] **Step 1: Open `lib/paths.js` and insert these four helpers immediately after the `summaryFile` function (and before `findPhaseDir`):**

```javascript
/** Full path to a phase DESIGN.md file. Resolves the phase dir on disk first
 *  so callers can pass just the phase number. Returns null if no phase dir. */
function designFile(phaseNumOrSlug, root = repoRoot()) {
  const dir = findPhaseDir(phaseNumOrSlug, root);
  if (!dir) return null;
  return path.join(dir, 'DESIGN.md');
}

/** Slugify a milestone name (e.g. "v0.7 Design Capture" -> "v0-7-design-capture"). */
function milestoneSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'milestone';
}

/** Full path to a milestone directory: .planning/milestones/<slug>/ */
function milestoneDir(milestoneName, root = repoRoot()) {
  return path.join(planningDir(root), 'milestones', milestoneSlug(milestoneName));
}

/** Full path to a milestone DESIGN.md file. */
function milestoneDesignFile(milestoneName, root = repoRoot()) {
  return path.join(milestoneDir(milestoneName, root), 'DESIGN.md');
}
```

- [ ] **Step 2: Add the four new names to the `module.exports` block at the bottom of the file**

Open the `module.exports = { ... }` block (currently around lines 134-152). Insert these four names after `summaryFile` and before `findPhaseDir`:

```javascript
  summaryFile,
  designFile,
  milestoneSlug,
  milestoneDir,
  milestoneDesignFile,
  findPhaseDir,
```

- [ ] **Step 3: Smoke-test the helpers**

Run: `node -e "const p=require('./lib/paths'); console.log(p.milestoneSlug('v0.7 Design Capture')); console.log(p.milestoneDir('v0.7 Design Capture','/tmp')); console.log(p.milestoneDesignFile('v0.7 Design Capture','/tmp')); console.log(p.designFile('99','/tmp'));"`

Expected (Windows path separators):
```
v0-7-design-capture
\tmp\.planning\milestones\v0-7-design-capture
\tmp\.planning\milestones\v0-7-design-capture\DESIGN.md
null
```

(`designFile` returns `null` because `/tmp` has no phase 99 dir — that's correct.)

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test`

Expected: all suites pass — `Passed: N   Failed: 0` per file. No path-helper changes should break anything.

- [ ] **Step 5: Commit**

```bash
git add lib/paths.js
git commit -m "cp(16-01): add designFile / milestoneSlug / milestoneDir / milestoneDesignFile helpers"
```

---

## Task 3: Write failing tests for path helpers (new test/unit-design.js)

**Files:**
- Create: `test/unit-design.js`

- [ ] **Step 1: Write the test file**

```javascript
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
// Cleanup
for (const d of tracked) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test**

Run: `node test/unit-design.js`

Expected: `Passed: 9   Failed: 0`

- [ ] **Step 3: Wire it into `npm test`**

Open `package.json`. Find the `test` script (one long string ending with `&& node test/unit-worktree.js`). Append ` && node test/unit-design.js` before the closing quote.

The full new test script should end with:

```
... && node test/unit-installers.js && node test/unit-worktree.js && node test/unit-design.js"
```

- [ ] **Step 4: Verify the full suite runs the new file**

Run (PowerShell): `npm test 2>&1 | Select-String "unit-design|=== lib/paths"`

Expected: at least one matching line (the section heading or a passing assertion from unit-design.js).

- [ ] **Step 5: Commit**

```bash
git add test/unit-design.js package.json
git commit -m "cp(16-01): add test/unit-design.js + wire into npm test"
```

---

## Task 4: Extend scaffoldPhase to write DESIGN.md

**Files:**
- Modify: `lib/lifecycle.js` (function `scaffoldPhase`, around lines 555-588)

- [ ] **Step 1: Add a failing test**

Append BEFORE the cleanup block (the `for (const d of tracked)` loop) of `test/unit-design.js`:

```javascript
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node test/unit-design.js`

Expected: 9 passes from prior + `✗ DESIGN.md exists` and following assertions fail.

- [ ] **Step 3: Implement DESIGN.md write in `scaffoldPhase`**

Open `lib/lifecycle.js`. Find function `scaffoldPhase` (around line 429). Locate the `const actions = [ ... ]` block (around lines 571-574) that contains the roadmap and PLAN.md write actions.

Replace:

```javascript
  const actions = [
    { path: roadmapPath, before: roadmapBefore, after: roadmapAfter, kind: 'write' },
    { path: planPath, before: null, after: planRendered, kind: 'write' },
  ];
```

With:

```javascript
  // DESIGN.md (v0.7): persistent phase-tier design doc, populated by SP
  // brainstorming during /cp-plan-phase Step 3.5.
  const designPath = path.join(phaseDirPath, 'DESIGN.md');
  const designTemplate = paths.readTemplate('DESIGN.md');
  const designRendered = designTemplate
    .replace(/\{\{TIER_KEY\}\}/g, `phase: "${numStr}"`)
    .replace(/\{\{MILESTONE_NAME\}\}/g, activeName)
    .replace(/\{\{MILESTONE_SLUG\}\}/g, paths.milestoneSlug(activeName))
    .replace(/\{\{PHASE_NUM\}\}/g, numStr)
    .replace(/\{\{TITLE\}\}/g, `Phase ${numStr}: ${cleanName}`)
    .replace(/\{\{DATE\}\}/g, todayStr);

  const actions = [
    { path: roadmapPath, before: roadmapBefore, after: roadmapAfter, kind: 'write' },
    { path: planPath, before: null, after: planRendered, kind: 'write' },
    { path: designPath, before: null, after: designRendered, kind: 'write' },
  ];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/unit-design.js`

Expected: `Passed: 18   Failed: 0` (9 prior + 9 new).

- [ ] **Step 5: Full suite green**

Run: `npm test`

Expected: all 20 test files green.

- [ ] **Step 6: Commit**

```bash
git add lib/lifecycle.js test/unit-design.js
git commit -m "cp(16-01): scaffoldPhase emits DESIGN.md alongside PLAN.md"
```

---

## Task 5: Extend scaffoldMilestone to create milestones/<slug>/DESIGN.md

**Files:**
- Modify: `lib/lifecycle.js` (function `scaffoldMilestone`, around lines 359-410)

- [ ] **Step 1: Failing test**

Append to `test/unit-design.js` BEFORE the cleanup block:

```javascript
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node test/unit-design.js`

Expected: 18 prior pass + `✗ milestone DESIGN.md exists` and following fail.

- [ ] **Step 3: Implement milestone DESIGN.md write in `scaffoldMilestone`**

Open `lib/lifecycle.js`. Find function `scaffoldMilestone` (around line 359). Locate the closing block (around lines 405-409):

```javascript
  const actions = [{ path: roadmapPath, before, after, kind: 'write' }];
  if (!dryRun) {
    writeFile(roadmapPath, after);
  }
  return { ok: true, milestone: cleanName, status, actions, dryRun: dryRun || undefined };
}
```

Replace with:

```javascript
  // Milestone DESIGN.md (v0.7): persistent milestone-tier design doc.
  const todayStr = (options.today || new Date().toISOString().slice(0, 10));
  const mdSlug = paths.milestoneSlug(cleanName);
  const mdPath = paths.milestoneDesignFile(cleanName, root);
  const designTemplate = paths.readTemplate('DESIGN.md');
  const designRendered = designTemplate
    .replace(/\{\{TIER_KEY\}\}/g, `milestone_slug: "${mdSlug}"`)
    .replace(/\{\{MILESTONE_NAME\}\}/g, cleanName)
    .replace(/\{\{MILESTONE_SLUG\}\}/g, mdSlug)
    .replace(/\{\{PHASE_NUM\}\}/g, '')
    .replace(/\{\{TITLE\}\}/g, cleanName)
    .replace(/\{\{DATE\}\}/g, todayStr);

  const actions = [
    { path: roadmapPath, before, after, kind: 'write' },
    { path: mdPath, before: null, after: designRendered, kind: 'write' },
  ];
  if (!dryRun) {
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    for (const a of actions) writeFile(a.path, a.after);
  }
  return { ok: true, milestone: cleanName, status, actions, dryRun: dryRun || undefined };
}
```

- [ ] **Step 4: Run tests**

Run: `node test/unit-design.js`

Expected: `Passed: 25   Failed: 0` (18 prior + 7 new).

- [ ] **Step 5: Full suite green**

Run: `npm test`

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/lifecycle.js test/unit-design.js
git commit -m "cp(16-01): scaffoldMilestone creates milestones/<slug>/DESIGN.md"
```

---

## Task 6: Extend aggregateSummaries to surface phaseDesignRefs[]

**Files:**
- Modify: `lib/milestone.js` (function `aggregateSummaries`, around line 199; possibly `readSummaries` around line 161)

- [ ] **Step 1: Inspect the current `aggregateSummaries` shape**

Run: `node -e "const m=require('./lib/milestone'); const a=m.aggregateSummaries([]); console.log(JSON.stringify(a, null, 2));"`

Expected: an object — note the EXACT keys it returns (camelCase vs kebab-case, etc.) so the new field matches existing style.

- [ ] **Step 2: Confirm `readSummaries` exposes a phase path**

Run: `node -e "const s=require('fs').readFileSync('lib/milestone.js','utf8'); const fn=s.slice(s.indexOf('function readSummaries')); console.log(fn.slice(0, fn.indexOf('\\nfunction ')));"`

Note whether each summary object has a `phasePath`, `phaseDir`, `path`, or similar field. If none exposes the phase dir, edit `readSummaries` to add `phasePath: <dirOfThisSummary>` to each returned object.

- [ ] **Step 3: Add phaseDesignRefs gathering in `aggregateSummaries`**

Open `lib/milestone.js`. Find `function aggregateSummaries(summaries)` (around line 199). At the very end, BEFORE the `return` statement that builds the result object, add:

```javascript
  // v0.7: scan each summary's phase dir for a DESIGN.md and emit a ref
  // (deduped by phase since multiple plans share one DESIGN.md per phase).
  const path = require('path');
  const fs = require('fs');
  const _designSeen = new Set();
  const phaseDesignRefs = [];
  for (const s of summaries) {
    if (!s) continue;
    const phasePath = s.phasePath || s.phaseDir || s.path || null;
    if (!phasePath) continue;
    if (_designSeen.has(s.phase)) continue;
    const designPath = path.join(phasePath, 'DESIGN.md');
    if (fs.existsSync(designPath)) {
      _designSeen.add(s.phase);
      phaseDesignRefs.push({ phase: s.phase, path: designPath });
    }
  }
```

Add `phaseDesignRefs` to the returned object (as a sibling of the existing fields like `subsystems`, `tags`, etc.). Example:

```javascript
  return {
    subsystems,
    tags,
    // ... existing fields ...
    phaseDesignRefs,
  };
```

- [ ] **Step 4: Add a test for both populated and empty cases**

Append to `test/unit-design.js` BEFORE the cleanup block:

```javascript
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
```

- [ ] **Step 5: Run test**

Run: `node test/unit-design.js`

Expected: `Passed: 29   Failed: 0` (25 prior + 4 new).

If the test fails with `phaseDesignRefs key exists`: check that the loop in Step 3 looks up the correct field name (`s.phasePath` vs `s.phaseDir`). Update both the test fixture and the aggregator to use whatever `readSummaries` actually exposes.

- [ ] **Step 6: Full suite**

Run: `npm test`

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add lib/milestone.js test/unit-design.js
git commit -m "cp(16-01): aggregateSummaries surfaces phaseDesignRefs[]"
```

---

## Task 7: Promote MILESTONE-CONTEXT.md into milestone DESIGN.md at close

**Files:**
- Modify: `lib/milestone.js` — add `promoteMilestoneContext()` helper
- Modify: `lib/lifecycle.js` — call it from `completeMilestone()` around line 827

- [ ] **Step 1: Add the helper to `lib/milestone.js`**

Open `lib/milestone.js`. After the closing `}` of `aggregateSummaries` (around line 270, before `renderDigest`), add:

```javascript
/**
 * Promote .planning/MILESTONE-CONTEXT.md (transient) into the milestone-tier
 * DESIGN.md as a "Brainstorm transcript" appendix. Returns { action, path,
 * after, contextPath } or null if there's nothing to promote.
 *
 * Caller is responsible for writing `after` to `path` and deleting
 * `contextPath` (so cp can do both inside a writeBatch for atomicity).
 */
function promoteMilestoneContext(root, milestoneName, options = {}) {
  const fs = require('fs');
  const path = require('path');
  const paths = require('./paths');

  const contextPath = path.join(paths.planningDir(root), 'MILESTONE-CONTEXT.md');
  if (!fs.existsSync(contextPath)) return null;

  const body = fs.readFileSync(contextPath, 'utf8').trim();
  if (!body) return null;

  const designPath = paths.milestoneDesignFile(milestoneName, root);
  const exists = fs.existsSync(designPath);

  let after;
  if (exists) {
    const current = fs.readFileSync(designPath, 'utf8').replace(/\n+$/, '');
    after = `${current}\n\n## Brainstorm transcript\n\n${body}\n`;
  } else {
    after = [
      '---',
      `milestone_slug: "${paths.milestoneSlug(milestoneName)}"`,
      `milestone: ${milestoneName}`,
      'status: accepted',
      `created: ${options.today || new Date().toISOString().slice(0, 10)}`,
      '---',
      '',
      `# Design: ${milestoneName}`,
      '',
      '## Brainstorm transcript',
      '',
      body,
      '',
    ].join('\n');
  }

  return { action: exists ? 'appended' : 'created', path: designPath, after, contextPath };
}
```

- [ ] **Step 2: Export it**

In the `module.exports = { ... }` block at the bottom of `lib/milestone.js`, add `promoteMilestoneContext`.

- [ ] **Step 3: Wire into `completeMilestone`**

Open `lib/lifecycle.js`. Find `function completeMilestone` (around line 763). Find the comment `// 3. Delete MILESTONE-CONTEXT.md if present` (around line 827).

Find the lines that push a `delete` action for `milestoneContextPath`. Replace those lines with:

```javascript
  // 3. Promote MILESTONE-CONTEXT.md into the milestone DESIGN.md, then
  //    delete the transient file (v0.7 design-capture).
  const promotion = milestone.promoteMilestoneContext(root, milestoneName, { today });
  if (promotion) {
    actions.push({ path: promotion.path, before: null, after: promotion.after, kind: 'write' });
    actions.push({ path: promotion.contextPath, kind: 'delete' });
  } else if (fs.existsSync(milestoneContextPath)) {
    actions.push({ path: milestoneContextPath, kind: 'delete' });
  }
```

(Confirm `milestone` is already imported at the top of `lib/lifecycle.js` — search for `require('./milestone')`. It should be.)

- [ ] **Step 4: Test promotion**

Append to `test/unit-design.js` BEFORE the cleanup block:

```javascript
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
```

- [ ] **Step 5: Run test**

Run: `node test/unit-design.js`

Expected: `Passed: 38   Failed: 0` (29 prior + 9 new).

- [ ] **Step 6: Confirm dryrun-complete-milestone.js still works**

Run: `node test/dryrun-complete-milestone.js`

Expected: passes. If action-count assertions fail, update them to account for the new `write DESIGN.md` action that now appears alongside the existing `delete CONTEXT` action.

- [ ] **Step 7: Full suite green**

Run: `npm test`

- [ ] **Step 8: Commit**

```bash
git add lib/milestone.js lib/lifecycle.js test/unit-design.js
git commit -m "cp(16-01): promote MILESTONE-CONTEXT.md into milestone DESIGN at close"
```

---

## Task 8: Update cp-new-milestone and cp-plan-phase skill docs

**Files:**
- Modify: `.github/skills/cp-new-milestone/SKILL.md` (Step 3, around lines 53-65)
- Modify: `.github/skills/cp-plan-phase/SKILL.md` (insert Step 3.5 after current Step 3)

- [ ] **Step 1: Check whether commands/ has canonical copies**

Run: `Get-ChildItem commands\ -ErrorAction SilentlyContinue | Where-Object Name -Match 'cp-new-milestone|cp-plan-phase'`

If files exist in `commands/`, those are the canonical source — edit THEM and re-run `node bin/cp.js install copilot` to propagate to `.github/skills/`. If `commands/` has no copies, edit `.github/skills/...SKILL.md` directly (those edits are local since `.github/skills/` is gitignored, but they're still effective for this machine).

- [ ] **Step 2: Update cp-new-milestone Step 3**

Open `.github/skills/cp-new-milestone/SKILL.md`. Find `## Step 3 — Delegate brainstorming`. Replace its body (the paragraphs before `## Step 4 — Update PROJECT.md`) with:

```markdown
Invoke the provider's `brainstorm` skill (e.g. Superpowers' `brainstorming`),
passing the milestone name + the user's stated intent + a short summary of
the project context (Core Value, last 3 validated requirements).

Goal of the brainstorm: a clear, scoped specification for the milestone.

**v0.7 design-capture (TWO destinations):**
1. Save the FULL brainstorm transcript (verbatim Q&A) to
   `.planning/MILESTONE-CONTEXT.md`. This is the unedited working file.
2. Save the structured ADR summary (Status / Context / Decision /
   Consequences / Architecture / etc.) to
   `.planning/milestones/<slug>/DESIGN.md`. `cp scaffold-milestone`
   already created the empty template — SP brainstorming overwrites it
   with the populated version using its `path:` override parameter.

At `cp complete-milestone`, MILESTONE-CONTEXT.md is automatically
promoted into the milestone DESIGN.md as a "Brainstorm transcript"
appendix and the transient file is deleted.
```

- [ ] **Step 3: Insert Step 3.5 in cp-plan-phase**

Open `.github/skills/cp-plan-phase/SKILL.md`. Find `## Step 3 — Resolve the plan skill`. Immediately BEFORE `## Step 4 — Delegate to the plan skill`, insert:

```markdown
## Step 3.5 — Delegate to brainstorming for DESIGN.md (v0.7)

Before invoking the plan skill, invoke the provider's `brainstorm` skill
to fill in the phase-tier DESIGN.md.

- `cp scaffold-phase` already created an empty template at
  `.planning/phases/{phase-dir}/DESIGN.md`.
- Pass to the brainstorm skill:
  - The phase Goal, Success Criteria, and Requirements (from ROADMAP.md)
  - The milestone DESIGN.md at `.planning/milestones/<slug>/DESIGN.md` as
    context (so the phase design stays consistent with the milestone)
  - A `path:` override pointing to
    `.planning/phases/{phase-dir}/DESIGN.md` so SP writes there directly
    instead of `docs/superpowers/specs/...`
- Do NOT touch frontmatter keys cp populated (`phase`, `milestone`,
  `status`, `created`). SP fills in Status, Context, Decision,
  Consequences, Architecture, Components, Data Flow, Error Handling,
  Testing Strategy, Alternatives Considered, Open Questions, References.

If the brainstorm skill is unavailable (provider = manual), skip this
step — DESIGN.md stays empty and the user can fill it later.

The DESIGN.md becomes a context input to the plan skill in Step 4.

```

- [ ] **Step 4: Add DESIGN.md to Step 4's "Pass to the plan skill" list**

Still in `cp-plan-phase/SKILL.md`, find `## Step 4 — Delegate to the plan skill`. In the bullet list under "Pass to the plan skill:", add as the FIRST bullet:

```markdown
- The phase DESIGN.md at `.planning/phases/{phase-dir}/DESIGN.md` (v0.7)
  as the architectural source-of-truth; plan tasks should align with the
  Decision and Components sections.
```

- [ ] **Step 5: Sanity-check edits**

Run: `node -e "const fs=require('fs'); const f1=fs.readFileSync('.github/skills/cp-new-milestone/SKILL.md','utf8'); const f2=fs.readFileSync('.github/skills/cp-plan-phase/SKILL.md','utf8'); if (!f1.includes('MILESTONE-CONTEXT.md') || !f1.includes('milestones/<slug>/DESIGN.md')) { console.error('cp-new-milestone Step 3 missing'); process.exit(1); } if (!f2.includes('## Step 3.5') || !f2.includes('DESIGN.md')) { console.error('cp-plan-phase Step 3.5 missing'); process.exit(1); } console.log('OK');"`

Expected: `OK`

- [ ] **Step 6: Commit**

If you edited `.github/skills/...` directly (gitignored), no commit. If you edited `commands/cp-*.md`:

```bash
git add commands/cp-new-milestone.md commands/cp-plan-phase.md
git commit -m "cp(16-01): update cp-new-milestone Step 3 + add cp-plan-phase Step 3.5 for DESIGN.md"
```

---

## Task 9: Run coverage and confirm thresholds

- [ ] **Step 1: Run the coverage gate**

Run: `npm run coverage:ci`

Expected: tests all pass, c8 summary shows lines ≥85% and branches ≥75%. New `lib/paths.js` helpers and `lib/milestone.js` extensions are exercised by `test/unit-design.js`, so coverage should hold.

- [ ] **Step 2: If coverage drops, add targeted tests in unit-design.js to cover the missed branches; commit**

```bash
git add test/unit-design.js
git commit -m "cp(16-01): backfill coverage for promoteMilestoneContext edge cases"
```

---

## Task 10: Dogfood — backfill DESIGN.md for phase 16 and milestone v0.7

**Files:**
- Create: `.planning/phases/16-design-capture-infrastructure/DESIGN.md` (manually — scaffold-phase ran before this code existed)
- Create: `.planning/milestones/v0-7-design-capture/DESIGN.md` (likewise)

- [ ] **Step 1: Run scaffold-phase against a throwaway to confirm template renders**

Run: `node bin/cp.js scaffold-phase 99 --name "smoke test" --dry-run`

Expected: dryrun output lists THREE actions (ROADMAP edit, PLAN.md write, DESIGN.md write).

- [ ] **Step 2: Backfill the phase-16 DESIGN.md**

Run (PowerShell):

```powershell
node -e @"
const fs = require('fs');
const path = require('path');
const paths = require('./lib/paths');
const root = process.cwd();
const tpl = paths.readTemplate('DESIGN.md');
const rendered = tpl
  .replace(/\{\{TIER_KEY\}\}/g, 'phase: \"16\"')
  .replace(/\{\{MILESTONE_NAME\}\}/g, 'v0.7 Design Capture')
  .replace(/\{\{MILESTONE_SLUG\}\}/g, 'v0-7-design-capture')
  .replace(/\{\{PHASE_NUM\}\}/g, '16')
  .replace(/\{\{TITLE\}\}/g, 'Phase 16: design capture infrastructure')
  .replace(/\{\{DATE\}\}/g, new Date().toISOString().slice(0,10));
const out = path.join(root, '.planning', 'phases', '16-design-capture-infrastructure', 'DESIGN.md');
if (!fs.existsSync(out)) { fs.writeFileSync(out, rendered); console.log('wrote', out); } else { console.log('exists', out); }
"@
```

- [ ] **Step 3: Backfill the milestone v0.7 DESIGN.md**

Run (PowerShell):

```powershell
node -e @"
const fs = require('fs');
const paths = require('./lib/paths');
const tpl = paths.readTemplate('DESIGN.md');
const root = process.cwd();
const slug = paths.milestoneSlug('v0.7 Design Capture');
const rendered = tpl
  .replace(/\{\{TIER_KEY\}\}/g, 'milestone_slug: \"' + slug + '\"')
  .replace(/\{\{MILESTONE_NAME\}\}/g, 'v0.7 Design Capture')
  .replace(/\{\{MILESTONE_SLUG\}\}/g, slug)
  .replace(/\{\{PHASE_NUM\}\}/g, '')
  .replace(/\{\{TITLE\}\}/g, 'v0.7 Design Capture')
  .replace(/\{\{DATE\}\}/g, new Date().toISOString().slice(0,10));
const out = paths.milestoneDesignFile('v0.7 Design Capture', root);
fs.mkdirSync(require('path').dirname(out), { recursive: true });
if (!fs.existsSync(out)) { fs.writeFileSync(out, rendered); console.log('wrote', out); } else { console.log('exists', out); }
"@
```

- [ ] **Step 4: Backfill content from the spec**

Open `.planning/milestones/v0-7-design-capture/DESIGN.md`. Replace the empty template body (keep cp-managed frontmatter at the top) with the content from `docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md`.

- [ ] **Step 5: No commit — `.planning/` is gitignored in this repo**

Confirm via `git status .planning/` (expect empty output).

---

## Verification — End-of-plan checklist

- [ ] `npm test` — all 20 test files green
- [ ] `npm run coverage:ci` — lines ≥85%, branches ≥75%
- [ ] `node bin/cp.js scaffold-phase 99 --name "smoke" --dry-run` shows DESIGN.md in actions
- [ ] `node bin/cp.js scaffold-milestone "smoke milestone" --dry-run` shows milestone DESIGN.md in actions
- [ ] `node bin/cp.js complete-milestone --dry-run` (against a fixture with MILESTONE-CONTEXT.md) shows PROMOTE write + delete actions
- [ ] `templates/DESIGN.md` has Status, Context, Decision, Consequences, Architecture, Components, Data Flow, Error Handling, Testing Strategy, Alternatives Considered, Open Questions, References
- [ ] `lib/paths.js` exports `designFile`, `milestoneSlug`, `milestoneDir`, `milestoneDesignFile`
- [ ] `lib/milestone.js` exports `promoteMilestoneContext`; `aggregateSummaries(...)` includes `phaseDesignRefs`
- [ ] `.github/skills/cp-new-milestone/SKILL.md` Step 3 mentions both destinations
- [ ] `.github/skills/cp-plan-phase/SKILL.md` has new Step 3.5

After all boxes ticked → tick plan 16-01 via `cp tick 16-01 --no-commit`, write SUMMARY via `cp write-summary 16-01 --from <json>`, then proceed to plan 16-02 (REVIEW-LOG.md infrastructure).

</tasks>

<verification>
Before declaring plan complete:
- [ ] `npm test` — all 20 test files green (was 19; unit-design.js added)
- [ ] `npm run coverage:ci` — passes 85L/75B gate
- [ ] `node bin/cp.js scaffold-phase 99 --name smoke --dry-run` lists DESIGN.md
- [ ] `node bin/cp.js scaffold-milestone "smoke" --dry-run` lists milestone DESIGN.md
</verification>

<success_criteria>
- All tasks completed; per-task commits in git log
- All verification checks pass
- No errors or warnings introduced
- templates/DESIGN.md is the ADR + SP union from the spec
- lib/paths.js exports four new helpers; existing tests unchanged
- lib/lifecycle.scaffoldPhase + scaffoldMilestone emit DESIGN.md actions
- lib/milestone.aggregateSummaries surfaces phaseDesignRefs[]
- lib/lifecycle.completeMilestone promotes MILESTONE-CONTEXT.md before deleting it
- SUMMARY.md required key-decisions enforcement deferred to 16-03 (out of scope)
- REVIEW-LOG.md infrastructure deferred to 16-02 (out of scope)
</success_criteria>

<output>
After completion, create `.planning/phases/16-design-capture-infrastructure/16-01-SUMMARY.md` via `cp write-summary 16-01 --from <json>`.
</output>
