---
phase: "26"
name: Repair commands
milestone: v0.8 Consistency
status: draft
created: 2026-05-22
---

# Phase 26: Repair commands (Tier 3 repair)

## Status
Draft

## Context

Phase 24 (audit detection) and phase 25 (audit --fix loop) cover the easy
half of repair: state-stale + summary-without-tick auto-fix on their own.
But the remaining ~80% of drift findings — missing SHA pins, expected-vs-
actual file drift, planning regressions, deliberate scope changes — need
explicit verbs the user (or agent) can invoke.

The milestone DESIGN promised four verbs:

| Verb | Purpose |
|---|---|
| `cplan reconcile` | Single-finding repair: fill missing base/end commits, rewrite expected-key-files, etc. |
| `cplan supersede` | Mark a plan or phase as superseded by another (decision changed mid-milestone) |
| `cplan deviate` | Record a deliberate divergence from PLAN.md (scope change without rewriting plan) |
| `cplan scaffold-phase --continue` | Bypass prior-summary gate to carry forward truly-stale work |

Phase 26 ships all four and wires `reconcile` into `audit-fix.FIXERS` so the
audit loop can apply the most common repairs (missing base/end commit)
without manual invocation.

## Decision

**Three plans:**

1. **26-01** — `cp reconcile` + reconcile-backed FIXERS entries
   - `lib/reconcile.js`: `reconcilePhase(root, phaseNum, opts)` and
     `reconcileFinding(root, finding, opts)` helpers.
   - Operations: infer & write `base-commit` (from first `cp(NN-MM):` commit
     or scaffold timestamp), infer `end-commit` (from last `cp(NN):` tick
     or last commit touching the phase tree), rewrite `expected-key-files`
     for a plan based on actual `git diff base..end` (with `--accept`).
   - `bin/commands/reconcile.js`: `cp reconcile <phaseNum> [--plan NN-MM]
     [--infer-shas] [--accept] [--dry-run] [--json]`.
   - Extend `lib/audit-fix.js` FIXERS: `missing-base-commit`,
     `missing-end-commit` both call `reconcile.reconcileFinding` with
     `inferShas: true`.

2. **26-02** — `cp supersede` + `cp deviate`
   - `lib/lifecycle.js::supersedePlan(root, planId, opts)` — replaces plan
     checkbox with `- [~]` (superseded marker), appends a "Superseded by:
     X-YY" note to plan summary section. Auto-commit
     `cp(supersede): NN-MM superseded by X-YY`.
   - `lib/lifecycle.js::recordDeviation(root, phaseNum, opts)` — appends a
     `## Deviation YYYY-MM-DD` block to phase PLAN.md `## Notes` with
     summary + rationale. Auto-commit `cp(deviate): N <summary>`.
   - `bin/commands/supersede.js`: `cp supersede <planId> --by <newPlanId>
     [--reason <text>] [--dry-run]`.
   - `bin/commands/deviate.js`: `cp deviate <phaseNum> --summary "<text>"
     [--reason <text>] [--dry-run]`.

3. **26-03** — `scaffold-phase --continue` + docs + dogfood
   - Extend `bin/commands/scaffold-phase.js`: `--continue` accepts prior
     phase as stale and stamps `Continues from phase N` in new PLAN.md
     Notes section (distinct from `--force` which silently bypasses).
   - Update `_usage.js`, append to `STRUCTURE.md` repair-commands section,
     refresh CHANGELOG Unreleased.
   - Dogfood: `cp audit --fix` on this repo to backfill some of the 62
     legacy MEDIUMs (verify the new reconcile fixer works end-to-end).

## Alternatives Considered

1. **Single `cp repair` verb with subcommands.** Rejected: matches GSD
   pattern of separate top-level verbs and keeps `--help` discoverability
   high. Subcommands hide intent.
2. **`reconcile` only; skip `supersede`/`deviate` to v0.9.** Rejected:
   without these two verbs there's no graceful path for "I changed my
   mind mid-milestone" — users would silently rewrite PLAN.md and lose
   decision history. They're small (one lifecycle helper each) and worth
   shipping now.
3. **Reconcile auto-runs on every audit, no FIXERS hook needed.**
   Rejected: violates "one finding, one atomic commit" rule from phase 25
   and would make `cp audit` no longer read-only.

## Consequences

### Positive
- Drift detected by `cp audit` is now repairable in one command without
  manually editing PLAN.md.
- Decision history (supersede/deviate) is preserved in git instead of
  being silently overwritten.
- 62 legacy MEDIUM findings on this repo become auto-fixable via phase
  29's `cp reconcile --infer-shas --all`.

### Negative
- Three new CLI verbs to maintain.
- `reconcile --accept` for expected-key-files drift is a destructive
  rewrite — must be explicit (no implicit `--accept` from audit-fix).

## References
- Milestone DESIGN: `.planning/milestones/v0-8-consistency/DESIGN.md` (P10)
- `lib/audit-fix.js` FIXERS registry (Plan 25-01)
