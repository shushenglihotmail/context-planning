---
subsystem: cli
tags:
  - cli
  - workflow
  - templates
  - built-ins
requires:
  - lib/workflow.js
provides:
  - cp workflow ls
  - cp workflow show
  - cp workflow validate
  - cp workflow diagram
  - cp workflow init
  - cp workflow new
  - cp workflow import
  - templates/workflows/dev.yaml
  - templates/workflows/debug.yaml
  - templates/workflows/quick.yaml
affects:
  - bin/commands/index.js
  - bin/commands/_usage.js
tech-stack:
  - node
  - js-yaml
key-files:
  created:
    - bin/commands/workflow.js
    - templates/workflows/dev.yaml
    - templates/workflows/debug.yaml
    - templates/workflows/quick.yaml
  modified:
    - bin/commands/index.js
    - bin/commands/_usage.js
key-decisions:
  - Seven sub-commands hosted in a single workflow.js module (mirrors run.js sub-tree pattern).
  - "Exit-code matrix: 0 ok, 2 usage/validation/strict-warnings, 3 template-not-found, 6 file-already-exists."
  - "diagram emits Mermaid flowchart only (DESIGN.md open-question resolved: mermaid-only for v1.0)."
  - "All three built-in templates pass workflow.validate ok=true; each carries a principles: block (≥2 entries) and a defaults: block per DESIGN.md requirements."
  - dev.yaml ships with 6 phases (brainstorm → research-prior-art ∥ research-constraints → plan → execute → review) to demonstrate parallel-wave authoring.
patterns-established:
  - Built-in templates resolved from repo-root templates/workflows/ via lib/workflow.js#resolveTemplate; project-level overrides live in .planning/workflows/.
  - "Path-vs-name argument detection: contains / \\\\ or ends with .yaml/.yml → path; else → named lookup."
requirements-completed:
  - v1.0/CLI/workflow-family
  - v1.0/built-in-templates/dev
  - v1.0/built-in-templates/debug
  - v1.0/built-in-templates/quick
phase: 41
plan: 41-02
completed: 2026-05-25
end-commit: d8c08fe814f4f822d4db30fc72c044d3aa4a7b92
---
# 41-02 — cp workflow CLI family + 3 built-in templates

## What shipped
**`bin/commands/workflow.js`** — seven sub-commands wrapping `lib/workflow.js`:

| Sub-command | Purpose |
|---|---|
| `cp workflow ls [--json]` | List built-in + project templates with source/binding |
| `cp workflow show <name>` | Pretty-print resolved template |
| `cp workflow validate <name-or-path> [--strict]` | Run `workflow.validate`; report errors/warnings |
| `cp workflow diagram <name-or-path>` | Emit Mermaid `flowchart TD` |
| `cp workflow init` | Bootstrap `.planning/workflows/` (idempotent) |
| `cp workflow new <name> [--from <built-in>] [--force]` | Scaffold a new template |
| `cp workflow import <path> [--name <override>] [--force]` | Validate-then-copy external templates |

**Three built-in templates** at `templates/workflows/`:
- **dev.yaml** — milestone-bound, 6 phases including a parallel research wave (brainstorm → research-prior-art ∥ research-constraints → plan → execute → review).
- **debug.yaml** — custom-bound 5-phase scientific-method cycle (collect-symptoms → repro → plan → fix → verify).
- **quick.yaml** — custom-bound 3-phase minimal (discuss → execute → verify).

All three carry `principles:` (≥2 entries) and `defaults:` blocks, and pass `workflow.validate()` cleanly.

## Discipline
- Stdout = pipeable output (YAML body, Mermaid source, table/JSON, `OK: name`).
- Stderr = progress (`created: ...`), warnings, errors.
- Exit-code matrix at top of `workflow.js`: 0 ok, 2 usage/validation/strict-warnings, 3 template-not-found, 6 file-exists conflict.

## Smoke-tested
Agent ran 18 scripted scenarios (USAGE, ls/show/validate happy + error, diagram for chain + parallel, init idempotency, new with conflict + `--force`, import valid + cycle-rejection, full `npm test`). All passed.

## Tests
Full `npm test` (31 files) remains 100% green — zero regressions. CLI-specific dryrun tests land in plan 41-03.

## Deviations
- **dev.yaml has 6 phases vs spec "5+"**: review phase added to demonstrate the `requesting-code-review` skill (kept within spirit of spec).
- **`diagram` root-node declaration line cosmetic**: multiple roots render on a single combined line (valid Mermaid).

## Notes for 41-03 (test writer)
1. `workflow init` works against `process.cwd()` (no `--projectDir` flag) — tests must `cd` to temp.
2. `validate` exit 2 covers usage errors AND validation errors — distinguish via stderr content.
3. `diagram` puts the `%% workflow: ...` comment on line 2 (after `flowchart TD`).
4. `ls` table output is alphabetically sorted (debug, dev, quick).
5. `import` destination name comes from the template's `workflow:` field when `--name` is absent (not source filename stem).
6. `new --from <built-in>` regex-rewrites only the `workflow:` line; rest is preserved verbatim.
