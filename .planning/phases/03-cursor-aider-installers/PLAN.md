---
phase: "3"
name: Cursor + Aider installers
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-20
base-commit: 9d57b67aaefc56cfc9ee2c78c9a79471b79c4b3b
---

# Phase 3: Cursor + Aider installers

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-20

## Goal

Ship `cp install cursor` and `cp install aider` — extend the harness installer set beyond Copilot CLI and Claude Code to cover Cursor IDE (`.cursor/rules/*.mdc`) and Aider (`.aider/CP-CONTEXT.md` + `.aider.conf.yml` patch). Both inherit the v0.3.4 collision protection.

## Success Criteria

1. `cp install cursor` writes `.cursor/rules/cp-*.mdc` with YAML frontmatter (`description:`, `alwaysApply: true|false`); ambient rule on, per-command rules off.
2. `cp install aider` writes `.aider/CP-CONTEXT.md` briefing + per-command files and patches `.aider.conf.yml` with a fenced `read:` block.
3. Both honor `--force` and `writeFileSafe` collision protection; exit 3 if any file is kept user-modified.

## Plans

- [x] 03-01: `install/cursor.js` with `buildRule()` frontmatter synthesis
- [x] 03-02: `install/aider.js` with `buildContextBriefing()` + `patchAiderConfig()` + `test/unit-installers.js` (50 assertions)

## Notes

<!-- Free-form during phase execution. -->
