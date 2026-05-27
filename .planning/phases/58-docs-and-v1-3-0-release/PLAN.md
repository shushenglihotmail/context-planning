---
phase: "58"
name: Docs and v1.3.0 release
milestone: v1.3 Reusable Phase Templates
status: in-progress
created: 2026-05-27
base-commit: 7e62b892a49c309de8439d3e65ea3ba0086f3273
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

