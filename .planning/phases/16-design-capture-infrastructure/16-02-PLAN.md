---
phase: 16-design-capture-infrastructure
plan: "02"
type: execute
wave: 2
depends_on: ["16-01"]
files_modified:
  - templates/REVIEW-LOG.md
  - lib/paths.js
  - lib/lifecycle.js
  - lib/milestone.js
  - test/unit-design.js
  - commands/cp/execute-phase.md
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "scaffold-phase emits REVIEW-LOG.md alongside PLAN.md and DESIGN.md"
    - "aggregateSummaries surfaces reviewLogRefs[] and reviewCount"
    - "cp-execute-phase skill instructs orchestrator to append review entries"
  artifacts:
    - "templates/REVIEW-LOG.md exists with append-friendly schema"
    - "test/unit-design.js extended with review-log assertions; passes"
    - "npm test all green"
  key_links:
    - "docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md"
---

<objective>
Plan 16-02: REVIEW-LOG.md Infrastructure (Phase 16, milestone v0.7 Design Capture).

Purpose: Persist the SP subagent-driven-development review chain (rejection
history, code-quality feedback that drove the final implementation) per
phase. Append-only `.planning/phases/NN-slug/REVIEW-LOG.md`. The
cp-execute-phase skill INSTRUCTS the SP orchestrator to append entries
(skill-level instruction, not code — no upstream SP changes).
</objective>

<execution_context>
@.planning/config.json
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md
@.planning/phases/16-design-capture-infrastructure/DESIGN.md
</context>

<tasks>

# Implementation Plan — Bite-Sized Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `templates/REVIEW-LOG.md` | Create | Append-only template (header + empty entries section) |
| `lib/paths.js` | Modify | Add `reviewLogFile(phase, root)` helper + export |
| `lib/lifecycle.js` | Modify | Extend `scaffoldPhase` to emit REVIEW-LOG.md as 4th action |
| `lib/milestone.js` | Modify | Extend `aggregateSummaries` with `reviewLogRefs[]` and `reviewCount` (entry tally) |
| `test/unit-design.js` | Modify | Append 4 new test sections (template, helper, scaffold, aggregator) |
| `commands/cp/execute-phase.md` | Modify | Insert new "Step 4.5 — Append to REVIEW-LOG.md" between review and commit steps |

---

## Task 1: Create templates/REVIEW-LOG.md

**Files:**
- Create: `templates/REVIEW-LOG.md`

- [ ] **Step 1: Write the template file**

```markdown
---
phase: "{{PHASE_NUM}}"
milestone: {{MILESTONE_NAME}}
created: {{DATE}}
schema_version: 1
---

# Review Log: Phase {{PHASE_NUM}} — {{TITLE}}

Append-only log of subagent review cycles during execution. Each entry is
written by the cp-execute-phase orchestrator after a review round
(spec-compliance or code-quality). The cp aggregator counts entries when
rolling up the milestone summary.

## How to append

The orchestrator (cp-execute-phase Step 4.5) appends a block per review:

```
## YYYY-MM-DD HH:MM — Plan NN-MM Task N — <reviewer-role>

**Verdict:** approved | rejected | needs-revision

**Findings:**

- <finding>

**Resolution:**

<what changed; commit SHA if applied>

---
```

## Entries

<!-- orchestrator appends below this marker; do not delete the marker -->
<!-- REVIEW-LOG-ENTRIES-BELOW -->
```

- [ ] **Step 2: Verify**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('templates/REVIEW-LOG.md','utf8');if(!t.includes('{{PHASE_NUM}}')||!t.includes('REVIEW-LOG-ENTRIES-BELOW')){console.error('missing markers');process.exit(1);}console.log('OK');"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add templates/REVIEW-LOG.md
git commit -m "cp(16-02): add templates/REVIEW-LOG.md (append-only review log)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Add reviewLogFile helper in lib/paths.js

**Files:**
- Modify: `lib/paths.js`

- [ ] **Step 1: Add the helper after `designFile`**

```javascript
/** Full path to a phase REVIEW-LOG.md file. Returns null if no phase dir. */
function reviewLogFile(phaseNumOrSlug, root = repoRoot()) {
  const dir = findPhaseDir(phaseNumOrSlug, root);
  if (!dir) return null;
  return path.join(dir, 'REVIEW-LOG.md');
}
```

