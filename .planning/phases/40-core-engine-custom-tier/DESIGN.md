---
phase: "40"
milestone: v1.0 Workflow Engine
status: proposed
created: 2026-05-25
updated: 2026-05-25
deciders: []
supersedes: []
superseded_by: null
---

# Design: Phase 40: Core engine + custom tier

## Status

Proposed.

## Context

This phase implements the three new `lib/` modules at the heart of the v1.0 Workflow Engine. All architectural decisions live in the milestone-tier DESIGN.md (`.planning/milestones/v1-0-workflow-engine/DESIGN.md`) — Sections "Architecture", "Components", "Data Flow", and "Error Handling". This phase-tier DESIGN.md is a **focused subset** that decomposes those components into three sequenced implementation units and locks the public-interface contract before any code is written.

The phase precedes the CLI surface (Phase 41) and ships purely as library code with unit/integration tests. No CLI entry points, no built-in templates, no end-user functionality yet — Phase 41 wires those on top.

## Decision

Implement three independent modules in `lib/`, each with focused responsibilities and a stable public interface:

| Plan | Module | Responsibility |
|---|---|---|
| 40-01 | `lib/workflow.js` | YAML parse, schema/DAG validation, wave computation, template resolution |
| 40-02 | `lib/runtime.js`  | Wave-walker, instruction emission, state transitions, milestone-tier hook |
| 40-03 | `lib/custom.js`   | Custom-tier state lifecycle in `.planning/custom/<slug>/` |

