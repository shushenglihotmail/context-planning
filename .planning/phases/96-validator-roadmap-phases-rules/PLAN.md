---
phase: "96"
name: validator-roadmap-phases-rules
milestone: Milestone workflow end-to-end + quick attach
status: complete
created: 2026-05-31
base-commit: 32d3ce994029276a2e98ef035dcdbad749a0f0f9
---

# Phase 96: validator-roadmap-phases-rules

Workflow validator hard-fails any `materialize: roadmap-phases` parent missing
`supervised: true` or a `parent: <id>` child template.

## Plans

- [x] 96-01: validator hard-fail for bad materialize roadmap-phases — f4b79c8

See `96-01-SUMMARY.md` for details.
