---
plan: 37-01
goal: Ship /cp-autonomous slash skill
outcome: Done
key-decisions:
  - Skill is outer orchestrator; CLI runAutonomous reserved for --check + lib unit tests
  - Smart gates in skill loop (after each plan tick) use cp audit + config.test_command — no agent reasoning needed
  - Stop UX uses ask_user with reason-tailored choices; never exit session
  - No installer.js edit — install/*.js auto-walk commands/cp/
files-touched:
  - commands/cp/autonomous.md
phase: 37
completed: 2026-05-21
key-files:
  created:
    - bin/commands/autonomous.js
    - commands/cp/autonomous.md
    - lib/autonomous.js
    - test/unit-autonomous.js
  modified:
    - bin/commands/_usage.js
    - bin/commands/index.js
    - package.json
end-commit: 38fcb81128dcf09ddab3529740ed3150301fc2fa
---
# Summary 37-01

Plan 37-01 completed.
