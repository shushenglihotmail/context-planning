---
phase: "4"
name: git worktree integration
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-20
base-commit: 9d57b67aaefc56cfc9ee2c78c9a79471b79c4b3b
---

# Phase 4: git worktree integration

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-20

## Goal

Ship `cp worktree {create,list,remove}` — wrap `git worktree` with cp-aware defaults (sibling-directory layout, `cp/<slug>` branch name) and record each worktree in `.planning/WORKTREES.md`. `--use-provider` opt-in delegates to Superpowers' `using-git-worktrees` skill.

## Success Criteria

1. `cp worktree create <name>` runs `git worktree add <sibling-dir> -b cp/<slug>` and appends a row to `.planning/WORKTREES.md`, scoped-committed.
2. `cp worktree list [--json]` cross-references registered worktrees against `git worktree list --porcelain` (✓ on disk / ✗ missing).
3. `cp worktree remove <slug> [--force]` runs `git worktree remove` and drops the registry entry.

## Plans

- [x] 04-01: `lib/worktree.js` (~190 LOC) + `bin/cp.js cmdWorktree{Create,List,Remove}` + `test/unit-worktree.js` (56 assertions)

## Notes

<!-- Free-form during phase execution. -->
