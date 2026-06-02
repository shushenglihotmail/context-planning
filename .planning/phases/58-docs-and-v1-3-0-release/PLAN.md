---
phase: "58"
name: Docs and v1.3.0 release
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 7e62b892a49c309de8439d3e65ea3ba0086f3273
expected_files:
  - CHANGELOG.md
  - MIGRATION-v1.3.md
  - README.md
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
  - templates/phase-templates/feature-execute.yaml
  - templates/phase-templates/feature-plan.yaml
  - templates/phase-templates/reviewer.yaml
  - templates/workflow-templates/_fixtures-v13/chain-1.yaml
  - templates/workflow-templates/_fixtures-v13/chain-2.yaml
  - templates/workflow-templates/_fixtures-v13/chain-3.yaml
  - templates/workflow-templates/_fixtures-v13/chain-4.yaml
  - templates/workflow-templates/review-and-address.yaml
  - templates/workflows/_examples/dev-templated.yaml
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
  - test/integration-dev-templated-equivalence.js
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

# Phase 58: Docs and v1.3.0 release

**Milestone**: v1.3 Reusable Phase Templates
**Created**: 2026-05-27

## Goal

Ship documentation for the new v1.3 template grammar, write a migration
guide for v1.2 → v1.3 (additive — no breaking changes), and tag v1.3.0.

## Success Criteria

1. README.md has a Reusable Phase Templates section covering `phase:` / `template:` wrappers, both template directories, and the new `cp phase-template` + `cp workflow-template` commands.
2. `MIGRATION-v1.3.md` exists, marks v1.3 as a strictly additive release, and points users at the new commands.
3. `package.json` version bumps to `1.3.0` and `CHANGELOG.md` has a `## v1.3.0` entry summarising the milestone.

## Plans

- [x] 58-01: Add README v1.3 section (template grammar + CLI commands)
- [x] 58-02: Write MIGRATION-v1.3.md
- [x] 58-03: Bump package.json to 1.3.0 + CHANGELOG entry

## Notes

v1.3 is strictly additive: no v1.2 workflow needs changes. The new
grammar is opt-in via the `phase:` / `template:` wrappers. Bare phase
entries continue to work unchanged.

