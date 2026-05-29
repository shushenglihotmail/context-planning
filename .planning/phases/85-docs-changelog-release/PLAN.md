---
phase: "85"
name: docs-changelog-release
milestone: v1.6 Workflow Contract Hardening
status: in-progress
created: 2026-05-29
base-commit: ff27c0d29d4edef12cc34ccb4ea02729c7820353
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
