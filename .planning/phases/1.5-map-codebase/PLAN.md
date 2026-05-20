---
phase: "1.5"
name: Map codebase
milestone: v0.4 — Polish & Capture
status: in-progress
created: 2026-05-20
---

# Phase 1.5: Map codebase

**Milestone**: v0.4 — Polish & Capture
**Created**: 2026-05-20

## Goal

Add `/cp-map-codebase` — analyse an existing repo with 4 parallel sub-agents and write 7 prescriptive docs under `.planning/codebase/` (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, CONCERNS). Closes the "brownfield" gap so cp can be dropped onto an existing repo.

## Success Criteria

1. `cp scaffold-codebase --force` resets the 7 stub files from templates.
2. `cp codebase-status` reports `filled` vs `stub` per doc with line/byte counts.
3. The slash command body dispatches 4 parallel `task` sub-agents (tech, arch, quality, concerns), each writing 1–2 docs.

## Plans

- [x] 1.5-01: `lib/codebase-mapper.js` + 7 template stubs in `templates/codebase/`
- [x] 1.5-02: `cp scaffold-codebase` + `cp codebase-status` CLI handlers
- [x] 1.5-03: `/cp-map-codebase` slash command with 4-agent parallel dispatch protocol

## Notes

<!-- Free-form during phase execution. -->
