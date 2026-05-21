---
phase: "31"
name: Docs + v0.8.0 release
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-22
base-commit: d21ef62e12738e51ac258b22fa53186f4335d366
expected-key-files:
  "31-01":
    - docs/drift-playbook.md
    - README.md
  "31-02":
    - CHANGELOG.md
    - package.json
---

# Phase 31 — Docs + v0.8.0 release

**Design**: see [DESIGN.md](./DESIGN.md)

## Plans

- [x] 31-01: docs/drift-playbook.md + README "Drift defense" section
- [x] 31-02: CHANGELOG finalize + version bump + npm publish prep

## Notes

After 31-02 ticks, user runs `npm publish` interactively (2FA, account
credentials). Then `cp complete-milestone v0-8-consistency` rolls up
to MILESTONES.md.
