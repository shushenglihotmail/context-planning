---
milestone_slug: "v1-4-workflow-driven-quick-and-milestone"
milestone: v1.4 Workflow-driven quick and milestone
status: accepted
created: 2026-05-27
updated: 2026-05-27
deciders: [maintainer]
supersedes: []
superseded_by: null
---

# Design: v1.4 Workflow-driven quick and milestone

## Status

Accepted on 2026-05-27.

## Context

In v1.3 the workflow engine became the canonical execution surface for phase
work (parent/child fan-out, phase-templates, workflow-templates). But two
key user-facing flows still bypass it entirely:

- `/cp-new-milestone` — skill-driven; brainstorms goals, scaffolds ROADMAP,
  updates PROJECT/STATE.
- `/cp-quick` — skill-driven; scaffolds a quick task dir, delegates to
  provider's execute skill, writes SUMMARY.

This split is architecturally inconsistent and limits reuse. Project goal
for v1.4: route both flows through the workflow engine so they benefit
from phase-templates, workflow-templates, defaulting, fan-out, and resume.

The legacy skills must remain available (renamed) so users can A/B test
and fall back if the new pipeline misbehaves.

## Decision

Convert milestone and quick flows to workflow-driven processes:

```
cp-new-milestone "<name>"   → scaffold scope docs → cp run milestone "<slug>"
cp-quick "<task>"           → scaffold scope docs → cp run quick "<slug>"
```

Rename existing skills to `cp-new-legacy-milestone` and `cp-legacy-quick`.
Reuse v1.3 phase-template / workflow-template machinery; add the minimal
engine primitives required to support this:

1. New phase kind `scaffold` — phases that mutate `.planning/` state via a
   `cp` CLI command, not a provider skill. Exempt from PLAN.md
   requirement, audit hooks, and code-review hooks.
2. Dynamic fan-out via `materialize: true` — a parent phase emits a JSON
   child-list at runtime that the engine splices in (carrying
   `optimizable`, `depends_on`, and computed phase numbers).
3. Config-aware default resolution — workflow-template / phase-template
   parameter defaults can reference `.planning/cp-config.yaml` provider
   skills (e.g. `default: ${config.provider.brainstorm_skill}`).
4. New CLI helpers: `cp project update --from <json>`,
   `cp state set-focus`, `cp state log-activity` — so scaffold phases can
   mutate PROJECT.md / STATE.md without inline file edits.

Old skills are NOT modified, only renamed. New canonical names point at
the workflow-driven implementations.

## Consequences

### Positive
- One architecture for all phase-shaped work; v1.3 templates apply uniformly.
- Reuse phase-template / workflow-template params + defaults across flows.
- Brainstorm/plan/execute skills become provider-pluggable via cp-config.
- Resume semantics inherited from workflow engine for free.
- New CLI helpers (`cp project update`, `cp state ...`) are independently useful.

### Negative
- More commits per milestone setup (≈6-10 vs the old single commit).
- Two skills for each flow during transition (canonical + legacy).
- Engine grows two new concepts (scaffold kind, materialize).
- Workflows that mutate planning state are a new pattern — documentation
  burden.

### Neutral
- Slash command muscle memory unchanged (`/cp-new-milestone`, `/cp-quick`).
- Behavior changes — old users see different output ordering.

---

## Architecture

```
                     ┌──────────────────────────────┐
  /cp-new-milestone  │ thin skill: parse args,      │
  /cp-quick          │ scaffold scope docs,         │
                     │ invoke `cp run <workflow>`   │
                     └──────────────┬───────────────┘
                                    │
                                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │                  cp workflow engine (v1.3)               │
  │                                                          │
  │  ┌─ phase: kind=scaffold ─┐   ┌─ phase: kind=skill ─┐    │
  │  │  runs `cp <verb>...`   │   │  invokes provider   │    │
  │  └────────────────────────┘   └─────────────────────┘    │
  │                                                          │
  │  ┌─ phase: materialize=true (parent) ─┐                  │
  │  │  emits child-list JSON;            │                  │
  │  │  engine splices children inline    │                  │
  │  └────────────────────────────────────┘                  │
  └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │   CLI helpers (new + existing)                           │
  │     cp scaffold-milestone, scaffold-phase                │
  │     cp project update --from <json>           (NEW)      │
  │     cp state set-focus / log-activity         (NEW)      │
  │     cp write-summary, complete-milestone                 │
  └──────────────────────────────────────────────────────────┘
```

