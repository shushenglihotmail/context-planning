---
# Tier marker: cp scaffold substitutes one of:
#   phase: ""     (for phase-tier DESIGN.md)
#   milestone_slug: "v1-2-unified-phase-model"  (for milestone-tier DESIGN.md)
milestone_slug: "v1-2-unified-phase-model"
milestone: v1.2 Unified Phase Model
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
---

# Design: v1.2 Unified Phase Model

## Status

Accepted on 2026-05-25.

## Context

v1.1 (phases 43–48) closed the agent-skill gap by shipping 12
`cp-workflow-*` slash skills and 2 new CLI verbs (`cp workflow
export`, `cp workflow inspect`), bringing the v1.0 workflow engine to
full parity with the rest of cp's write-side surface.

**Deferred from v1.1 (was Phase 45):** the cp-quick + cp-autonomous
shim refactor over `/cp-workflow-run`. Mid-v1.2 design discussion
surfaced a deeper architectural mismatch:

- `cp-autonomous` walks **milestone phases** in ROADMAP.md, calling
  `cp-plan-phase` then `cp-execute-phase` per pending plan. State
  lives in `STATE.md` + `.continue-here.md`.
- `cp-quick` runs **one-off ad-hoc tasks** through a hard-coded
  custom-tier flow. State lives in `.planning/quick/<dir>/`.
- `cp-workflow-run` (v1.1) executes **workflow template phases** from
  a YAML DAG. State lives in `.planning/runs/<slug>/` (or
  `.planning/custom/<slug>/` for `binds_to: custom`).

Three "phase" notions, three persistence shapes, three smart-gate
implementations.

**Key user observations that shaped the design:**

1. *"Generalize phases — make phases in milestone and phases in
   workflow the same type."* (Drives the unified `Phase` typedef.)
2. *"Phase output should always be visible to agent. The persist
   property should mean if we want this phase's output summarized
   and persisted in CP plan doc."* (Redefines `persist_output` from
   informational flag to functional fold-into-DESIGN trigger.)
3. *"PLAN doc has no lasting value — what we want to persist is the
   design idea and how we plan to implement it."* (Eliminates the
   PLAN.md generation step entirely; DESIGN.md becomes the durable
   knowledge accumulator.)
4. *"In old way, agent could cut a feature into smaller features.
   Workflow design missed this. Let parent phase spawn child phases
   via dependency."* (Drives the two-level fan-out via `parent:`
   field — recovers the old NN-MM-PLAN decomposition pattern
   inside workflows.)

## Decision

Five surgical changes that together collapse the three-engine
problem into one:

### Decision 1 — Unified `Phase` type

Introduce a single `Phase` typedef (`lib/types.js`) used by both
milestone-layer readers and workflow-layer readers. Same data shape,
layer-specific extension via `meta`. (Already landed in 49-01.)

### Decision 2 — `DESIGN.md` + `STATE.md` at every tier

Both milestone and quick tiers get the same two files:

- **`DESIGN.md`** — durable accumulator. Initial content = the
  brief (milestone description or quick task description). Grows
  as workflow phases run with `persist: true` (see Decision 3).
- **`STATE.md`** — live operational pointer (same shape as today's
  project `STATE.md`, scoped to the tier).

Records continue to live where they do today — per-plan
`SUMMARY.md`, `REVIEW-LOG.md`, `MILESTONES.md` archive, git log.
No new record artifact is introduced.

### Decision 3 — `persist:` semantics (rename + redefine)

Rename `persist_output:` → `persist:` (shorter, clearer).
Default value: **`false`** (opt-in for DESIGN.md promotion).

| `persist:` | Phase output destination |
|---|---|
| `true` | Agent summarizes the phase's output into the **tier's `DESIGN.md`** under a section named after the phase id. Phase output is ALSO visible to the next phase's agent. |
| `false` (default) | Written verbatim to `<phase-dir>/<run-id>/<phase-id>.md`. Phase output is still visible to the next phase's agent. |

