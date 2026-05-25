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
shim refactor over `/cp-workflow-run`. Design analysis at the end of
v1.1 found a deeper issue:

- `cp-autonomous` walks **milestone phases** in ROADMAP.md and loops
  `plan-phase → execute-phase → tick → write-summary` per pending
  plan. State lives in `STATE.md` + `.continue-here.md`.
- `cp-quick` runs **one-off ad-hoc tasks** through a hard-coded
  custom-tier flow. State lives in `.planning/quick/<dir>/`.
- `cp-workflow-run` (v1.1) executes **workflow template phases** from
  a YAML DAG. State lives in `.planning/runs/<slug>/`.

All three call their unit-of-work a "phase" but mean three different
things, persist state in three different shapes, and duplicate
substantial machinery (smart-gates, deviation handling,
`.continue-here.md` resume points). A v1.1-style shim could be
written, but it would either break back-compat or near-duplicate the
v1.0 workflow engine in shim code.

**Observation that broke the deadlock (user, mid-discussion):**
*"Generalize phases — make phases in milestone and phases in
workflow the same type, so we don't have to change `cp autonomous`."*

The right unification is at the **type / data shape** level, not at
the persistence level.

## Decision

Introduce a single `Phase` type used by both layers, then refactor
cp-autonomous and cp-quick into thin shims over `cp run`.

**Layered model:**

```
┌──────────────────────────────────────────────────────────┐
│  MILESTONE LAYER — owns overall plan, roadmap, state     │
│  ├─ ROADMAP.md   (which phases exist, what's in each)    │
│  ├─ STATE.md     (where we are right now)                │
│  └─ Phase[]      (id, depends_on, status, plans[],       │
│                   summary?, workflow-to-use)             │
└──────────────────────────┬───────────────────────────────┘
                           │ "execute this phase using workflow X"
                           ▼
┌──────────────────────────────────────────────────────────┐
│  WORKFLOW LAYER — knows nothing about roadmap or state   │
│  ├─ template.yaml      (DAG of execution steps)          │
│  ├─ Phase[]            (id, depends_on, role, status —   │
│  │                      same SHAPE as above,             │
│  │                      different SEMANTICS)             │
│  └─ runs/<slug>/       (transcript of one execution)     │
└──────────────────────────────────────────────────────────┘
```

**Principle (verbatim from user):** *"Milestone maintains overall
plan, roadmap and state. Workflow defines how each phase runs and
might generate its own phase's plan, but is not aware of roadmap
and state."*

**What gets unified:**
- The `Phase` **TYPE** (data shape: `id`, `depends_on`, `status`,
  `summary?`)
- Plan-status tracking conventions
- `runs/<slug>/` becomes the single transcript home

**What stays separate (by design):**
- Persistence — milestone uses ROADMAP.md + STATE.md; workflow uses
  YAML + runs/. Layers, not lumps.
