# Migrating to context-planning v1.2

> **New in v1.2.0** — see [CHANGELOG.md](CHANGELOG.md) for a terse bullet summary.

## What's New

v1.2.0 unifies the way **every** phase — built-in `dev`, lightweight
`quick`, custom workflows — is described, persisted, and executed. The old
mental model "regular phases use PLAN.md + SUMMARY.md, custom-tier runs use
STATE.yaml" goes away. Every phase now has a **DESIGN.md** (intent,
contract) and a **STATE.md** (current status, history). The `persist`
primitive folds runtime output into DESIGN.md atomically. Fan-out (one
parent phase expanding into N children at runtime) is now a first-class
runtime feature, with explicit `parent:` / `after:` / `max_children:`
schema and a `depends_on` field on each child to express inter-child
ordering.

This release also:

- **Renames `persist_output:` → `persist:`** in workflow YAML
  (one-release alias retained).
- **Collapses `.planning/custom/` into `.planning/quick/`** (one-release
  read-side back-compat retained).
- **Deprecates `/cp-plan-phase`** in favor of `/cp-autonomous`'s
  per-phase delegation.
- **Rewrites `/cp-quick`** to scaffold DESIGN.md + STATE.md instead of
  a heavyweight PLAN.md.

Everything is **forward-compatible by default**: v1.1 workflows, custom
runs, and PLAN.md-shaped phases keep working without edits. The migration
steps below are about retiring the deprecation aliases on your schedule.

## Breaking Changes

None at runtime. v1.2 ships with one-release deprecation aliases for every
schema rename so v1.1 inputs continue to load.

The following will be **removed in v1.3**:

| Removed in v1.3                  | Use instead                                |
|----------------------------------|--------------------------------------------|
| `persist_output:` workflow key   | `persist:`                                 |
| `.planning/custom/` storage path | `.planning/quick/`                         |
| `binds_to: custom` in templates  | `binds_to: quick`                          |
| `/cp-plan-phase` skill           | `/cp-autonomous` (delegates per-phase)     |
| `quick-PLAN.md` template         | `quick-DESIGN.md` + `quick-STATE.md`       |

## Schema Changes

### Workflow YAML

#### `persist_output:` → `persist:`

Old (v1.1):

```yaml
phases:
  - id: plan
    role: planner
    persist_output: true
```

New (v1.2):

```yaml
phases:
  - id: plan
    role: planner
    persist: true
```

`persist: true` declares that the phase's agent output should be folded
into the phase's `DESIGN.md` atomically (tmp + rename). The legacy key
still parses; loaders log a one-line deprecation warning. Both keys
together — `persist` wins, `persist_output` is ignored silently.

#### New: `parent:`, `after:`, `max_children:`

These describe **fan-out** — a parent phase that expands at runtime into
N children, where N is decided by the parent's agent (not the template
author).

```yaml
phases:
  - id: plan
    role: planner
    persist: true

  - id: child-plan
    role: planner
    parent: plan          # fans out under "plan"
    persist: true

  - id: child-execute
    role: executor
    parent: plan
    after: child-plan     # this child waits for child-plan in the same fan-out unit
    max_children: 10      # safety cap — runtime refuses >10 children per parent
```

When the parent's agent returns a structured object
(`{ optimizable, items: [{ name, depends_on }, …] }`), the runtime
materializes one child instance per list item. By default
(`optimizable: false` or missing), children run in array order
(item 0 → item 1 → … → item N) and any per-item `depends_on` is ignored.
When the agent sets `optimizable: true`, the runtime computes a topological
order over `depends_on` edges and parallelizes safe waves. See the
"Inter-child dependencies" section below for the full table.

See the new "Fan-out" section of [README.md](README.md) for the full
contract.

#### `binds_to: custom` → `binds_to: quick`

Old (v1.1):

```yaml
meta:
  binds_to: custom
```

New (v1.2):

```yaml
meta:
  binds_to: quick
```

