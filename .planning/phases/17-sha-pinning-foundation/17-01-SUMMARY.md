---
subsystem: tooling
tags:
  - sha-pinning
  - git
  - v0.8
  - p1
requires: []
provides:
  - lib/git.js::headSha
  - base-commit frontmatter on PLAN.md
affects:
  - lib/git.js
  - lib/lifecycle.js
  - templates/phase-PLAN.md
  - test/unit-git-sha.js
  - test/unit-lifecycle.js
  - package.json
tech-stack:
  added: []
  patterns:
    - spawnSync no-shell wrapper
    - one-shot stderr warn flag
key-files:
  created:
    - lib/git.js
    - test/unit-git-sha.js
  modified:
    - lib/lifecycle.js
    - templates/phase-PLAN.md
    - test/unit-lifecycle.js
    - package.json
key-decisions:
  - headSha is a pure helper (no caching); caller passes cwd explicitly
  - Single stderr warning per process when git is missing (not per call)
  - "Forward-only stamping: null SHA leaves template comment line in place, never throws"
  - Template comment line is the visible signal that base-commit is unset (vs accidental loss)
patterns-established:
  - "v0.8 SHA pinning frontmatter convention: base-commit on PLAN.md, end-commit on SUMMARY.md (added in 17-02)"
requirements-completed:
  - "v0.8 P1 part 1 of 2: base-commit on PLAN.md"
duration: 45min
phase: 17
plan: 17-01
completed: 2026-05-21
end-commit: 718d3c0c43cc1bfcb38a33234ecab49873b80d2a
---
# Plan 17-01 Summary — lib/git.js::headSha + scaffoldPhase base-commit stamping

## Accomplishments

- Established the v0.8 P1 SHA pinning foundation, half 1 of 2.
- New pure helper lib/git.js::headSha({ cwd? }) -> string|null wraps
  `git rev-parse HEAD` with spawnSync (no shell), never throws, returns
  null when git is unavailable / no commits exist / cwd is not a repo.
  Single stderr warning per process when git is missing.
- `lib/lifecycle.js::scaffoldPhase` now stamps `base-commit: <sha>`
  into PLAN.md frontmatter after the `created:` line, between template
  render and the disk write. Forward-only: null result leaves the
  template's `# base-commit stamped by ...` comment line in place.
- Template `templates/phase-PLAN.md` updated with the signaling comment.

## Task Commits

- 881c611 — cp(17-01): add lib/git.js::headSha + scaffoldPhase base-commit stamping

## Files Created / Modified

- `lib/git.js` (new, 79 LOC) — headSha helper, one-shot warn flag,
  _resetWarnedForTests test export
- `lib/lifecycle.js` (+12 LOC) — git require + base-commit injection
  in scaffoldPhase
- `templates/phase-PLAN.md` — added frontmatter comment line
- `test/unit-git-sha.js` (new, 8 assertions) — SHA shape, null paths,
  warning de-dupe, never-throws contract
- `test/unit-lifecycle.js` (+7 assertions in 2 new sections) —
  scaffoldPhase base-commit stamping happy path + non-git-dir fallback
- `package.json` — wired unit-git-sha.js into `npm test`

## Decisions Made

See key-decisions in frontmatter. Notable: chose template-comment-replaced
approach over conditional template rendering to keep the substitution
purely string-level (no YAML parser in the hot path).

## Deviations from Plan

None — implemented exactly as planned in 17-PLAN.md.

## Issues Encountered

None.

## Next Phase Readiness

Plan 17-02 (writeSummary end-commit stamping) ready to proceed using the
same pattern. No blockers.
