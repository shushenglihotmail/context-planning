---
phase: "46"
name: Docs + MIGRATION-v1.1.md + v1.1.0 release
milestone: v1.1 Workflow Skills
status: in-progress
plan-status:
  46-01: complete
  46-02: complete
  46-03: pending
created: 2026-05-25
base-commit: ce06ed62fb23b1dc8f5d16fa76abfdd9633dfbc7
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

# Phase 46: Docs + MIGRATION-v1.1.md + v1.1.0 release

**Milestone**: v1.1 Workflow Skills
**Created**: 2026-05-25

## Goal

Ship v1.1.0 to npm with complete documentation of the new agent-side
workflow surface: 5 new `cp-workflow-*` skills, new `cp workflow export`
CLI subcommand, and a migration guide for users upgrading from v1.0.

## Success Criteria

1. README.md documents the new agent skills (`/cp-workflow-run`,
   `/cp-workflow-list`, `/cp-workflow-resume`, `/cp-workflow-new`,
   `/cp-workflow-customize`) and the new `cp workflow export` CLI.
2. `MIGRATION-v1.1.md` exists at repo root explaining the v1.0 → v1.1
   delta: what's new, what's deferred (cp-quick/cp-autonomous unchanged),
   how to discover the new skills.
3. `CHANGELOG.md` has a v1.1.0 entry listing all phase 43 + phase 44
   shipped features.
4. `npm test` passes (regression check).
5. `package.json` version is `1.1.0`.
6. v1.1.0 published to npm and tagged `v1.1.0` on git.

## Plans

- [x] 46-01: README.md + docs/ updates — document 5 new `cp-workflow-*` agent skills and new `cp workflow export` CLI subcommand.
- [x] 46-02: MIGRATION-v1.1.md (new file) + CHANGELOG.md v1.1.0 entry — explain v1.0 → v1.1 delta, what's new, what's deferred, discovery path for new skills.
- [ ] 46-03: Version bump to 1.1.0, full `npm test` green, `git tag v1.1.0`, `npm publish`.

## Notes

- Phase 45 was deferred to v1.2 after design review (see milestone DESIGN.md
  for rationale). v1.1 ships the new agent surface without refactoring the
  legacy cp-quick / cp-autonomous skills.
- `MIGRATION-v1.0.md` and `CHANGELOG.md` already exist — follow their
  existing structure for the v1.1 additions.

