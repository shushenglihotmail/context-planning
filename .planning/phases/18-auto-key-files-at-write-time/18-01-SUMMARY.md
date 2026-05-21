---
subsystem: milestone
tags:
  - v0.8
  - P2
  - prevent
  - drift
requires:
  - lib/git.js::headSha (v0.8 P1)
  - fm.parse round-trip
  - PLAN.md base-commit frontmatter
provides:
  - lib/git.js::diffNameOnly
  - lib/milestone.js::_extractPhaseBaseCommit
  - lib/milestone.js::_autoFillKeyFiles
  - writeSummary autoKeyFiles option
affects: []
key-decisions:
  - Renames + copies normalised to status=M with new-path only (one entry, deliverable-focused)
  - Caller-supplied key-files entries are preserved verbatim and deduped against diff entries
  - .planning/ paths filtered out at union step (cp bookkeeping is not phase deliverable)
  - auto-fill is silent when base-commit is absent (forward-compat with pre-v0.8 PLAN.md)
  - Both writeSummary code paths (lib/milestone.js + lib/lifecycle.js) extended in lockstep to avoid divergence
  - endSha computed once near top of writeSummary and reused for both stamping (P1) and diff (P2)
patterns-established:
  - "stderr notice format: cp: key-files auto-filled (N files: X created, Y modified)"
  - Pure helpers (_extractPhaseBaseCommit, _autoFillKeyFiles) exported for direct unit testing
  - "Test fixture pattern: seed file in base commit, stamp base-commit into PLAN.md, then make work commits between base and HEAD"
requirements-completed:
  - P2 auto-fill key-files at write-time
duration: 1 session
phase: 18
plan: 18-01
completed: 2026-05-21
key-files:
  created:
    - test/dryrun-write-summary.js
  modified:
    - bin/commands/write-summary.js
    - lib/git.js
    - lib/lifecycle.js
    - lib/milestone.js
    - package.json
    - test/unit-git-sha.js
    - test/unit-lifecycle.js
end-commit: abd8fecad10f2bc239d7e6541a18923a41cd40fd
---
# Summary 18-01

Plan 18-01 completed.
