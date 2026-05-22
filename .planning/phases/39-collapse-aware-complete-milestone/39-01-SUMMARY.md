---
plan: 39-01
goal: Fix collapse-aware milestone close
outcome: Done — published v0.10.1
key-decisions:
  - "findMilestoneInRoadmap now ALSO walks <summary> lines, not just ### markdown headings — single-source detection for collapsed milestones"
  - statusReport STATE.md fallback ignores placeholder values (-/Idle/None) to avoid false positives in fresh repos
  - alreadyShipped:true is a clean no-op exit 0 — no --force flag needed because idempotency is the desired contract
files-touched:
  - lib/milestone.js
  - lib/lifecycle.js
  - test/unit-collapse-aware.js
  - CHANGELOG.md
  - package.json
phase: 39
completed: 2026-05-22
key-files:
  created:
    - test/unit-collapse-aware.js
  modified:
    - CHANGELOG.md
    - lib/lifecycle.js
    - lib/milestone.js
    - package.json
end-commit: ea9388a80a4b17ffc7b07d190fc39919e9787755
---
# Summary 39-01

Plan 39-01 completed.