**Key rule:** `persist:` only governs durable promotion into the
canonical plan doc. Phase output is ALWAYS visible at runtime
regardless of the flag.

### Decision 4 — Drop `cp-plan-phase` (workflows own decomposition)

`cp-plan-phase` is removed. Workflows declare their own phases via
YAML and handle decomposition themselves through the two-level fan-out
machinery (Decision 5). The milestone-phase concept stays in
ROADMAP.md; what disappears is the manual `PLAN.md` generation step
that used to precede execution.

`cp-autonomous` no longer calls `cp-plan-phase` — it drives directly
into `cp run <workflow>` per pending milestone-phase.

### Decision 5 — Two-level phase structure with `parent:` field

Workflows can declare child phases via a `parent:` field. This
recovers the old NN-MM-PLAN dynamic decomposition pattern.

**Schema rules:**

| Field | Meaning |
|---|---|
| `parent:` | Empty/omitted → top-level phase. Set to a phase-id → child of that phase. |
| `after:` | At top level: refs to other top-level phases. At child level: refs to sibling children under the same parent. |
| `persist:` | true → fold into tier DESIGN.md. false (default) → standalone phase doc. |
| `max_children:` | On a parent phase only. Caps the structured list the agent may produce. Default: **20**. |
| `min_children:` | On a parent phase only. Floors the list length. Default: **1**. |

**Implicit rules:**

- Children automatically run after their parent completes (parent
  produces the structured list of items children iterate over).
- A top-level phase with `after: [X]` where X has children waits for
  X **and its entire subtree**.
- **1-level limit**: a phase listed as someone's `parent:` cannot
  itself have a `parent:`. No grandchildren.
- Runtime infers "parent must produce a structured list" because
  other phases declare `parent: <this-id>` — no explicit flag
  needed on the parent.
- Runtime tells the parent's agent: *"produce between
  `min_children` and `max_children` items"*; errors if the agent
  exceeds `max_children` or under-produces below `min_children`.

**Sibling pairing (pairwise fan-out):** Multiple children of the same
parent all expand over the same parent-produced list. `execute[i]`
pairs with `child-plan[i]` by index. A child phase `after:` declaring
a sibling resolves pairwise (sibling[i] waits for sibling[i]).

**What stays the same:**
- `binds_to:` template field (workflows can still scaffold a
  milestone). User explicitly kept this.
- Project-level `STATE.md`, `ROADMAP.md`, `MILESTONES.md`
- Per-plan `SUMMARY.md` and `REVIEW-LOG.md`
- ROADMAP phase structure (milestone-phases remain the high-level
  unit; workflows run within them)
- All CLI argv contracts (`cp autonomous`, `cp run`, `cp quick`)

**What gets removed:**
- `cp-plan-phase` skill (deprecated with migration alias)
- `PLAN.md` and `NN-MM-PLAN.md` generation pre-step
- `.planning/custom/` tier (collapsed into `.planning/quick/`;
  `binds_to: custom` aliased to quick for back-compat)
- `templates/quick-PLAN.md` (replaced by DESIGN.md + STATE.md pair)

## Consequences

### Positive
- Workflows become first-class: every milestone-phase and quick-task
  is just "DESIGN.md + STATE.md + workflow runs that fold into them."
- One state shape (DESIGN+STATE) at every tier; one persist rule;
  one fold-into-DESIGN.md mechanism.
- cp-autonomous and cp-quick collapse to <100 LOC each (thin
  delegators over `cp run`).
- The two-level fan-out (`parent:` field) recovers the dynamic
  decomposition pattern (old NN-MM-PLAN) inside workflows — without
  the manual cp-plan-phase step.
- DESIGN.md becomes a curated, accreted knowledge artifact instead
  of a one-shot brainstorm output.
- Adding a new workflow (e.g. `debug`) automatically works at every
  tier without per-skill plumbing.