## Components

### `kind: scaffold` phase-type (engine)
- **Purpose:** phase whose work is running a `cp` CLI verb, not a
  provider skill.
- **Public interface:** YAML `kind: scaffold`, `command: "<cp verb + args>"`.
- **Behavior:**
  - Engine spawns the CLI command, captures stdout/stderr to phase log.
  - Exit-code propagates to phase status.
  - Suppresses PLAN.md requirement, audit hooks, code-review hooks.
  - Idempotency contract: scaffold commands MUST be safe to re-run; engine
    treats exit-code 6 ("already exists") as success-no-op.
- **Dependencies:** existing phase dispatcher in `lib/workflow.js`.

### Dynamic fan-out / materialize
- **Purpose:** parent phase decides child count + shape at runtime.
- **Public interface:** YAML `materialize: true` on a parent phase.
- **Output contract:** parent phase must emit a JSON document to
  `.planning/phases/<n>-<slug>/materialize.json`:
  ```json
  {
    "optimizable": true,
    "children": [
      { "name": "X", "plans": 2, "depends_on": [] },
      { "name": "Y", "plans": 1, "depends_on": ["X"] }
    ]
  }
  ```
- **Behavior:** engine reads `materialize.json` after parent completes,
  assigns phase numbers (continuing from project max), scaffolds each
  child phase (calls `cp scaffold-phase`), rewrites `depends_on` to the
  new phase numbers, threads `optimizable` through to the wave plan.

### Config-aware default resolution
- **Purpose:** workflow-templates pick up provider-specific skills from
  `.planning/cp-config.yaml` without per-call overrides.
- **Public interface:** in a phase-template/workflow-template params block:
  ```yaml
  params:
    - name: brainstorm_skill
      default: "${config.provider.brainstorm_skill}"   # NEW
    - name: plan_skill
      default: "${config.provider.plan_skill}"
  ```
- **Behavior:** template loader resolves `${config.<path>}` against the
  loaded cp-config; if path is missing, fall back to provider-agnostic
  literal (or error if no fallback).

### New CLI helpers
- **`cp project update --from <json>`**: declarative PROJECT.md mutations
  (move-validated, add-active, set-last-updated). JSON shape:
  ```json
  {
    "validated_additions": ["..."],
    "active_additions": ["..."],
    "last_updated_note": "added v1.4"
  }
  ```
- **`cp state set-focus <text>`**: updates STATE.md "Current focus".
- **`cp state log-activity <text>`**: appends activity entry.

### Workflows shipped
- **`templates/workflows/quick.yaml`**:
  - scope-scaffold (scaffold) → quick-execute (skill) → quick-summary (scaffold)
  - Params: `execute_skill` (default: `${config.provider.execute_skill}`).
- **`templates/workflows/milestone.yaml`**:
  - milestone-brainstorm (skill, interactive) → project-update (scaffold)
    → phase-fanout (skill+materialize) → milestone-complete (scaffold)
  - Params: `brainstorm_skill`, `plan_skill`, `execute_skill` (all
    default to cp-config provider).

### Phase-templates shipped
- `quick-scope.yaml` (scaffold)
- `quick-execute.yaml` (skill)
- `quick-summary.yaml` (scaffold)
- `milestone-brainstorm.yaml` (skill)
- `milestone-project-update.yaml` (scaffold)
- `milestone-phase-fanout.yaml` (skill+materialize)
- `milestone-complete.yaml` (scaffold)

## Data Flow

### Quick:
1. User: `cp-quick "fix foo"` → skill creates slug + dir, runs
   `cp run quick <slug>`.
