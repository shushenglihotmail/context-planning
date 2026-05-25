---
subsystem: tooling
tags:
  - agent-skill
  - workflow
  - customize
  - round-trip
requires:
  - 44-01
provides:
  - cp-workflow-customize-skill
affects:
  - commands/cp/workflow-customize.md
tech-stack:
  added: []
  patterns:
    - agent-skill-numbered-steps
    - round-trip-export-import
key-files:
  created:
    - commands/cp/workflow-customize.md
  modified: []
key-decisions:
  - Skill replaces the originally-planned cp-workflow-import — pure import would have been a thin LLM-less wrapper; customize is the actual user task. User-approved in mid-43-04 conversation.
  - "Skill is interactive-first: missing built-in or new-name prompts the user with a menu rather than failing — discoverability over strict argv."
  - Step 7 validates by PATH (not name) because the template is not yet registered. Both forms are accepted by cp workflow validate.
  - Skill ends with a re-customize hint pointing users at 'cp workflow import <path> --force' for later iterations without re-walking the full export step.
patterns-established:
  - "Interactive-first agent skills: when a required argv is missing, present an enumerated picker via cp workflow ls --json rather than printing usage and exiting."
requirements-completed: []
duration: 15min
phase: 44
plan: 44-03
completed: 2026-05-25
end-commit: 0e27fc498c35f007d1e74077d22602b49fb2ba55
---
## Accomplishments

Shipped the cp-workflow-customize agent skill — round-trip customize a
built-in workflow (export → edit → validate → import) in one interactive
flow. Replaces the originally-planned cp-workflow-import skill (per
user-approved scope change in mid-43-04 conversation).

## Task Commits

- 0e27fc4 cp: start 44-03 + sync frontmatter for completed 44-02
- (workflow-customize.md was committed in ab3ab00 alongside the 44-02
  SUMMARY due to `git add -A` — see Deviations)

## Files Created

- commands/cp/workflow-customize.md (~220 lines, 9 numbered Steps)
  - Steps 1-4: argv parse + interactive prompts (built-in picker,
    new-name resolution, destination path)
  - Step 5: cp workflow export with --as rename
  - Step 6: user edit pause with common-edits hint
  - Steps 7-8: validate (by path) + import (idempotent in-place)
  - Step 9: final ls + suggest /cp-workflow-run + re-customize hint

## Decisions Made

- **Interactive-first:** missing argv shows a picker rather than failing
  on usage. Discoverability for new users; argv shortcut for power users.
- **Validate by PATH not name** in Step 7 — template not yet registered.
- **Skill body cross-refs cp-workflow-new** with a When-to-use callout
  symmetric to the one added in 44-02 — keeps the two creator skills
  from competing in agent skill selection.
- **Re-customize hint** at the end: import is the cheap re-iterate
  command; don't make users re-export to make small follow-up edits.

## Deviations

- workflow-customize.md was committed in ab3ab00 (the 44-02 SUMMARY
  commit) instead of its own feat(44-03) commit, because the
  cp write-summary flow used `git add -A` to stage the SUMMARY.md
  alongside the already-written-but-unstaged customize skill. The file
  is in the repo and verified working (installer dry-run picks it up
  as cp-workflow-customize); only the commit-hygiene narrative is
  slightly off. No re-write required.

## Issues

None — installer dry-run confirms cp-workflow-customize is one of 18
skills materialised into the copilot tree.

## Next Phase Readiness

Plan 44-04 (tests) is the last plan in phase 44. Test additions:
- 8 new installer assertions in test/unit-v034.js (2 skills × 2
  installers × {file exists, frontmatter name matches})
- ≥8 new integration assertions in test/integration-workflow-skills.js
  for the export → import round-trip