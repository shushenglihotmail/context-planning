---
title: Deprecate cp-plan-phase skill and retire references across cp-*
one-liner: cp-plan-phase is a deprecation stub in v1.2; all other cp-* skills now point at /cp-autonomous or /cp-execute-phase.
what-shipped: "commands/cp/plan-phase.md replaced with deprecation notice + migration alias. Frontmatter sets deprecated: true. Every cp-* skill markdown that referenced /cp-plan-phase (new-milestone, new-project, execute-phase, progress, map-codebase, capture) updated to point at /cp-autonomous. lib/lifecycle.js + lib/milestone.js + bin/commands/init.js + bin/commands/status.js error/help text now suggest cp scaffold-phase or /cp-autonomous. test/dryrun-progress.js suggested-next branch updated. commands/cp/autonomous.md legacy pass-through now self-announces a v1.3-removal deprecation warning at runtime."
key-decisions:
  - "Keep the cp-plan-phase skill file registered (deprecated: true) instead of deleting it. Users who type /cp-plan-phase get a clear nudge rather than a 'skill not found' error. Removal moves to v1.3."
  - Leave the autonomous legacy pass-through CODE in place for v1.2 — this very milestone (v1.2) was scaffolded the legacy way, so removing the pass-through would break the self-host. Pass-through prints a one-time deprecation warning when it fires; removal is now scheduled for v1.3 in writing.
  - Test/install briefing (test/unit-installers.js) still mentions /cp-plan-phase by name because the installer iterates the skill files it finds. Kept the test as-is — the briefing surfacing a deprecated skill is correct behavior.
  - Error messages route to cp scaffold-phase (low-level) rather than /cp-autonomous (high-level) because they fire from lib code that can't assume a provider is available.
key-files:
  - commands/cp/plan-phase.md
  - commands/cp/autonomous.md
  - commands/cp/new-milestone.md
  - commands/cp/new-project.md
  - commands/cp/execute-phase.md
  - commands/cp/progress.md
  - commands/cp/map-codebase.md
  - commands/cp/capture.md
  - lib/lifecycle.js
  - lib/milestone.js
  - bin/commands/init.js
  - bin/commands/status.js
  - test/dryrun-progress.js
phase: 51
plan: 51-04
completed: 2026-05-26
end-commit: 9e0ae916d6fbc94a740f662ef8bdaac86db55c3c
---
# Summary 51-04

Plan 51-04 completed.