2. scope-scaffold writes DESIGN.md/STATE.md from quick-templates.
3. quick-execute invokes provider's execute skill on DESIGN.md.
4. quick-summary writes SUMMARY.md + updates project STATE.md.

### Milestone:
1. User: `cp-new-milestone "v2.0 X"` → skill runs
   `cp scaffold-milestone` then `cp run milestone <slug>`.
2. milestone-brainstorm invokes provider's brainstorm skill,
   interactively produces MILESTONE-CONTEXT.md + DESIGN.md.
3. project-update applies PROJECT.md mutations from brainstorm output.
4. phase-fanout invokes a planning skill that emits materialize.json;
   engine scaffolds each child phase via `cp scaffold-phase`.
5. milestone-complete updates STATE.md (current focus, phase counter)
   and prints next-action banner.

## Error Handling

- Scaffold phases exit non-zero → phase fails, workflow stops, resume
  picks up at that phase (after user fixes the underlying issue).
- Exit-code 6 ("already exists") from scaffold-milestone /
  scaffold-phase → engine treats as success-no-op (idempotency).
- materialize.json invalid JSON or missing `children` → phase fails with
  a parseable error pointing at the file.
- Provider skill failure inside brainstorm/execute → standard workflow
  failure path; resume restarts from that phase.

## Testing Strategy

- **Unit (engine):** `kind: scaffold` dispatch, idempotency exit-code 6
  handling, materialize.json schema validation, config-aware default
  resolution.
- **Unit (CLI):** `cp project update`, `cp state set-focus`,
  `cp state log-activity` produce correct file mutations from sample JSON
  inputs.
- **Integration:** dry-run `cp run quick` against a fixture task →
  verify DESIGN/SUMMARY shapes match legacy. Dry-run `cp run milestone`
  against fixture brainstorm output → verify ROADMAP/PROJECT/STATE
  mutations match legacy.
- **Backwards-compat:** legacy skills (`cp-new-legacy-milestone`,
  `cp-legacy-quick`) still produce identical output to the
  pre-rename versions.

## Alternatives Considered

### Option A — Engine-level interactive checkpoint primitive

Add a `kind: confirm` phase that pauses for user approval between phases.

**Pros:** clean separation of interactive gates from work phases.
**Cons:** invents a new engine concept; brainstorm already handles
interactivity inside the skill loop; YAGNI for v1.4.
**Verdict:** rejected — keep interactivity inside skill phases.

### Option B — Workflow engine learns to use DESIGN.md as PLAN.md

Configure each workflow to use a custom plan-artifact filename.

**Pros:** quick keeps its DESIGN.md semantics.
**Cons:** introduces per-workflow config surface; engine must alias
artifact names; downstream consumers (audit, write-summary) must learn
both names.
**Verdict:** rejected — `kind: scaffold` phases simply opt out of the
PLAN.md requirement instead.

### Option C — Squash all scaffold-phase commits into one

Engine batches scaffold-phase commits and squashes at workflow end.

**Pros:** matches old skill's "one commit" output.
**Cons:** breaks per-phase atomicity; complicates resume (can't tell
which phase committed what); diverges from existing workflow engine
convention.
**Verdict:** rejected — accept the noisier history; users squash on merge
if desired.

## Open Questions

- [ ] After v1.4 lands, do we deprecate the legacy skills in v1.5 or keep
      them indefinitely as "manual mode"? (defer to post-launch)
- [ ] Should `cp project update` support delete-validated or
      delete-active operations? (defer until a real need emerges)
- [ ] Does the workflow engine need a `--non-interactive` flag for CI
      runs of the milestone workflow? (defer — CI typically uses quick,
      not milestone)

## References

- v1.3 design: `.planning/milestones/v1-3-reusable-phase-templates/DESIGN.md`
- v1.3 fan-out / optimizable: Phase 52.5 SUMMARYs
- Legacy skill flows: `.github/skills/cp-new-milestone/SKILL.md`,
  `.github/skills/cp-quick/SKILL.md`
- This-session brainstorm transcript: see milestone PR description.
