---
phase: "56"
name: CLI commands for templates
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 11bc766895f060a3e948aff58560a66705fcf53e
expected_files:
  - bin/commands/_usage.js
  - bin/commands/index.js
  - bin/commands/phase-template.js
  - bin/commands/workflow-template.js
  - bin/commands/workflow.js
  - lib/phase-template-loader.js
  - lib/phase-template-resolver.js
  - lib/template-substitute.js
  - lib/workflow-template-expand.js
  - lib/workflow-template-loader.js
  - lib/workflow.js
  - package.json
  - templates/phase-templates/_fixtures-v13/chain-a.yaml
  - templates/phase-templates/_fixtures-v13/chain-b.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-1.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-2.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-3.yaml
  - templates/phase-templates/_fixtures-v13/chain-deep-4.yaml
  - templates/phase-templates/reviewer.yaml
  - templates/workflow-templates/_fixtures-v13/chain-1.yaml
  - templates/workflow-templates/_fixtures-v13/chain-2.yaml
  - templates/workflow-templates/_fixtures-v13/chain-3.yaml
  - templates/workflow-templates/_fixtures-v13/chain-4.yaml
  - templates/workflow-templates/review-and-address.yaml
  - templates/workflows/_fixtures-v13/bare-v12.yaml
  - templates/workflows/_fixtures-v13/chain-depth-exceeded.yaml
  - templates/workflows/_fixtures-v13/chain-depth-ok.yaml
  - templates/workflows/_fixtures-v13/error-phase-template-override.yaml
  - templates/workflows/_fixtures-v13/error-template-with-prompt.yaml
  - templates/workflows/_fixtures-v13/missing-required-arg.yaml
  - templates/workflows/_fixtures-v13/template-include-stub.yaml
  - templates/workflows/_fixtures-v13/unused-arg.yaml
  - templates/workflows/_fixtures-v13/uses-phase-template.yaml
  - templates/workflows/_fixtures-v13/uses-workflow-template.yaml
  - templates/workflows/_fixtures-v13/wf-chain-depth-exceeded.yaml
  - templates/workflows/_fixtures-v13/wf-chain-depth-ok.yaml
  - templates/workflows/_fixtures-v13/wf-group-id-collision.yaml
  - templates/workflows/_fixtures-v13/wrapped-phase.yaml
  - test/dryrun-template-cli-v13.js
  - test/integration-phase-templates-v13.js
  - test/integration-workflow-templates-v13.js
  - test/integration-workflow-v13.js
  - test/unit-phase-template-loader.js
  - test/unit-phase-template-resolver.js
  - test/unit-template-substitute.js
  - test/unit-workflow-schema-v13.js
  - test/unit-workflow-template-expand.js
  - test/unit-workflow-template-loader.js
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

