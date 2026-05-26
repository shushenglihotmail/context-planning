---
phase: "51"
plan: 51-01
title: Refactor cp autonomous to delegate per phase via cp run
status: complete
outcome: shipped
key-decisions:
  - decision: "Bridge over runtime-first: keep lib/autonomous.js walking ROADMAP phases but swap planPhase+executePhase callbacks for a single runPhase(phaseNum, workflowName) per phase."
    rationale: cp run is per-milestone and walks workflow phases via a slug; cp autonomous was per-plan over pre-scaffolded ROADMAP plans. A literal per-phase cp run invocation (as the PLAN line suggested) would re-scaffold milestones and emit the wrong wave's instruction. The bridge resolves this without churning the milestone scaffolding model; the runtime-first collapse is deferred to 51-04.
  - decision: Smart gates (tests + audit-HIGH) now fire once per phase instead of once per plan.
    rationale: There is no per-plan loop in the new model; the runPhase callback is the unit of work. Per-phase gating is the natural granularity once cp run owns intra-phase commits.
  - decision: Fold the dev/dev-v2 swap into 51-01 (delete v1 sequential dev template, rename v1.2 fan-out dev-v2 -> dev) instead of splitting it into its own micro-plan.
    rationale: "User explicitly approved option (a). Coherent commit: autonomous needs a default workflow name and that name should resolve to the v1.2 fan-out template. ~10 structure-sensitive dryrun-workflow-cli.js assertions rewritten to match the new 3-phase / 1-wave shape."
  - decision: Drop _isStubPlan + planPhase + plan-stub / plan-failed stop reasons entirely.
    rationale: cp-plan-phase is being deprecated in 51-04; the workflow runtime owns planning via the agent's response to the cp run resume instruction. Carrying the stub-detection branch forward would only delay the cleanup.
  - decision: Document a temporary legacy pass-through in cp-autonomous.md for milestones already scaffolded the v0.10 way (skip cp run resume / mark-complete, fall back to PLAN.md plan walking).
    rationale: The v1.2 milestone itself is scaffolded the legacy way (we are inside it right now). Without a pass-through, running /cp-autonomous on this milestone would fail. The pass-through is explicitly time-bounded — 51-04 removes it once cp-plan-phase is deprecated.
key-files:
  modified:
    - lib/autonomous.js
    - bin/commands/autonomous.js
    - commands/cp/autonomous.md
    - test/unit-autonomous.js
    - test/dryrun-workflow-cli.js
    - test/integration-fanout-v12.js
    - templates/workflows/dev.yaml
  deleted:
    - templates/workflows/dev-v2.yaml
verification: Full npm test green. unit-autonomous expanded from 17 to 24 assertions. dryrun-workflow-cli.js (102 assertions) and integration-fanout-v12.js (25 assertions) both pass with the renamed dev template.
completed: 2026-05-26
end-commit: eaf9aefc4a6d26762dbfcbf2b5bc46bbc4f1e15e
---
# Phase 51 — Plan 51-01: Refactor `cp autonomous` to delegate per phase via `cp run`

## What shipped

Collapsed the parallel-orchestrator architectural debt: `cp autonomous`
no longer drives planning + execution itself — it now delegates each
ROADMAP phase to a single `runPhase(phaseNum, workflowName)` callback
which the cp-autonomous skill maps to the `cp run` workflow runtime
(`cp run resume <slug>` → agent works → `cp run mark-complete <slug>
<phase-id>`).

Also folded in the dev/dev-v2 swap the user explicitly approved:
deleted the v1 sequential `dev` template (brainstorm + research +
plan + execute + review, 6 phases / 5 waves) and renamed the v1.2
fan-out `dev-v2` to `dev` (parent `plan` + child `child-plan`/
`child-execute`, 3 phases / 1 wave). `dev` is now the default
workflow for autonomous, overridable via `--workflow=<name>` or
`cp.behavior.default_workflow`.

## Why