Each module is built test-first with ≥80% coverage (matching cp's existing threshold). Public interfaces match the milestone DESIGN.md verbatim — any deviation requires a milestone-DESIGN update first.

## Consequences

### Positive
- Three small, focused modules instead of one monolith — matches cp's existing `lib/` style (each file = one purpose).
- Stable public interface for Phase 41 to consume.
- Custom-tier (40-03) is independent of milestone-tier (40-02) → can be developed and tested in isolation.

### Negative
- Three test files to maintain instead of one consolidated suite.
- `lib/runtime.js` has the most surface area (milestone tier + wave walking + instruction emission); risk of becoming a 600+ LOC file. Mitigated by extracting instruction formatting into a small helper if needed.

### Neutral
- No CLI handler additions in this phase — end-to-end smoke tests defer to Phase 41.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│   Phase 40 scope (this phase)                           │
│                                                         │
│   lib/workflow.js  ──▶  lib/runtime.js                  │
│        │                     │                          │
│        │                     ├──▶ lib/lifecycle.js      │  (existing)
│        │                     │      (milestone-tier)    │
│        │                     │                          │
│        │                     └──▶ lib/custom.js         │
│        │                            (custom-tier)       │
│        ▼                                                │
│   yaml package (existing dep)                           │
└─────────────────────────────────────────────────────────┘
```

## Components

### `lib/workflow.js`

**Purpose:** Pure functions over a YAML template. No I/O beyond reading the file.

**Public interface:**
- `loadTemplate(nameOrPath) → {meta, principles, defaults, phases}`
- `validate(template) → {ok, warnings[], errors[]}`
- `computeWaves(template) → [[phase, …], …]`
- `resolveTemplate(name) → absolutePath` (`.planning/workflows/<name>.yaml` first, then `templates/workflows/<name>.yaml`)

**Validation rules:**
- Schema: `workflow` (string, required), `version` (int, required), `binds_to` (enum, optional, default `custom`), `defaults` (object, optional), `principles` (string list, optional), `phases` (list, required, ≥1).
- Each phase: `id` (string, required, unique), `depends_on` (string list, optional, default `[]`), `role`/`model`/`skill`/`prompt`/`persist_output` (all optional).
- DAG: no cycles, all `depends_on` references resolve to a phase id, topological-order warning if file order ≠ a valid topo sort.
- `principles`: non-empty strings; warn if count > 10.

**Wave computation:** standard Kahn's algorithm; each wave = the set of phases with zero remaining in-edges; emit and remove from the graph; repeat.

**Dependencies:** `yaml` (existing), `lib/paths.js` (existing).

### `lib/runtime.js`

**Purpose:** Stateful wave-walker. Owns "what wave is next" and "emit the instruction for it." Delegates state persistence to `lib/lifecycle.js` (milestone tier) or `lib/custom.js` (custom tier).

**Public interface:**
- `startRun(template, opts) → {slug, binding, firstInstruction}`
- `resumeRun(slug) → {currentWave, instruction}`
- `markPhaseComplete(slug, phaseId, summaryText)` — writes the canonical-path summary file, advances state
- `retryPhase(slug, phaseId)` — clears completed state for the phase, re-emits its wave's instruction
- `abandonRun(slug)` — marks the run abandoned; for milestone-bound runs, marks the milestone status accordingly

**Instruction format (per wave):**
```
Global directives (apply to every phase of this workflow):
  Project constraints:
    1. <line from PROJECT.md ## Constraints>
    2. ...
  Workflow principles:
    1. <line from template principles:>
    2. ...

Wave N of M — <count> phase(s) to execute:

[parallel] Dispatch the following N phases concurrently using your harness's
           Task tool (subagents, multiple CLI instances — your choice):

Phase: <id>
  role:  <free-form string>
  model: <high|middle|low|absent>
  skill: <skill name or absent>
  persist_output: <true|false>
  prompt: |
    <body from YAML>

(repeat for each phase in the wave)

When all phases in this wave are complete, run:
  cp run mark-complete <slug> <phase-id> < summary.md
```

**Binding resolution:**
- `milestone` → call `lifecycle.scaffoldMilestone()` (if not yet) + `scaffoldPhase()` per YAML phase; STATE.md updated normally; cp's phase NN-slug = YAML phase id slugified.
- `phase` → resolve current active phase from STATE.md; append a section to its PLAN.md (`## Workflow run: <workflow> (<slug>)`) and its SUMMARY.md on completion.
- `custom` → `custom.createRun()` + `custom.writePhaseSummary()`.

**Dependencies:** `lib/workflow.js`, `lib/lifecycle.js`, `lib/custom.js`, `lib/state.js`, `lib/paths.js`.

### `lib/custom.js`

**Purpose:** Manage the `.planning/custom/<slug>/` directory shape. Pure I/O over a known layout.

**Public interface:**
- `createRun(workflow, name) → slug` — date-prefixed slug, creates dir + STATE.yaml
- `listRuns() → [{slug, workflow, status, started, lastActivity, currentPhase}]` — scans `.planning/custom/*/STATE.yaml`
- `readState(slug) → object`
- `writeState(slug, patch)` — merges patch into STATE.yaml; updates `last_activity` automatically
- `writePhaseSummary(slug, phaseId, content)` — writes `<NN>-<phase-id>.md` (NN = topological order)
- `pruneAbandoned(daysOld) → [removed slugs]`
- `runDir(slug) → absolutePath`

**STATE.yaml shape** (canonical):
```yaml
workflow: debug
slug: 2026-05-24-auth-bug
status: in-progress     # in-progress | done | abandoned
binding: custom
started: 2026-05-24T15:30:00.000Z
last_activity: 2026-05-24T16:10:00.000Z
current_phase: plan
completed: [collect-symptoms, repro]
artifacts:
  collect-symptoms: 01-collect-symptoms.md
  repro: 02-repro.md
```

**Slug generation rule:** `YYYY-MM-DD-<slug-from-name>`. If `name` is absent: `YYYY-MM-DD-<workflow>-<HHMM>`. Collision suffix `-2`, `-3`, … on same-day repeat.

**Dependencies:** `yaml`, `fs`, `lib/paths.js`.

## Data Flow

See milestone DESIGN.md "Data Flow" section. This phase implements the library calls referenced there (`runtime.startRun`, `custom.createRun`, `workflow.loadTemplate`, etc.); CLI entry points come in Phase 41.

## Error Handling

Mirrors the milestone DESIGN.md "Error Handling" table. Phase 40 implements:
- All `validate()` error paths (YAML parse, schema, DAG cycle, dangling deps, non-string principles, principles >10 warning, topo-order warning, id collision)
- `runtime.startRun` refuses if slug already exists with status `in-progress` (prompts resume/abandon)
- `runtime.resumeRun` ENOENT → throws `RunNotFoundError` (CLI in Phase 41 catches and prints available slugs)
- `custom.writeState` uses atomic-write (`lib/lifecycle.js writeBatch` pattern) — no torn writes
- `custom.pruneAbandoned` is dry-run by default; takes `{apply: true}` to actually delete (matches cp safety conventions)

## Testing Strategy

| Test file | Target | Approx assertions |
|---|---|---|
| `test/unit-workflow.js` | `lib/workflow.js` — YAML parsing, schema validation, DAG cycle detection, wave computation, topo-order detection, principles validation, template resolution (project vs built-in) | ~80 |
| `test/unit-custom.js` | `lib/custom.js` — createRun (slug generation, collision), listRuns (scan + parse), readState/writeState round-trip + atomic write, writePhaseSummary path computation, pruneAbandoned dry-run vs apply | ~40 |
| `test/integration-runtime.js` | `lib/runtime.js` — startRun for all 3 binding tiers (using test fixture templates in `test/fixtures/workflows/`), instruction format snapshot, markPhaseComplete advances state, resumeRun continues from saved state, retryPhase clears state, abandonRun marks status | ~30 |
| `test/fixtures/workflows/*.yaml` | Test templates: `linear.yaml`, `parallel.yaml`, `cycle.yaml`, `dangling-dep.yaml`, `bad-yaml.yaml`, `missing-id.yaml`, plus mini `dev`/`debug`/`quick` fixtures | — |

**Coverage target:** ≥80% per file (matches cp's c8 threshold).
**Cross-platform:** all tests run on Ubuntu + Windows in CI (existing matrix).

## Alternatives Considered

### Option A — Single `lib/workflow-engine.js` monolith

**Pros:** Fewer files; everything in one place.
**Cons:** Violates cp's existing `lib/` convention (each file = one concern); harder to test in isolation; reviewers can't pull a 600+ LOC PR. **Verdict:** rejected.

### Option B — Implement runtime + custom tier in Phase 41 alongside CLI

**Pros:** Each phase produces user-visible output.
**Cons:** Phase 41 would balloon to 5–6 plans; review surface unmanageable. **Verdict:** rejected; phase split here is the right cleavage.

### Option C — `custom.js` writes JSON instead of YAML for STATE

**Pros:** No YAML round-trip risk for state.
**Cons:** Inconsistent with template format; awkward for hand-editing during recovery; cp templates are YAML so we already trust the lib. **Verdict:** rejected; YAML throughout.

## Open Questions

- [ ] Should `runtime.markPhaseComplete` accept the summary text via argument, stdin, or by reading a known canonical path that the agent wrote first? **Lean:** read from canonical path (matches how cp's existing `write-summary` flow works — agent writes the file, cp reads it).
- [ ] Should `lib/runtime.js` expose a `dryRun: true` option that returns the full wave plan + per-wave instruction strings without writing state? Useful for Phase 41's `cp run --plan-only`. **Lean:** yes; trivial to add and keeps Phase 41 thin.
- [ ] Naming: `lib/runtime.js` or `lib/wave-walker.js`? **Lean:** `runtime.js` — broader and matches typical workflow-engine terminology.

## References

- `.planning/milestones/v1-0-workflow-engine/DESIGN.md` — milestone-tier source of truth
- `.planning/MILESTONE-CONTEXT.md` — brainstorm transcript (Q11 captures `principles:` decision)
- `lib/lifecycle.js` — existing milestone scaffolding + atomic-write helpers (`writeBatch`)
- `lib/paths.js` — `planningDir()`, `repoRoot()`, `readTemplate()` helpers
- `lib/state.js` — existing STATE.md read/write for milestone-tier integration
- `templates/PLAN.md`, `templates/SUMMARY.md` — existing planning templates (analogues for custom-tier file shapes)
