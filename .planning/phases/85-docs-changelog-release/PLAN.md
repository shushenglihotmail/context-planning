---
phase: "85"
name: docs-changelog-release
milestone: v1.6 Workflow Contract Hardening
status: in-progress
created: 2026-05-29
base-commit: ff27c0d29d4edef12cc34ccb4ea02729c7820353
expected_files:
  - bin/commands/index.js
  - bin/commands/run-finalize.js
  - bin/commands/run.js
  - bin/commands/workflow.js
  - lib/runtime.js
  - lib/workflow-template-expand.js
  - lib/workflow.js
  - test/dryrun-workflow-cli.js
  - test/fixtures/workflows/dev-mini.yaml
  - test/fixtures/workflows/quick-mini.yaml
  - test/integration-format-instruction-skills.js
  - test/integration-runtime.js
  - test/unit-run-lifecycle.js
  - test/unit-workflow-auto-inject-finalize.js
  - test/unit-workflow-template-expand.js
---

# Phase 85: docs-changelog-release

**Milestone**: v1.6 Workflow Contract Hardening
**Created**: 2026-05-29

## Goal

Ship v1.6.0: update CHANGELOG with D1–D4 entry, refresh README for
`cp run-finalize` + auto-inject + skill-invocation contract, bump
package.json to 1.6.0, publish to npm.

## Success Criteria

1. CHANGELOG.md has a complete `[1.6.0]` section covering D1, D2, D3, D4.
2. README.md documents `cp run-finalize`, auto-injection, and the
   `invoke skill:` directive.
3. `package.json` version is `1.6.0`; `npm publish` succeeds.

## Plans

- [x] 85-01: Docs + version bump + npm publish

## Notes

<!-- Free-form during phase execution. -->
