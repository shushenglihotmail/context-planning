---
subsystem: tooling
tags:
  - workflow
  - custom-tier
  - state
  - atomic-write
  - lifecycle
requires: []
provides:
  - custom.createRun
  - custom.listRuns
  - custom.readState
  - custom.writeState
  - custom.writePhaseSummary
  - custom.pruneAbandoned
  - custom.runDir
affects:
  - lib/custom.js
  - test/unit-custom.js
  - package.json
tech-stack:
  added: []
  patterns:
    - date-prefixed slug with collision suffix
    - shallow-merge-with-special-cases writeState patch
    - dry-run-by-default destructive ops
    - STATE.yaml as canonical state file (matches template format)
key-files:
  created:
    - lib/custom.js
    - test/unit-custom.js
  modified:
    - package.json
key-decisions:
  - STATE.yaml stays YAML (not JSON) for symmetry with workflow templates and easy hand-editing during recovery
  - writeState ALWAYS overwrites last_activity regardless of patch contents — matches the file's name semantics and removes a footgun where callers forget to bump it
  - artifacts gets shallow-merged (existing entries preserved); other top-level keys overwrite — minimum surprise for the common 'append phase' case
  - "pruneAbandoned defaults to dry-run; {apply: true} required to actually delete — matches cp's safety.always_confirm_destructive convention"
  - Slug collision suffix starts at -2 (not -1) — base name has no suffix, collision starts immediately at -2/-3/...
patterns-established:
  - "Custom-tier directory layout: .planning/custom/<YYYY-MM-DD-slug>/STATE.yaml + NN-<phase-id>.md per phase"
  - "STATE.yaml canonical shape: workflow, slug, status (in-progress|done|abandoned), binding (custom), started, last_activity, current_phase, completed[], artifacts{}"
requirements-completed: []
duration: 11min
end-commit: ce68311
phase: 40
plan: 40-03
completed: 2026-05-25
---
# Summary 40-03

## Goal

Implement `lib/custom.js` — the custom-tier state manager for
`.planning/custom/<slug>/` workflow runs. Pure I/O over a known layout.
Plus a comprehensive unit test.

## Outcome

Shipped. `lib/custom.js` exposes the seven public functions specified in the
phase DESIGN.md contract; 58 assertions pass standalone and in the full
`npm test` chain (`unit-custom: 58 passed`). No regressions.

## Task Commits

- `6c47edf` test(40-03): add unit-custom test scaffolding
- `441f002` feat(40-03): implement lib/custom.js
- `ce68311` test(40-03): wire unit-custom.js into npm test chain

## Files Created

- `lib/custom.js` — module
- `test/unit-custom.js` — 58 assertions across 8 sections

## Files Modified

- `package.json` — added `node test/unit-custom.js` to the npm test chain.

## Decisions Made

- **YAML over JSON for STATE** — keeps a single format across templates and state, friendlier for hand-editing when recovering a stuck run.
- **`writeState` always bumps `last_activity`** — the file's name implies it; making it unconditional removes a caller footgun where someone updates `status` and forgets the timestamp.
- **Shallow-merge for `artifacts`** — single-level merge preserves the common case of appending one phase's artifact without clobbering earlier ones. Other top-level keys get straight overwrite per the patch.
- **Dry-run by default for `pruneAbandoned`** — `{apply: true}` required to actually delete. Mirrors cp's `safety.always_confirm_destructive` setting.
- **Slug collision suffix starts at `-2`** — first run has no suffix; only collisions get `-2`, `-3`, etc. Matches user intuition that a unique slug shouldn't carry a numeric tail.

## Deviations

None. Contract from `.planning/phases/40-core-engine-custom-tier/DESIGN.md` was implemented as written.

## Issues

None.

## Next Phase Readiness

Plan 40-02 (`lib/runtime.js`) can now require `custom.createRun`, `custom.writeState`, `custom.writePhaseSummary`, etc. for the `binds_to: custom` path. The STATE.yaml shape is now the consumption contract for the runtime's custom-tier branch.