### Negative
- Behavioral parity testing burden — cp-autonomous and cp-quick
  have entrenched user expectations (scope handling, resume slugs,
  smart-gate triggers).
- One release of read-only back-compat for `.planning/quick/<dir>/`
  AND `.planning/custom/<slug>/` state directories. Removed in v1.3.
- Workflow authors must learn the new `parent:`/`persist:`/`after:`
  schema; the v1.1 flat-DAG schema still works (back-compat) but new
  features assume the v1.2 shape.
- Existing workflow templates with `persist_output:` will continue
  to parse (alias to `persist:`) with a deprecation warning.

### Neutral
- The unified `Phase` interface stays JSDoc-typed (no TypeScript
  introduction) for codebase consistency.
- `binds_to:` stays — workflows can still scaffold milestones.

---

## Architecture

**Type shape (JSDoc, in `lib/types.js` — landed in 49-01):**

```js
/**
 * @typedef {Object} Phase
 * @property {string} id              - e.g. "47" (milestone) or "brainstorm" (workflow)
 * @property {string} [parent]        - workflow-only: parent phase id (1-level limit)
 * @property {string[]} [after]       - dependencies (siblings or top-level peers)
 * @property {boolean} [persist]      - workflow-only: fold into tier DESIGN.md when true (default false)
 * @property {"pending"|"in-progress"|"complete"|"failed"} status
 * @property {Object} [meta]          - layer-specific extension
 *
 * Milestone-Phase extends with: plans[], summary?, base-commit
 * Workflow-Phase extends with:  role, model?, parent?, persist?
 */
```

**Reader surface:**
- `lib/milestone.js#readPhases(roadmapMd)` → `Phase[]` (milestone-layer)
- `lib/workflow.js#readPhases(templateYaml)` → `Phase[]` (workflow-layer; resolves parent/after into a two-level DAG)

Both return shape-compatible `Phase` arrays.

## Example workflow (the full schema)

```yaml
name: dev
binds_to: milestone
phases:
  # ── Top level ──
  - id: brainstorm
    persist: true                  # → milestone DESIGN.md

  - id: plan
    after: [brainstorm]
    persist: false
    max_children: 5                # cap on items agent can produce
    min_children: 1                # require at least one
    # Runtime detects child-plan & execute below have parent:plan
    # → instructs agent to produce a structured list of items
    #   between min_children and max_children long

  - id: review
    after: [plan]                  # waits for plan + its whole subtree
    persist: true                  # → milestone DESIGN.md

  # ── Children of plan (1-level) ──
  - id: child-plan
    parent: plan
    persist: false

  - id: execute
    parent: plan
    after: [child-plan]            # pairwise: execute[i] waits for child-plan[i]
    persist: false
```

## Storage layout

```
.planning/
├── STATE.md                              ← project pointer (unchanged)
├── ROADMAP.md                            ← unchanged
├── MILESTONES.md                         ← unchanged
├── milestones/<slug>/
│   ├── DESIGN.md                         ← accretes (initial: milestone brief)
│   └── STATE.md                          ← milestone-level pointer (new at this tier)
├── quick/<slug>/                         ← unified (custom collapsed in)
│   ├── DESIGN.md                         ← replaces quick-PLAN.md
│   └── STATE.md                          ← quick-level pointer (new)
└── phases/<phase-dir>/
    ├── NN-MM-SUMMARY.md                  ← unchanged (per-plan record)
    ├── REVIEW-LOG.md                     ← unchanged
    └── <run-id>/                         ← one folder per workflow run
        ├── brainstorm.md                 ← persist:false top-level
        ├── plan.md                       ← contains list of sub-features
        ├── plan/                         ← folder named after parent phase id
        │   ├── child-plan/
        │   │   ├── 1-feature-a.md
        │   │   ├── 2-feature-b.md
        │   │   └── 3-feature-c.md
        │   └── execute/
        │       ├── 1-feature-a.md
        │       ├── 2-feature-b.md
        │       └── 3-feature-c.md
        └── review.md
```

