---
phase: "36"
name: cp autonomous CLI + lib helper
milestone: v0.10 Autonomy
status: in-progress
created: 2026-05-21
base-commit: 24dc5477596d9ab69bfa17d4e98222c5b8c26bc4
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 36: cp autonomous CLI + lib helper

**Milestone**: v0.10 Autonomy
**Created**: 2026-05-21

## Goal

Ship the testable foundation of `/cp-autonomous`: a pure orchestrator
in `lib/autonomous.js` and a thin CLI wrapper in
`bin/commands/autonomous.js` that together let `cp autonomous` walk an
entire milestone's pending phases with smart-gate stop conditions and
structured JSON output.

## Success Criteria

1. `cp autonomous --check --json` runs against the current repo,
   prints a structured preview of what would run, exits 0 if nothing
   pending or 1 if there are pending phases.
2. `cp autonomous --scope=phase` with no in-progress milestone exits 2
   with a clear `no-active-milestone` reason.
3. `cp autonomous --scope=N-M` clamps to milestone end (never crosses
   milestone boundaries).
4. `test/unit-autonomous.js` ships with ≥15 assertions covering scope
   parser, START resolver, milestone-cap, smart-gate triggers,
   `.continue-here.md` writer, dry-run, and JSON shape — all passing.
5. Full `npm test` chain stays green.
6. `cp autonomous` (no args) is discoverable via `cp` (usage row) and
   `cp autonomous --help` prints flag reference.

## Plans

- [x] 36-01: ship lib/autonomous.js + bin/commands/autonomous.js + unit tests + CLI registration

## Notes

- Per-phase delegation to `/cp-plan-phase` and `/cp-execute-phase`
  happens VIA the skill layer in phase 37, not in lib. The lib in this
  phase exposes the orchestration contract; the skill drives the
  per-phase delegated work.
- For phase 36, simulate the per-phase delegated work as a callable
  parameter `opts.executePhase(phaseNum)` and `opts.planPhase(phaseNum)`
  passed into `runAutonomous` — this keeps the lib pure and testable.
  The skill layer in phase 37 wires real delegations in.
- Smart-gate checks (test + audit) DO live in lib — they're CLI verbs
  already, no agent reasoning needed.
- Reuse the v0.9 `cp update` shape: same return-object pattern, same
  `--json` flag semantics, same exit codes.
