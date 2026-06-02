---
task: v1.8.2 Bug G — wire runtime-fanout into milestone markPhaseComplete
slug: 2026-06-01-v1-8-2-bug-g-wire-runtime-fanout-into-milestone-markphasecom
status: ready
created: 2026-06-01
---

# DESIGN — v1.8.2 Bug G

## Problem

The milestone workflow's `materialize: roadmap-phases` directive is
structurally non-functional. The contract exists in
`lib/runtime-fanout.js` (`buildParentPrompt`, `parseParentOutput`)
but is never called from production code.

Concretely, in `lib/runtime.js`:

- `formatInstruction()` builds the per-wave instruction string but does
  not detect `phase.materialize === 'roadmap-phases'`, so the
  supervisor sees the bare YAML prompt with no structured-list
  JSON-block contract.
- `markPhaseComplete()` for milestone binding (lines 727–759) writes
  the supervisor's stdin into `SUMMARY.md`, marks the phase done, and
  advances the wave — but never parses the stdin for items, never
  scaffolds ROADMAP entries from those items, never injects child
  waves derived from `child-plan` / `child-execute` `parent:`
  templates.

Effect (reproduced 2026-06-01 attempting to start v1.9 via the
milestone workflow):
- ROADMAP.md grew phases 102–108 corresponding to the milestone
  workflow's own meta-phases (setup, brainstorm, etc.) instead of
  the supervisor's bugs A–F.
- Wave 5 (`propose-phases`) advanced straight to wave 6 (`review`)
  without dispatching any child fan-out.

## Approach

### Pieces

**P1 — Augment parent prompt at instruction-build time** (`lib/runtime.js`):
- In `formatInstruction()`, when emitting a phase entry, detect
  `phase.materialize === 'roadmap-phases'` AND `phase.parent == null`
  (i.e. it is a fan-out parent, not itself a child).
- Pass that phase through `runtime-fanout.buildParentPrompt(phase, basePrompt)`
  to inject the structured-list contract before printing.

**P2 — Consume parent output at mark-complete time** (`lib/runtime.js`,
`markPhaseComplete` milestone branch):
- After writing `SUMMARY.md` but before advancing the wave, detect
  `currentPhase.materialize === 'roadmap-phases'`.
- Call `runtime-fanout.parseParentOutput(summaryText)` → throws
  WorkflowError if no fenced JSON block or invalid shape.
- Call `runtime-fanout.enforceChildCount(currentPhase, parsed)`.
- For each `item` in `parsed.items`:
  - Compute a phase number (`nextPhaseNum(projectDir)` then increment).
  - Call `lifecycle.scaffoldPhase(projectDir, n, { name: item.id, force: false, milestone: state.milestoneName })`.
  - Write `item.title` and `item.summary` into the phase's `PLAN.md`
    (or a fresh per-phase DESIGN-like file — TBD with user).
  - Track `materializedItems` in run state so subsequent waves can
    address them.
- Locate `child-plan` and `child-execute` phase templates in
  `tpl.phases` (those with `parent: <currentPhase.id>`). For each
  item × each child template, synthesize a child phase instance with
  the item bound as the runtime `item` value and inject into the
  waves data structure. The runtime already supports parent: but
  has no production loader; this is where we add it.

**P3 — Suppress workflow-meta phases from ROADMAP scaffold**
(`lib/runtime.js:beginRun`, milestone binding, lines 511–530):
- Currently the milestone-binding `beginRun` scaffolds **every**
  top-level workflow phase as a ROADMAP entry (that's where 102–108
  came from). Workflow plumbing phases should not be ROADMAP entries.
- Change scaffold loop to skip phases with `kind: scaffold` AND skip
  phases with `materialize: roadmap-phases` (the parent itself is
  metadata; the children produced via P2 are the real ROADMAP entries).
- Keep the run-state record so wave advancement still works.

**P4 — Tests**:
- Extend `test/integration-runtime.js` (or add
  `test/integration-fanout-milestone-v18.js`) with a fixture
  workflow that has a single `materialize: roadmap-phases` parent +
  one `parent: <parent-id>` child. Drive a full milestone-bound run
  end-to-end: `cp run <workflow>` → mark-complete each wave with a
  synthetic structured-list JSON-block → assert (a) ROADMAP gains
  the right number of phases with the right ids, (b) workflow-meta
  phases do **not** appear in ROADMAP, (c) child waves get dispatched
  with one phase per item, (d) cp doctor / cp audit see zero new
  findings.

**P5 — Release**:
- Bump `package.json` 1.8.1 → 1.8.2.
- CHANGELOG entry under `[1.8.2]`.
- Commit pattern: one atomic commit per piece (P1–P5), `fix(runtime):`
  prefix.

### Out of scope (preserved for v1.9 milestone)
- The original A–F bug list (roadmap scanner, write-summary
  frontmatter-only, complete-milestone STATE regen, doctor
  fix-dual-plan, sham-review-log rule, skill-load attestation).
  Those resume on `cp run milestone` once Bug G ships.

## Done-When

- [ ] `lib/runtime-fanout.js`'s `buildParentPrompt` and
      `parseParentOutput` are imported and called from `lib/runtime.js`
      (grep finds production callers, not only tests).
- [ ] A fresh `cp run milestone "..."` end-to-end run produces:
  - DESIGN.md, MILESTONE-CONTEXT.md, PROJECT.md update as before
    (waves 1–4 unchanged).
  - Wave 5 (`propose-phases`) prompt visibly includes the structured-list
    JSON contract from `buildParentPrompt`.
  - On `mark-complete propose-phases < items.json`, ROADMAP.md gains
    one numbered phase per item in `items.items[]`, each with the item's
    `title` and `summary`; the workflow's plumbing phases (setup,
    brainstorm, propose-*, review, finalize) do **NOT** appear as
    ROADMAP entries.
  - Subsequent wave(s) dispatch one child wave per item using the
    `child-plan` / `child-execute` templates.
- [ ] `npm test` green on Ubuntu + Windows × Node 20 + 22.
- [ ] `package.json` shows version 1.8.2, CHANGELOG has `[1.8.2]`
      entry, single annotated tag `v1.8.2` on the release commit.
- [ ] `cp doctor` and `cp audit` against this repo show zero new
      findings introduced by the change (pre-existing LOW drift OK).

## Open questions

- ~~Should P2 write `item.title` / `item.summary` into the new phase's
  `PLAN.md`, into a fresh `DESIGN.md`, or both?~~ **Resolved 2026-06-01:
  PLAN.md only — matches `child-plan` template's output target.**
- ~~Should P3 also retroactively rewrite ROADMAP when an existing
  v1.8.x project's run is resumed against the new code?~~ **Resolved
  2026-06-01: new runs only; no migration.**
