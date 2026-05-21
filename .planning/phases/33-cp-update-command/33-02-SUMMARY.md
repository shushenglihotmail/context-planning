---
status: complete
duration: 25m
key-files:
  - commands/cp/update.md
  - README.md
  - CHANGELOG.md
key-decisions:
  - Skill follows pre-flight -> cp update --json -> structured-summary template — matches /gsd-update's 4-step shape but cp-flavored
  - README restructured to lead with npx one-liner; manual per-verb steps demoted to alternatives — most users want one-liner per user feedback
  - No CHANGELOG version bump in this plan — 33-02 lands in [Unreleased]; version bump happens at milestone close in a future phase or release plan
plan: 33-02
phase: "33"
summary: Added /cp-update slash skill in commands/cp/update.md (4146 chars). All four installers ship it on next install via listCommandFiles. README 'Updating an existing install' rewritten around npx one-liner as primary path; demoted manual flow to alternative. CHANGELOG [Unreleased] documents cp update + /cp-update skill + map-codebase auto-init. Full test suite green.
completed: 2026-05-21
end-commit: fd519aea2030fcf0e6b88dea4f348a059d20bdc9
---
# Summary 33-02

Plan 33-02 completed.
