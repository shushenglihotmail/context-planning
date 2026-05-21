---
phase: "37"
name: /cp-autonomous slash skill
milestone: v0.10 Autonomy
status: in-progress
created: 2026-05-21
base-commit: 417bf09dd0dbc4be4e2fdcff7e5a14901f2ef7dc
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

# Phase 37: /cp-autonomous slash skill

**Milestone**: v0.10 Autonomy
**Created**: 2026-05-21

## Goal

Ship the `/cp-autonomous` slash skill that drives the phase 36 CLI
end-to-end — auto-plans pending phases, executes each plan via
`/cp-execute-phase`, smart-gates on test/audit/deviation, and stops
cleanly via `.continue-here.md` + inline prompt.

## Success Criteria

1. `/cp-autonomous` appears in the installed skill set for copilot,
   claude, cursor, aider after `cp install <harness>`.
2. The skill orchestrates the autonomous loop by invoking `cp
   autonomous --check --json` for pre-flight, then alternating
   `/cp-plan-phase N` (if PLAN.md is a stub) → `/cp-execute-phase N`
   (per plan) → CLI gate checks (`cp audit --json`, test command).
3. On a stop, the skill displays the stop reason + `.continue-here.md`
   path, then prompts the user inline (does not exit the session).
4. The skill accepts the same START / `--scope` arguments as the CLI.
5. README mentions `/cp-autonomous` in the skill list (deferred to
   phase 38 for full docs work; this phase only needs registry +
   skill file).
6. Installer regression: cp install copilot --force in a fresh fixture
   places `.github/skills/cp-autonomous/SKILL.md` and the existing
   harnesses don't lose any other skill.

## Plans

- [x] 37-01: Author commands/cp/autonomous.md (the source skill prose) +
      regenerate installer copies via `cp install <harness> --force`,
      add to docs index. Smoke: install into a fixture repo for one
      harness and grep for the skill file.

## Notes

- Pattern to mirror: `commands/cp/update.md` (v0.9 P34) — same shape,
  same length, same "delegates to lib via CLI" stance.
- The skill should NOT re-implement the loop. It calls
  `cp autonomous --check --json` once for pre-flight, then enters its
  own loop in prose: read STATE → detect plan stub → delegate to
  `/cp-plan-phase` if needed → delegate to `/cp-execute-phase` →
  check `cp audit --json` HIGH → check tests if config has
  `test_command` → loop.
- Why prose-loop instead of `cp autonomous --execute`? Because the
  skill layer is where agent reasoning lives (interpreting deviations,
  drafting `.continue-here.md` next-steps that match the actual
  failure mode). The CLI's `runAutonomous` is reserved for the
  inner-lib testing path + `--check` previews.
- The skill MUST commit-bracket each plan (start + end) so a SIGINT
  leaves a clean git state.
- Stop-prompt UX: on stop, ALWAYS use `ask_user` (don't print options
  in plain text). Reason-tailored choices:
  - `test-failure` → ["Debug now", "Skip this plan", "Stop"]
  - `audit-high` → ["Run /cp-audit-fix", "Stop"]
  - `deviation` → ["Inspect & retry", "Skip this plan", "Stop"]
  - default → ["Continue at next plan", "Stop"]