The legacy value silently normalizes at template-load. `cp workflow
validate` accepts both. Templates `quick.yaml` and `debug.yaml` ship with
the new value.

### Phase storage shape

v1.1 phases looked like:

```
.planning/phases/01-foo/
  PLAN.md            # frontmatter status + plans + verify steps
  01-01-PLAN.md
  01-01-SUMMARY.md
```

v1.2 unifies them under DESIGN + STATE:

```
.planning/phases/01-foo/
  DESIGN.md          # goal, approach, contract, persisted output
  STATE.md           # current-status, last-activity, history
  PLAN.md            # (still present — backward compatible)
  01-01-SUMMARY.md   # (unchanged)
```

`DESIGN.md` and `STATE.md` are populated by `cp scaffoldTierFiles` (called
from `cp run start`, the new-phase path of `cp-quick`, and the runtime
expansion of fan-out children). PLAN.md is still produced by
`cp-autonomous` and read by every tool — **no PLAN.md was deleted in v1.2**.

### `.planning/custom/` → `.planning/quick/`

Old (v1.1):

```
.planning/custom/
  2025-12-01-debug-thing/
    STATE.yaml
    SUMMARY.md
```

New (v1.2):

```
.planning/quick/
  2025-12-01-debug-thing/
    STATE.yaml
    SUMMARY.md
```

Existing legacy slugs under `.planning/custom/` keep working:

- `cp run resume <slug>` finds them transparently.
- `cp run list` aggregates both roots.
- Writes to a legacy slug stay in legacy (no surprise migration).
- New runs are created under `.planning/quick/` only.

A one-time deprecation warning prints per process when the legacy root is
detected. To migrate at your own pace:

```bash
mkdir -p .planning/quick
git mv .planning/custom/* .planning/quick/
git commit -m "chore: migrate .planning/custom → .planning/quick"
```

## CLI Changes

### `/cp-quick` rewrite

Old (v1.1): scaffolded `quick-PLAN.md` (~200 lines, plan/tasks/verify
sections) and ran the heavyweight plan skill.

New (v1.2): scaffolds `quick-DESIGN.md` (goal / approach / done-when —
~30 lines) plus `quick-STATE.md` (current-status / last-activity).
A **collaborative DESIGN fill-in step** lets you and the agent agree on
contract before any work happens. `--full` retains the v1.1 heavyweight
behavior.

Migration: no action needed. Existing `quick-PLAN.md` files keep working.
New quick runs use the new shape.

### `/cp-plan-phase` deprecated

`/cp-plan-phase` is now a deprecation stub. It prints a one-line notice
and tells you to use `/cp-autonomous` (which delegates per-phase plan
generation to the role skill from `cp doctor`). The stub will be removed
in v1.3.

Migration:

```diff
- /cp-plan-phase 03
+ /cp-autonomous 03
```

`/cp-autonomous 03` runs phase 03 end-to-end (plan + execute + summary)
through the configured role. To plan only — no execution — use
`/cp-autonomous 03 --check`.

### `cp autonomous --workflow`

New flag passes a workflow choice through to per-phase delegation.
Defaults to `dev`. Use `--workflow=quick` to drive a non-roadmapped quick
run autonomously.

```bash
cp autonomous --check                  # default dev workflow
cp autonomous --workflow=quick         # drive quick instead
cp autonomous 03 --workflow=dev        # explicit
```

## Roadmap / Workflow Author Notes

### Fold-into-DESIGN behavior

When a phase has `persist: true`, the runtime takes the agent's output for
that phase and writes it under a `## <phaseId>` heading inside the phase's
`DESIGN.md`. Re-runs are idempotent — the section is replaced in-place
when it already exists, appended otherwise. Atomic via tmp + rename, so a
crashed run never leaves a partial DESIGN.md.

This replaces the v1.1 pattern of each phase scribbling its own ad-hoc
artifact file. Now there's one canonical contract document per phase, and
agents write into it in well-defined slots.

### `max_children:` safety cap

