---
subsystem: milestone
tags:
  - v0.8
  - P3
  - prevent
  - drift
requires:
  - v0.7 ValidationError pattern
  - v0.8 P2 auto-fill (Phase 18)
provides:
  - lib/milestone.js::_checkKeyFilesExist
  - writeSummary file-existence hard-block
  - checkFileExistence option
affects: []
key-decisions:
  - "Block-then-explain pattern (mirrors key-decisions hard-block from v0.7) chosen over warn-only and auto-strip alternatives — drift cause #1 needs surfacing not hiding"
  - Check runs AFTER P2 auto-fill so diff-derived entries (always real) are exempt; only caller-supplied phantoms trigger
  - Both writeSummary code paths (lib/milestone.js + lib/lifecycle.js) extended in lockstep per the convention from phases 17/18
  - Error message lists ALL missing paths in one shot (not just first) so agent can fix everything in one re-try
  - Absolute paths checked as-is (not joined with root); supports rare absolute key-files entries
  - Existing tests that wrote phantom paths (src/a.js, src/b.js) updated to pre-create files OR opt out — surfaces test intent (existence vs union semantics)
patterns-established:
  - "Helper signature: _checkKeyFilesExist(normalised, root, opts?) -> { missing: [{path, kind}] } — pure, never throws, caller decides ValidationError"
  - Error message format includes opt-out hint (--no-file-check) so users discover the escape hatch
  - "checkFileExistence: false short-circuits the helper at the top (no work done on opt-out)"
requirements-completed:
  - P3 file-existence hard-block
duration: 1 session
phase: 19
plan: 19-01
completed: 2026-05-21
key-files:
  created: []
  modified:
    - bin/commands/write-summary.js
    - lib/lifecycle.js
    - lib/milestone.js
    - test/dryrun-write-summary.js
    - test/unit-lifecycle.js
end-commit: e0f0fd0fbfbcd4276d004c5d9e1d94e4042d11e9
---
# Summary 19-01

Plan 19-01 completed.