## Components

| Component | Layer | Responsibility |
|---|---|---|
| `lib/types.js` ✅ | shared | The `Phase` typedef + base validators (49-01) |
| `lib/milestone.js` (new — 49-02) | milestone | `readPhases(roadmapMd)` + `scaffoldTierFiles(slug, brief)` for milestone-tier DESIGN.md + STATE.md |
| `lib/workflow.js` (extend — 49-03) | workflow | `phasesFromTemplate(template)` returning unified Phase[] with new fields |
| `lib/persist.js` (new — 49-04) | shared | `foldIntoDesign(designPath, phaseId, summary)` + `persist_output:` → `persist:` alias |
| `lib/fanout.js` (new — 50-02) | workflow | Expand child phases over parent's structured list; pairwise sibling dep resolver; subtree-wait semantics |
| `lib/runs.js` (existing) | workflow | Run transcripts under `.planning/phases/<phase-dir>/<run-id>/` |
| `bin/commands/autonomous.js` (refactor — 51-01) | milestone | NOW: hand-rolled loop. AFTER: thin iterator calling `cp run <wf>` per pending milestone-phase |
| `bin/commands/quick.js` (refactor — 51-02) | workflow | NOW: hard-coded custom flow + creates quick-PLAN.md. AFTER: scaffold quick/<slug>/{DESIGN.md, STATE.md} + delegate to `cp run` |
| `commands/cp/cp-plan-phase.md` (deprecate — 51-04) | meta | Becomes a one-line nudge to `cp run dev` (or configured workflow) |

## Data Flow

**Today (v1.1):**
```
/cp-autonomous → cp autonomous → loops { plan-phase, execute-phase, tick }
                                   ↓
                              .planning/STATE.md + .continue-here.md

/cp-quick → cp quick → custom-tier flow → .planning/quick/<dir>/

/cp-workflow-run → cp run → wave machine → .planning/runs/<slug>/
                                       or  .planning/custom/<slug>/  (binds_to: custom)
```

**Target (v1.2):**
```
/cp-autonomous → cp autonomous → for each pending milestone-phase:
                                   cp run <phase.workflow> "<milestone-phase>"
                                     ↓
                            milestone DESIGN.md (persist:true folds) +
                            <phase-dir>/<run-id>/ (persist:false phase docs +
                                                  parent/children subtree)

/cp-quick → cp quick → scaffold quick/<slug>/{DESIGN.md, STATE.md}
                       → cp run <wf> "<task-slug>"

/cp-workflow-run → cp run ─── unchanged at surface; runtime now handles
                              parent:/fan-out + persist: + max_children: semantics
```

## Validation Rules (locked)