Fan-out is unbounded by template default. To prevent a runaway parent
agent from producing 1,000 children, set `max_children:` on the parent
phase (or on a child phase to limit its sub-fan-out):

```yaml
- id: plan
  role: planner
  persist: true
  max_children: 20
```

If the parent's structured-list output exceeds `max_children:`, the
runtime fails the parent phase with a clear error before materializing
any children.

### Inter-child dependencies (`optimizable:` + `depends_on:` on list items)

v1.2's most important fan-out refinement: the structured object a parent
agent returns now supports an explicit `optimizable: boolean` flag at the
top level plus a `depends_on:` field on each item.

```json
{
  "optimizable": true,
  "items": [
    { "name": "feature-A", "depends_on": [] },
    { "name": "feature-B", "depends_on": [] },
    { "name": "feature-C", "depends_on": ["feature-A", "feature-B"] }
  ]
}
```

| `optimizable` | per-item `depends_on` | Execution                                                     |
|---|---|---|
| `false` or missing | anything (ignored)               | **Array mode** — items run sequentially in declared order.    |
| `true`             | every item declares (use `[]`)    | **DAG mode** — topological sort of declared edges.            |
| `true`             | some items omit `depends_on`      | **DAG mode** — missing `depends_on` is treated as `[]`.       |
| `true`             | cycle / self-ref / unknown id     | **Hard error** — phase fails fast.                            |

The runtime computes a topological order across declared edges in DAG mode,
then runs children in parallel waves. Items with no inter-item dependency
execute together; later items wait.

**Agent guidance.** Only set `optimizable: true` when you are confident about
**every** inter-item dependency. If unsure about any item, leave
`optimizable: false` (or omit it) and the runtime will fall back to safe
sequential execution — any `depends_on` you wrote will be ignored. This
disambiguates "I want full parallelism" from "I don't know the dependencies"
— two cases the v1.1-era all-or-nothing rule silently conflated.

**Back-compat.** A bare items array (no wrapping object) is still accepted
and treated as `{ optimizable: false, items: [...] }`. Existing v1.1 fan-out
flows continue to work unchanged.

## Test / Compatibility Notes

- v1.1 workflows load and run unchanged.
- v1.1 `.planning/custom/` slugs remain readable; one-time deprecation
  warning per process when detected.
- v1.1 `persist_output:` workflows load with a deprecation warning at
  template-load.
- v1.1 PLAN.md-shaped phases keep working — DESIGN.md / STATE.md are
  additive.
- `/cp-plan-phase` still routes to `/cp-autonomous` for one release; a
  deprecation banner prints on every invocation.
- `npm test` covers the back-compat aliases: see `test/unit-custom.js`
  (legacy custom-root tests) and `test/unit-workflow.js` (binds_to alias
  normalization).

## Quick Cheatsheet

| Old (v1.1)                       | New (v1.2)                                  |
|----------------------------------|---------------------------------------------|
| `persist_output: true`           | `persist: true`                             |
| `binds_to: custom`               | `binds_to: quick`                           |
| `.planning/custom/<slug>/`       | `.planning/quick/<slug>/`                   |
| `/cp-plan-phase 03`              | `/cp-autonomous 03`                         |
| `/cp-quick` (PLAN.md)            | `/cp-quick` (DESIGN.md + STATE.md)          |
| `cp autonomous`                  | `cp autonomous [--workflow=dev\|quick]`     |
| Ad-hoc per-phase artifact files  | `persist: true` → DESIGN.md `## <phaseId>`  |
| Fan-out: array-order only        | Fan-out: `optimizable:` + `depends_on:`, topo |

## See Also

- [CHANGELOG.md](CHANGELOG.md) for the v1.2.0 bullet list.
- [README.md](README.md) → "Fan-out" section for the full fan-out
  contract.
- [MIGRATION-v1.1.md](MIGRATION-v1.1.md) for v1.0 → v1.1 changes.
- [MIGRATION-v1.0.md](MIGRATION-v1.0.md) for the workflow CLI surface
  introduction.