Pre-existing architectural debt: `cp autonomous` was built in v0.10
(phases 36-37) on top of the legacy `PLAN.md` + plan-tick model
(`/cp-plan-phase` per phase + `/cp-execute-phase` per plan).
`cp run` was built later (workflow runtime, phases ~40-50) as a
template-driven orchestrator that owns scaffolding and walks
workflow **phases**, not ROADMAP **plans**. They were two parallel
orchestrators in the same CLI. The v1.2 milestone was specifically
chartered to collapse them; 51-01 is the first step of that
collapse.

## How (the bridge approach)

We chose the lower-risk "bridge" shape over a full runtime-first
rewrite of `lib/autonomous.js`:

- `lib/autonomous.js` keeps its ROADMAP-walking shape (parseScope,
  resolveStart, resolvePhases unchanged). What changed is the
  callback contract: the per-plan `executePhase(phaseNum, planId)`
  loop is gone; replaced by a single `runPhase(phaseNum, workflowName)`
  call per phase. Smart gates (tests + audit-HIGH) now fire once
  per phase, not per plan.
- `_isStubPlan` and the `planPhase` callback / `plan-stub` /
  `plan-failed` stop reasons are removed — cp-plan-phase deprecation
  lives in 51-04 and the workflow runtime owns planning now.
- `bin/commands/autonomous.js` gains a `--workflow <name>` flag
  (default `dev`, overridable via `cp.behavior.default_workflow`).
- `commands/cp/autonomous.md` was rewritten end-to-end. New Step 3
  resolves or starts the workflow run (with a documented legacy
  pass-through for milestones already scaffolded the v0.10 way, used
  until 51-04 lands). New Step 4 is the per-phase loop:
  `cp run resume <slug>` → do the work → `cp run mark-complete <slug>
  <phase-id> < <summary>`. Stop UX (now Step 6) drops `plan-failed` /
  `deviation` reasons and adds `phase-failed`.

## Architectural mismatch resolved (partially)

Surfaced in pre-flight discussion: `cp run` is per-milestone (owns
scaffolding, walks phases via a slug); `cp autonomous` was per-plan
(walks pre-scaffolded ROADMAP plans). Literally calling
`cp run dev <milestone>` per phase as the PLAN line suggested would
(a) re-scaffold an existing milestone and (b) emit the wrong wave's
instruction. The bridge resolves this by: one `cp run` run per
milestone, started or resumed once at Step 3; per-phase work driven
by `cp run resume` + `cp run mark-complete`. The full collapse
(making `cp autonomous` and `cp run` two faces of the same
orchestrator, including a migration story for legacy-scaffolded
milestones) is deferred to 51-04 alongside cp-plan-phase deprecation.

## Tests

All green. unit-autonomous expanded from 17 to 24 assertions covering
the new callback shape, including workflow override and
skip-already-done phase behavior. dryrun-workflow-cli.js's
structure-sensitive `inspect dev` assertions were rewritten to match
the new 3-phase / 1-wave fan-out shape. integration-fanout-v12.js had
its `dev-v2` references renamed.

## Deviations

- **Scope grew**: the dev/dev-v2 rename was originally a separate
  user request that we folded into 51-01 with explicit user approval
  ("a — fold it into plan 51-01"). PLAN.md's 51-01 description
  didn't mention it.
- **Pre-existing config bug noticed**: `lib/autonomous.js#runTests`
  uses `require('./config').loadConfig(root)` inside a try/catch,
  but `lib/config.js` doesn't exist (the module is `lib/provider.js`).
  The lookup silently fails and we fall through to `npm test`. Not
  fixed in this plan — added to backlog (would affect anyone setting
  `cp.behavior.test_command`). `bin/commands/autonomous.js` uses the
  correct `require('../../lib/provider')` for the new
  `default_workflow` lookup so that path works.

## Follow-ups for Phase 51

- 51-02: same shim treatment for `cp quick`.
- 51-03: collapse `.planning/custom/` into `.planning/quick/`.
- 51-04: deprecate `cp-plan-phase`; remove the legacy pass-through
  branch from cp-autonomous.md; finish the runtime-first collapse
  for `lib/autonomous.js`.
- 51-05: smart-gate + scope/argv parity tests for autonomous and quick.
