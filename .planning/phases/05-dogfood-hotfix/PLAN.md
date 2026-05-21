---
phase: "5"
name: Dogfood hotfix
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-20
base-commit: 9d57b67aaefc56cfc9ee2c78c9a79471b79c4b3b
---

# Phase 5: Dogfood hotfix

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-20

## Goal

Live-dogfood `/cp-map-codebase --force` against v0.4.3 source, surface real concerns, ship fixes for both HIGH items as v0.4.4.

## Success Criteria

1. 7/7 codebase docs filled by 4 parallel mapper sub-agents.
2. `install/aider.js patchAiderConfig` parses YAML (preserves user `read:` entries); legacy fenced blocks auto-migrated.
3. `lib/worktree.js` owns the git shell-outs (`runGitWorktreeAdd/Remove`, `listGitWorktrees`); `bin/cp.js` handlers route through lib.

## Plans

- [x] 05-01: `install/aider.js` → switch to `yaml` parser + auto-migrate legacy fenced blocks (+8 test assertions)
- [x] 05-02: `lib/worktree.js` → extract `runGitWorktreeAdd/Remove` + `listGitWorktrees` from `bin/cp.js` (+6 test assertions)

## Notes

<!-- Free-form during phase execution. -->
