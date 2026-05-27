---
phase: "56"
name: CLI commands for templates
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 11bc766895f060a3e948aff58560a66705fcf53e
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

# Phase 56: CLI commands for templates

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Add `cp phase-template` and `cp workflow-template` command groups that mirror
the existing `cp workflow` UX (`ls`, `show`, `new`) so users can discover,
inspect, and scaffold phase-templates and workflow-templates. Extend
`cp workflow inspect` to surface the post-expansion resolved phase list
so users can preview the result of template inclusion before running.

## Success Criteria

1. `cp phase-template ls [--json]` lists built-in + project phase-templates.
2. `cp phase-template show <name>` prints a phase-template's YAML.
3. `cp workflow-template ls [--json]` and `cp workflow-template show <name>` mirror the above for workflow-templates.
4. `cp phase-template new <name> [--from <built-in>] [--force]` and `cp workflow-template new <name> [--from <built-in>] [--force]` scaffold starter files into the project's `.planning/phase-templates/` or `.planning/workflow-templates/` directory.
5. `cp workflow inspect <name> [--json]` shows the resolved (post-expansion) phase list, including prefixed template ids and rewritten `after:` edges, when the workflow uses templates.

## Plans

- [x] 56-01: `cp phase-template ls` + `show` commands (lib/commands/phase-template.js)
- [x] 56-02: `cp workflow-template ls` + `show` commands (lib/commands/workflow-template.js)
- [x] 56-03: `cp phase-template new` + `cp workflow-template new` scaffolders
- [x] 56-04: Extend `cp workflow inspect` to print post-expansion resolved phases
- [x] 56-05: Integration tests + help-text wiring (bin/commands/_usage.js, index.js)

## Notes

- Lookup precedence per DESIGN.md Q2: project (`.planning/...`) shadows builtin (`templates/...`); a `(builtin)` / `(project)` tag should appear in `ls` output.
- Mirror existing `cp workflow ls/show/new` patterns from `bin/commands/workflow.js` rather than inventing new conventions.
- `inspect`'s post-expansion section should be additive — don't break the existing pre-expansion wave display, which is still useful for v1.2 workflows.