- Plans — only the milestone layer has `plans[]` (the workflow may
  populate them, but doesn't own them).
- CLI surfaces — `cp autonomous`, `cp run`, `cp quick` argv contracts
  all stay frozen. Refactor is internal.

## Consequences

### Positive
- cp-autonomous and cp-quick collapse to <100 LOC each (thin
  delegators) once the unified runtime exists.
- One smart-gate implementation, one deviation handler, one
  `.continue-here.md` writer.
- Adding a new workflow (e.g. `debug`) automatically makes it
  available to milestone-driving without per-skill plumbing.
- ROADMAP.md gains an optional `workflow:` annotation per phase,
  enabling "phase 49 runs the `dev` workflow, phase 50 runs the
  `debug` workflow" granularity.

### Negative
- Behavioral parity testing burden — cp-autonomous and cp-quick
  have entrenched user expectations (scope handling, resume slugs,
  smart-gate triggers). Phase 51 and 52 each need explicit parity
  tests against pre-v1.2 behavior.
- One release of read-only back-compat for `.planning/quick/<dir>/`
  state directories. Removed in v1.3.

### Neutral
- The unified `Phase` interface stays JSDoc-typed (no TypeScript
  introduction) for codebase consistency.
- No changes to the YAML schema for workflow templates.

---

## Architecture

**Type shape (JSDoc, in `lib/types.js` — new file):**

```js
/**
 * @typedef {Object} Phase
 * @property {string} id              - e.g. "47" (milestone) or "brainstorm" (workflow)
 * @property {string[]} depends_on    - other phase ids in same DAG
 * @property {"pending"|"in-progress"|"complete"|"failed"} status
 * @property {Object} [meta]          - layer-specific extension
 *
 * Milestone-Phase extends with: plans[], workflow?, summary?, base-commit
 * Workflow-Phase extends with:  role, model?, persist_output?
 */
```

**Reader surface:**
- `lib/milestone.js#readPhases(roadmapMd)` → `Phase[]` (milestone-layer)
- `lib/workflow.js#readPhases(templateYaml)` → `Phase[]` (workflow-layer)

Both return shape-compatible `Phase` arrays.

## Components

| Component | Layer | Responsibility |
|---|---|---|
| `lib/types.js` | shared | The `Phase` typedef + base validators |
| `lib/milestone.js` (extends existing roadmap.js) | milestone | Parse ROADMAP.md → Phase[]; surface `workflow:` field |
| `lib/workflow.js` (existing) | workflow | Parse template YAML → Phase[]; existing wave/run machinery |
| `lib/runs.js` (existing) | workflow | Run transcripts under .planning/runs/ |
| `bin/commands/autonomous.js` | milestone | NOW: hand-rolled loop. AFTER: thin iterator that calls `cp run <wf> <phase-slug>` per pending phase |
| `bin/commands/quick.js` | workflow | NOW: hard-coded custom-tier flow. AFTER: thin alias for `cp run quick <task-slug>` |
| `commands/cp/cp-autonomous.md` | milestone | NOW: invokes `cp autonomous` + custom orchestration. AFTER: invokes `cp autonomous` (which now delegates to cp run) |
| `commands/cp/cp-quick.md` | workflow | Similar — surface unchanged, internals delegate |

## Data Flow

**Today (v1.1):**
```
/cp-autonomous → cp autonomous → loops { plan-phase, execute-phase, tick }
                                   ↓
                              .planning/STATE.md + .continue-here.md

/cp-quick → cp quick → custom-tier flow → .planning/quick/<dir>/

/cp-workflow-run → cp run → wave machine → .planning/runs/<slug>/
```

**Target (v1.2):**
```
/cp-autonomous → cp autonomous → for each pending phase:
                                   cp run <phase.workflow> "<milestone>-<phase>"
                                     ↓
                                .planning/runs/<slug>/  ←─┐
                                                          │
/cp-quick → cp quick → cp run quick "<task-slug>"  ──────┤
                                                          │
/cp-workflow-run → cp run ───────────────────────────────┘
                                     ↓
                              ONE transcript shape, ONE state machine
```

## Error Handling

- Smart-gate parity is the load-bearing contract. Phase 51 must
  prove that test-fail / audit-HIGH / executor-deviation all halt
  cp autonomous the same way they halt cp run today.
- Back-compat read for `.planning/quick/<dir>/` — if a user has a
  v1.1-era quick state dir, cp quick resume should still find it.
  Emit one deprecation warning per resume.
- Migration commit (phase 52) does NOT auto-rewrite user state
  dirs; it only adds the read alias. Users opt in to migration by
  doing a fresh `cp quick` after upgrading.

## Testing Strategy

| Suite | New assertions (target) |
|---|---|
| unit-types | ~20 (Phase typedef validators, shape parity) |
| unit-milestone-reader | ~30 (ROADMAP parsing with workflow: field) |
| integration-autonomous-parity | ~40 (smart-gate triggers, scope handling, deviation) |
| integration-quick-parity | ~30 (argv preservation, resume slug, transcript shape) |
| dryrun-quick-back-compat | ~15 (read from .planning/quick/ when .planning/runs/quick-* absent) |
| docs (CHANGELOG, MIGRATION-v1.2 link checks) | ~10 |

Total: ~145 new assertions.

## Alternatives Considered

### Option A — Pure shim (no unification)

Have cp-autonomous and cp-quick directly invoke cp run with hand-rolled
adapters for each state-layout difference.

**Pros:** Minimal core changes. No new types.
**Cons:** Two state layouts to maintain forever. Duplicate
smart-gate code paths. Defeats v1.1's "one execution engine" goal.

**Verdict:** rejected — the analysis at end-of-v1.1 found this would
need either back-compat breaks or near-duplication. User explicitly
opted for full unification.

### Option B — Generalize cp run with --mode=milestone

Add a flag to cp run telling it to walk ROADMAP phases instead of
template phases.

**Pros:** Single CLI entry point.
**Cons:** Bloats cp run's contract. Mixes layer concerns (cp run
should not need to know about ROADMAP). User-facing complexity grows.

**Verdict:** rejected — violates layering principle.

### Option C — New built-in `milestone-loop` workflow template

Write a YAML template whose phases are plan-phase / execute-phase /
tick, with a loop construct over ROADMAP.

**Pros:** Cleanest at the surface — "everything is a workflow."
**Cons:** Workflow engine doesn't support looping over external
state today. Would require an engine extension. Larger scope than
unification.

**Verdict:** rejected for v1.2 — could be revisited in v1.3+ if
ergonomic gains justify the engine work.

## Open Questions

- [ ] Should `workflow:` per phase default to project config
      (`workflow_for_milestone`) or always be explicit?
- [ ] When migrating .planning/quick/<dir>/ to .planning/runs/quick-<slug>/,
      should the migration be lazy-on-read or batch-on-`cp update`?
- [ ] Does cp autonomous --check (dry-run) flow through cp run --dry-run,
      or does it remain a milestone-layer concern?

## References

- v1.1 DESIGN.md — Phase 45 deferral notes
- bin/commands/autonomous.js — current loop implementation
- bin/commands/run.js — wave machine + smart-gate origin
- lib/workflow.js#computeWaves — DAG topological sort already in place
- v1.1 Phase 47 SUMMARY — cp workflow inspect rationale (wave visibility)

---