- [ ] **Step 2: Add `reviewLogFile` to `module.exports`** (after `designFile`).

- [ ] **Step 3: Smoke**

Run: `node -e "const p=require('./lib/paths');console.log(typeof p.reviewLogFile);"`

Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add lib/paths.js
git commit -m "cp(16-02): add reviewLogFile helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Extend scaffoldPhase to write REVIEW-LOG.md

**Files:**
- Modify: `lib/lifecycle.js` (function `scaffoldPhase`)
- Modify: `test/unit-design.js` (append test section)

- [ ] **Step 1: Failing test** — append to `test/unit-design.js` before cleanup loop:

```javascript
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
```

- [ ] **Step 2: Run** — `node test/unit-design.js` — expect new section to fail.

- [ ] **Step 3: Implement** — In `lib/lifecycle.js` `scaffoldPhase`, after the DESIGN.md render block (added in 16-01), add a parallel REVIEW-LOG.md render and push a 4th action:

```javascript
const reviewLogPath = path.join(phaseDirPath, 'REVIEW-LOG.md');
const reviewTemplate = paths.readTemplate('REVIEW-LOG.md');
const reviewRendered = reviewTemplate
  .replace(/\{\{PHASE_NUM\}\}/g, numStr)
  .replace(/\{\{MILESTONE_NAME\}\}/g, activeName)
  .replace(/\{\{TITLE\}\}/g, cleanName)
  .replace(/\{\{DATE\}\}/g, todayStr);
```

Then add a 4th action entry to the `actions` array:
```javascript
{ path: reviewLogPath, before: null, after: reviewRendered, kind: 'write' },
```

Adapt variable names (`numStr`, `activeName`, `cleanName`, `todayStr`) to whatever scaffoldPhase already uses locally.

- [ ] **Step 4: Run test** — `node test/unit-design.js` — expect all pass (44+ assertions).

- [ ] **Step 5: Full suite** — `npm test` — all 20 files `Failed: 0`. If `test/unit-lifecycle.js` asserts a specific action count (currently 3), update it to 4.

- [ ] **Step 6: Commit**

