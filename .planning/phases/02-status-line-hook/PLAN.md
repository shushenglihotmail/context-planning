---
phase: "2"
name: Status-line hook
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-19
---

# Phase 2: Status-line hook

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-19

## Goal

Ship `cp statusline` — a fast one-line "you are here" string suitable for shell PS1, Starship, tmux, or Copilot CLI statusline integration. Must be silent outside cp projects.

## Success Criteria

1. `cp statusline` prints `<milestone> · <phase> · <plan-id> <next-plan-name>` with ANSI color when `process.stdout.isTTY`.
2. Honors `--format`, `--json`, `--no-color`, and `NO_COLOR` env var.
3. Exits 0 with no output when called outside a git repo or in a repo without `.planning/ROADMAP.md` (safe for every-keystroke PS1).

## Plans

- [x] 02-01: `cmdStatusline` handler in `bin/cp.js` with token format `%M %P %D %N %B`
- [x] 02-02: `test/unit-statusline.js` (28 assertions) — silent-outside-project invariant + color gating

## Notes

<!-- Free-form during phase execution. -->