1. `parent: X` → X must be an existing top-level phase id
2. `after:` at top level → must reference other top-level phases
3. `after:` at child level → must reference sibling children under same parent
4. A phase with `parent:` cannot also be referenced as someone else's `parent:` (1-level)
5. If a parent has any children, parent must produce a structured list output (runtime contract with agent)
6. All siblings under the same parent fan out over the same list (pairwise by index)
7. `persist:` is boolean; default false; alias from legacy `persist_output:` with deprecation warning
8. `max_children:` integer ≥ 1 (default 20); `min_children:` integer ≥ 1 (default 1); `max_children` ≥ `min_children`; both only valid on parent phases (i.e. phases referenced as someone else's `parent:`)

## Error Handling

- Smart-gate parity is the load-bearing contract. Phase 51 must
  prove that test-fail / audit-HIGH / executor-deviation all halt
  cp autonomous the same way they halt cp run today.
- Back-compat read for `.planning/quick/<dir>/` AND
  `.planning/custom/<slug>/` — both aliased to the unified
  `.planning/quick/<slug>/` tier for one release. Deprecation
  warning on access.
- Workflow templates using `persist_output:` continue to parse via
  alias to `persist:` for one release; warning printed.
- Agent over-produces children → runtime errors with
  `max_children exceeded ({actual} > {max})`; agent under-produces
  → `min_children not met ({actual} < {min})`. Both surface as
  smart-gate halts.
- Migration commits (phase 51) do NOT auto-rewrite user state
  dirs; only add read aliases. Users opt in to migration by doing
  a fresh `cp quick` or `cp run` after upgrading.

## Testing Strategy

| Suite | Phase | New assertions (target) |
|---|---|---|
| unit-types | 49-01 ✅ | 23 (delivered) |
| unit-milestone-reader | 49-02 | ~30 |
| unit-workflow (new-field extensions) | 49-03 | ~25 |
| unit-persist | 49-04 | ~20 |
| unit-fanout | 50-02 | ~25 (sibling pairing, subtree dep, max/min enforcement) |
| integration-dev-v2-template | 50-04 | ~25 (end-to-end fan-out run) |
| integration-autonomous-parity | 51-05 | ~25 (smart-gate triggers, scope handling) |
| integration-quick-parity | 51-05 | ~25 (argv preservation, resume slug, DESIGN+STATE) |
| dryrun-back-compat | 51-03 | ~15 (read from `.planning/quick/<dir>/` AND `.planning/custom/<slug>/`) |
| docs (CHANGELOG, MIGRATION-v1.2 link checks) | 52-02 | ~10 |

Total: ~223 new assertions (23 already landed).

## Alternatives Considered

### Option A — Pure shim (no unification)

Have cp-autonomous and cp-quick directly invoke cp run with hand-rolled
adapters for each state-layout difference. **Rejected** — would need
either back-compat breaks or near-duplication of v1.0 engine.

### Option B — Generalize cp run with --mode=milestone

Add a flag to cp run telling it to walk ROADMAP phases instead of
template phases. **Rejected** — bloats cp run's contract, mixes layer
concerns.

### Option C — Recursive workflow templates (child_template field)

Each child phase references another workflow YAML template, fan-out
expansion clones that workflow per item. **Rejected** mid-design —
user noted: *"that will increase complexity. Let's remove
child_template thing and limit fan out level at most 1."* Replaced
with inline `parent:` field + 1-level limit.

### Option D — Imperative child spawn from agent

Phase agent calls a `spawn_child_phase()` tool at will; runtime
queues children with no upfront declaration. **Rejected** — workflow
shape unknown until runtime; hard to reason about; defeats the
declarative-DAG model.

### Option E — Keep cp-plan-phase as the canonical decomposition step

Workflows would NOT decompose; cp-plan-phase stays. **Rejected** —
user observation: *"workflow itself already defines how many phases
and how to execute phases."* cp-plan-phase becomes redundant once
workflows can fan out.

## Open Questions

- [ ] Should the parent's structured-list output be JSON,
      front-matter array, or freeform list parsed by the agent? Lean
      toward: structured front-matter array at top of phase's output
      doc, with phase agent told this format in its prompt.
- [ ] Migration of `.planning/quick/<dir>/` → `.planning/quick/<slug>/`:
      lazy-on-read or batch-on-`cp update`? Lean toward lazy.
- [ ] Does cp autonomous --check (dry-run) flow through cp run --dry-run,
      or stays milestone-layer concern?
- [ ] When DESIGN.md grows large from many `persist: true` folds,
      should sections be collapsed/summarized? Defer to v1.3.

## References

- v1.1 DESIGN.md — Phase 45 deferral notes
- v1.2 design negotiation (this conversation, 2026-05-25)
- bin/commands/autonomous.js — current loop implementation
- bin/commands/run.js — wave machine + smart-gate origin
- lib/workflow.js#computeWaves — DAG topological sort already in place
- lib/runtime.js:302 — current (informational) `persist_output:` emission
- v1.1 Phase 47 SUMMARY — cp workflow inspect rationale (wave visibility)

---
