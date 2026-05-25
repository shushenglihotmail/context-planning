---
requires:
  - cp v1.0 workflow CLI surface (cp run, cp workflow)
key-decisions:
  - Wave-loop logic lives in cp-workflow-run only; cp-workflow-resume cross-references rather than duplicates (43-03)
  - "Smart-gate sentinels (test fail, audit HIGH, DEVIATION: prefix) match cp-autonomous exactly so phase-45 shim is transparent"
  - --scope and --check argv contract matches cp-autonomous historical contract
  - Skill never mutates .planning/runs/ directly; all state changes go through cp run sub-commands
subsystem: tooling
key-files:
  created:
    - commands/cp/workflow-run.md
  modified: []
duration: 20min
provides:
  - cp-workflow-run agent skill — generic workflow driver for Copilot CLI / Claude Code
patterns-established:
  - cp-workflow-* skill family naming under unified prefix (Q2 of v1.1 brainstorm)
  - Skill bodies use numbered Step 1..N sections mirroring commands/cp/autonomous.md structure
tech-stack:
  patterns:
    - agent-side cp-* skill that shells out to cp CLI; smart-gate stop semantics
  added: []
tags:
  - agent-skills
  - workflow-engine
  - markdown
requirements-completed: []
affects:
  - commands/cp/workflow-run.md
phase: 43
plan: 43-01
completed: 2026-05-25
end-commit: 6174bf22cb6b6b1d1e7ef4f7420faf23a21b6885
---
# Accomplishments

Authored `commands/cp/workflow-run.md`, the first agent-side skill in
the new `cp-workflow-*` family. The skill is the generic workflow
driver — it wraps `cp run <workflow> <name>` and the mark-complete
wave loop, so any workflow (built-in or custom) can be driven to
completion from inside Copilot CLI / Claude Code without leaving the
agent session for the terminal.

The skill body (~280 lines markdown) follows the established
`commands/cp/autonomous.md` numbered-Step structure:

- Step 1: argv parse (workflow, name, --plan-only, --scope, --check)
  with the same `--scope`/`--check` contract as `cp-autonomous` for
  phase-45 shim transparency
- Step 2: `cp workflow validate <wf> --strict` pre-flight
- Step 3: `cp doctor` role resolution (cached per invocation)
- Step 4: `cp run` startup with slug capture from stderr
- Step 5: Wave loop with 5 sub-steps:
  - 5.1 parse wave block from stdout
  - 5.2 dispatch each phase to its resolved role skill
  - 5.3 smart-gate checks (test fail, audit HIGH, deviation sentinel)
  - 5.4 `cp run mark-complete < summary.md`
  - 5.5 `--scope` boundary enforcement
- Step 6: report (clean/stop/scope-bounded variants)

# Task Commits

- `0e0e74b feat(43-01): add cp-workflow-run skill (generic workflow driver)`

(plus the start marker `ca26f47 cp(43): start 43-01 execution`)

# Files Created

- `commands/cp/workflow-run.md` (9.8 KB, 277 lines)

# Decisions Made

1. **Wave-loop logic is single-source** — owned by `cp-workflow-run`.
   `cp-workflow-resume` (plan 43-03) will reference this skill's
   Step 5 by name rather than duplicate the ~150 lines of wave-loop
   markdown.
2. **Smart-gate sentinels match `cp-autonomous` verbatim** — same
   conditions (test fail, audit HIGH, `DEVIATION:` prefix), same
   `.planning/.continue-here.md` write semantics. Required for the
   phase-45 shim to be transparent.
3. **`--scope` and `--check` argv contract matches
   `cp-autonomous`** — `phase | <N> | <N-M> | milestone` for
   `--scope`, `--check` for preview-only with role mapping. Same
   reason.
4. **No direct `.planning/runs/` mutation** — all state changes go
   through `cp run` sub-commands. The skill is a pure consumer of
   the v1.0 CLI surface.
5. **Per-invocation role resolution** — `cp doctor` is called every
   invocation rather than cached, so newly-installed providers are
   picked up without restart.

# Deviations

None. Implementation matches DESIGN.md "Plan 43-01" section verbatim.

# Issues

None.

# Next Phase Readiness

Plan 43-02 (`cp-workflow-list`) can start immediately. The two skills
are independent — 43-02 does not depend on 43-01's contents (only on
the v1.0 `cp workflow ls / show` CLI), so executing them sequentially
in this phase is purely for atomic-commit discipline, not technical
ordering.
