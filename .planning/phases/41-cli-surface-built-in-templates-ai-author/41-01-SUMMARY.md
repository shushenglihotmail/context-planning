---
subsystem: cli
tags:
  - cli
  - workflow
  - run-command
requires:
  - lib/runtime.js
  - lib/custom.js
  - lib/workflow.js
provides:
  - cp run
  - cp run resume
  - cp run retry
  - cp run abandon
  - cp run mark-complete
  - cp run status
affects:
  - bin/commands/index.js
  - bin/commands/_usage.js
tech-stack:
  - node
  - js-yaml
key-files:
  created:
    - bin/commands/run.js
  modified:
    - bin/commands/index.js
    - bin/commands/_usage.js
key-decisions:
  - Single run.js module hosts the full sub-command tree (start, resume, retry, abandon, mark-complete, status); dispatched on argv[0].
  - "Stdout reserved for actionable text (instruction body, --json payloads); stderr for slug/wave logs and errors. Exit codes: 0 ok, 1 duplicate/abort, 2 usage, 3 template-not-found, 4 run-not-found, 5 phase-not-in-wave."
  - mark-complete reads summary text from stdin (matching write-summary convention); abandon supports --yes for non-interactive flows.
  - Imports lib/workflow.js#computeWaves directly to format 'wave N of M' in resume/mark-complete logs — pure computation, no state mutation.
patterns-established:
  - Sub-command sub-tree inside a single registry entry (alternative to one file per leaf command).
  - Exit-code matrix per CLI module (documented at top of run.js).
requirements-completed:
  - v1.0/CLI/run-family
phase: 41
plan: 41-01
completed: 2026-05-25
end-commit: 409a0230d62303c4b9dd95f5a9f9e0adccdb8ce3
---
# 41-01 — cp run CLI family

## What shipped
A new CLI module `bin/commands/run.js` exposing six sub-commands that wrap `lib/runtime.js` (milestone/phase-bound runs) and `lib/custom.js` (custom-tier runs) uniformly:

| Sub-command | Purpose |
|---|---|
| `cp run <workflow> [name] [--plan-only]` | start a new workflow run |
| `cp run resume <slug>` | re-emit current wave's instruction |
| `cp run retry <slug> <phase-id>` | roll back a phase and re-emit |
| `cp run abandon <slug> [--yes]` | mark a run abandoned (interactive confirm by default) |
| `cp run mark-complete <slug> <phase-id>` | advance run (summary read from stdin) |
| `cp run status [slug] [--json]` | list all runs or show one's state |

## Discipline
- Stdout = actionable text (instruction body, JSON payloads).
- Stderr = operational logs (slug, wave progress, errors).
- Exit-code matrix documented at top of `run.js`.

## Smoke-tested
All ten scripted scenarios in the agent report passed: nominal start, duplicate guard, status, resume (positive + negative), mark-complete advance, abandon. See `409a023`.

## Tests
Full `npm test` suite (~31 files) remains 100% green — zero regressions. CLI-specific tests land in plan 41-03.

## Deviations
None affecting external contract. One internal pragmatism: imported `computeWaves` from `lib/workflow.js` directly for "wave N of M" formatting in stderr logs (pure compute, no state side-effects). Plan 41-03 will cover this path in `integration-run-cli.js`.
