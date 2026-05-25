---
subsystem: testing
tags:
  - installer
  - integration
  - cp-workflow-skills
requires:
  - 43-01
  - 43-02
  - 43-03
provides:
  - installer-coverage-cp-workflow-skills
  - integration-coverage-cp-workflow-skills
affects:
  - test/unit-v034.js
  - test/integration-workflow-skills.js
  - package.json
tech-stack:
  added: []
  patterns:
    - spawnSync-CLI-integration
    - frontmatter-shape-assertions
key-files:
  created:
    - test/integration-workflow-skills.js
  modified:
    - test/unit-v034.js
    - package.json
key-decisions:
  - Added installer auto-pickup assertions in test/unit-v034.js (not test/unit-installers.js as DESIGN.md suggested) because copilot/claude installer e2e coverage already lived in unit-v034.js. Documented as plan-level deviation.
  - Normalised CRLF to LF when asserting on skill markdown body so tests pass on Windows.
  - "integration-workflow-skills.js covers the slices integration-run-cli.js does not: skill source shape, named slug honour, and abandon-flow status transition."
patterns-established:
  - "New cp-* agent skill must ship with both a unit-v034.js installer assertion (3 per skill: file exists in copilot tree, file exists in claude tree, frontmatter name matches file) and at least one shape-of-skill assertion in integration-workflow-skills.js."
requirements-completed:
  - v1.1 phase 43
duration: 35min
phase: 43
plan: 43-04
completed: 2026-05-25
end-commit: 8d525f01d1ec5b31de2693e45477fb0b6964aee4
---
## Accomplishments

Added installer auto-pickup tests (12 assertions) and a dedicated
integration test (26 assertions) for the three v1.1 cp-workflow-* skills
shipped in plans 43-01/02/03. Wired the new integration test into the
`npm test` script. Full suite stays green (passed counts across all
~50 test files, zero failures).

## Task Commits

- 9b7e15e cp: start 43-04 execution
- 8d525f0 test(43-04): add cp-workflow-* skill installer + integration tests

## Files Created

- test/integration-workflow-skills.js — 26 assertions across 3 sections:
  1. Skill source files well-formed (frontmatter present + closed,
     `name:` matches file, `description:` populated, body has numbered
     Step sections)
  2. `cp run quick <name>` honours the requested slug name
  3. `cp run abandon <slug> --yes` flips status to `abandoned` in
     `cp run status --json`

## Files Modified

- test/unit-v034.js — appended a new section asserting both copilot and
  claude installers materialise cp-workflow-run/list/resume into their
  respective trees with correct frontmatter `name:` keys (12 assertions).
- package.json — appended `&& node test/integration-workflow-skills.js`
  to the `test` script after `integration-run-cli.js`.

## Decisions Made

- Installer assertions went into `test/unit-v034.js` instead of
  `test/unit-installers.js` (as suggested in DESIGN.md). Reason: the
  existing copilot + claude installer e2e coverage already lived in
  unit-v034.js, so co-locating the new assertions is cleaner than
  duplicating fixtures. Plan-level deviation, intentional.
- Normalise CRLF → LF when asserting on skill markdown body content so
  the tests pass on Windows checkouts.

## Deviations

- File location of installer assertions (see above).

## Issues

None.

## Next Phase Readiness

Phase 43 is now functionally complete: all three consumer skills are
shipped, tested at the installer layer, and the CLI surface they assume
(quick named slug + abandon flow) is exercised end-to-end.

Phase 44 (creator skills: cp-workflow-new + cp-workflow-import) is
unblocked. **Note**: user has approved an in-flight scope expansion —
phase 44 will also add a `cp workflow export <name> [--as <new-name>]`
CLI command and rename the import skill to `cp-workflow-customize`
(covering the export → edit → import round-trip in one skill).