```bash
git add lib/lifecycle.js test/unit-design.js test/unit-lifecycle.js
git commit -m "cp(16-02): scaffoldPhase emits REVIEW-LOG.md (4th action)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Aggregator surfaces reviewLogRefs[] and reviewCount

**Files:**
- Modify: `lib/milestone.js` (function `aggregateSummaries`)
- Modify: `test/unit-design.js`

- [ ] **Step 1: Failing test** — append to `test/unit-design.js`:

```javascript
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
```

- [ ] **Step 2: Run** — `node test/unit-design.js` — expect fail.

- [ ] **Step 3: Implement** — In `lib/milestone.js` `aggregateSummaries`, after the existing `phaseDesignRefs` loop (added in 16-01), add:

```javascript
const _reviewSeen = new Set();
const reviewLogRefs = [];
let reviewCount = 0;
for (const s of summaries) {
  if (!s) continue;
  const phasePath = s.phasePath || s.phaseDir || s.path || null;
  if (!phasePath) continue;
  if (_reviewSeen.has(s.phase)) continue;
  const rlPath = path.join(phasePath, 'REVIEW-LOG.md');
  if (fs.existsSync(rlPath)) {
    _reviewSeen.add(s.phase);
    reviewLogRefs.push({ phase: s.phase, path: rlPath });
    const body = fs.readFileSync(rlPath, 'utf8');
    const matches = body.match(/^##\s+\d{4}-\d{2}-\d{2}/gm);
    reviewCount += matches ? matches.length : 0;
  }
}
```

Add `reviewLogRefs` and `reviewCount` to the return object.

- [ ] **Step 4: Test** — `node test/unit-design.js` — expect all pass.

- [ ] **Step 5: Full suite** — `npm test` — all green.

- [ ] **Step 6: Commit**

```bash
git add lib/milestone.js test/unit-design.js
git commit -m "cp(16-02): aggregateSummaries surfaces reviewLogRefs[] and reviewCount

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Update cp-execute-phase skill with Step 4.5

**Files:**
- Modify: `commands/cp/execute-phase.md`

- [ ] **Step 1: Read the current skill** — find the steps that delegate to SP and the step that commits/closes. Identify where the orchestrator returns from a SP review cycle.

- [ ] **Step 2: Insert a new "Step 4.5 — Append to REVIEW-LOG.md" block** between the review step and the next step. Content:

```markdown
## Step 4.5 — Append to REVIEW-LOG.md (v0.7)

After EACH review cycle returned by SP `subagent-driven-development`
(spec-compliance OR code-quality), append one block to
`.planning/phases/{phase-dir}/REVIEW-LOG.md` BEFORE the
`<!-- REVIEW-LOG-ENTRIES-BELOW -->` marker is irrelevant — APPEND after
the marker:

```
## {{DATE}} {{TIME}} — Plan {{PLAN-ID}} Task {{TASK-N}} — {{REVIEWER-ROLE}}

**Verdict:** {approved | rejected | needs-revision}

**Findings:**

- {bullet list of substantive findings}

**Resolution:**

{what changed; commit SHA if applied; "N/A — accepted on first pass" allowed}

---
```

Skip empty findings on clean approvals (use "Resolution: approved on
first pass" and omit findings bullet list).

If the file does not exist (older milestones), create it from
`templates/REVIEW-LOG.md` with substituted frontmatter first.

The cp aggregator counts these entries (via `aggregateSummaries`
`reviewCount`) when rolling up the milestone summary.
```

Place this BEFORE the existing commit/close step.

- [ ] **Step 3: Sanity-check** — `node -e "const f=require('fs').readFileSync('commands/cp/execute-phase.md','utf8');if(!f.includes('## Step 4.5')||!f.includes('REVIEW-LOG.md')){console.error('missing');process.exit(1);}console.log('OK');"` — expect `OK`.

- [ ] **Step 4: Sync to .github/skills/** — Run `node bin/cp.js install copilot --force` (or manually copy `commands/cp/execute-phase.md` into `.github/skills/cp-execute-phase/SKILL.md` if install refuses).

- [ ] **Step 5: Commit**

```bash
git add commands/cp/execute-phase.md
git commit -m "cp(16-02): add cp-execute-phase Step 4.5 — append to REVIEW-LOG.md

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Coverage gate + final verification

- [ ] **Step 1:** `npm run coverage:ci` — exit 0; lines ≥85, branches ≥75.

- [ ] **Step 2:** `node bin/cp.js scaffold-phase 99 --name smoke --dry-run` — output lists 4 actions (ROADMAP, PLAN, DESIGN, REVIEW-LOG).

- [ ] **Step 3:** Dogfood backfill — for phase 16, create REVIEW-LOG.md from template (note: append-only, will be empty until orchestrator records reviews going forward).

Add to `scripts/backfill-v07-design.js` (or new `scripts/backfill-v07-review-log.js`):

```javascript
const reviewPath = path.join(root, '.planning', 'phases', '16-design-capture-infrastructure', 'REVIEW-LOG.md');
const tplR = paths.readTemplate('REVIEW-LOG.md');
const rendered = tplR
  .replace(/\{\{PHASE_NUM\}\}/g, '16')
  .replace(/\{\{MILESTONE_NAME\}\}/g, 'v0.7 Design Capture')
  .replace(/\{\{TITLE\}\}/g, 'design capture infrastructure')
  .replace(/\{\{DATE\}\}/g, today);
if (!fs.existsSync(reviewPath)) fs.writeFileSync(reviewPath, rendered);
```

Run and verify file appears under `.planning/phases/16-.../REVIEW-LOG.md`.

</tasks>

<verification>
- [ ] `npm test` — all 20 files `Failed: 0`
- [ ] `npm run coverage:ci` — ≥85L / ≥75B
- [ ] `node bin/cp.js scaffold-phase --dry-run` shows REVIEW-LOG.md in 4 actions
- [ ] `commands/cp/execute-phase.md` contains "## Step 4.5"
</verification>

<success_criteria>
- templates/REVIEW-LOG.md exists with append-friendly schema and marker
- lib/paths exports reviewLogFile
- scaffoldPhase emits 4th action (REVIEW-LOG.md write)
- aggregateSummaries returns reviewLogRefs[] (deduped) and reviewCount (entry tally)
- cp-execute-phase skill has Step 4.5 instructing orchestrator to append
- Plan 16-03 unblocked (writeSummary validation is the last piece for v0.7)
</success_criteria>

<output>
After completion: `cp write-summary 16-02 --from <json>` → `.planning/phases/16-design-capture-infrastructure/16-02-SUMMARY.md`.
</output>
