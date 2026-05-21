---
status: complete
summary: Added Step 1.5 Auto-init to commands/cp/map-codebase.md. Skill detects missing .planning/PROJECT.md and runs cp init with mandatory notice before scaffold-codebase. Updated brownfield bootstrap note to single-command order. Tests green (43 files).
plan: 32-01
key-decisions:
  - Auto-init invokes cp init (not a custom mini-init) — cp init is already idempotent and additive so re-runs are safe
  - Notice line is mandatory before invoking cp init; never auto-init silently — users must understand new files appearing in their repo
  - No installer.js changes — installers re-read commands/cp/*.md at install time, so editing the skill source propagates on next cp install
phase: "32"
key-files:
  - commands/cp/map-codebase.md
duration: 15m
completed: 2026-05-21
end-commit: 4ebd7cc7ff09f61ea214d0b219d9da82295434e7
---
# Summary 32-01

Plan 32-01 completed.
