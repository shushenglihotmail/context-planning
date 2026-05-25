---
subsystem: docs
tags:
  - v1.1
  - migration
  - changelog
  - readme
requires:
  - 47-01
  - 47-02
provides:
  - v1.1-doc-surface
affects:
  - README.md
  - MIGRATION-v1.1.md
  - CHANGELOG.md
tech-stack:
  added: []
  patterns:
    - 3-group skill organisation (Drive / Author / Inspect)
key-files:
  created: []
  modified:
    - README.md
    - MIGRATION-v1.1.md
    - CHANGELOG.md
key-decisions:
  - "Organise the 12 cp-workflow-* skills into 3 functional groups in every doc surface (README, MIGRATION, CHANGELOG): Drive / Author / Inspect — mirrors how users actually reach for them."
  - Document /cp-workflow-init's absence and why (one-shot bootstrap, no agent value) so reviewers don't read the missing entry as an oversight.
  - Update test-count line in CHANGELOG to actual deltas (integration 39->93, dryrun 75->103, unit 64->92) — was previously approximated.
patterns-established:
  - Group skill catalogues by user intent (drive/author/inspect) rather than alphabetically — applies to all future skill cluster docs.
requirements-completed: []
duration: 12min
phase: 47
plan: 47-03
completed: 2026-05-25
end-commit: 01e8759579937f3a96907ec558cca12ace3ca64b
---
## Accomplishments

Updated all three v1.1 doc surfaces to reflect the expanded scope from
47-01 (cp workflow inspect CLI) and 47-02 (7 new cp-workflow-* agent
skills), bringing the v1.1.0 surface to **12 agent skills + 2 new CLI
verbs** instead of the originally-shipped **5 skills + 1 CLI verb**.

The user's original critique that drove v1.1 was *"every write-side CLI
verb should have an in-CLI agent companion."* Phase 47 closed the
remaining gap (validate, show, diagram, inspect, import, export,
brainstorm), and 47-03 makes that gap-closure visible in the
user-facing docs.

## Task Commits

- `01e8759` docs(47-03): expand v1.1 docs for 12-skill surface + cp workflow inspect

## Files Modified

- `README.md` — Workflow skills section now uses 3 grouped tables;
  added cp workflow inspect row to CLI table; updated v1.1 callout.
- `MIGRATION-v1.1.md` — "What's New" rewritten to list 12 skills + 2
  CLI verbs in 3 groups; "How to Discover" list expanded from 5 to 12;
  verify snippet now invokes cp workflow inspect.
- `CHANGELOG.md` — [1.1.0] Added section rewritten: 12 skills + 2 CLI
  verbs; test deltas corrected to actual values; deferred section
  expanded with /cp-workflow-init rationale.

## Decisions Made

- **3-group organisation (Drive / Author / Inspect)** applied
  consistently across README + MIGRATION + CHANGELOG. Users reach for
  these skills by intent, not alphabetically.
- **Test count updates use actual deltas:** 39→93 integration (+54 from
  9 new skill files × 6 assertions each), 75→103 dryrun (+28 inspect),
  64→92 unit (+28 from 7 new installer auto-pickup entries × 4 each).
- **/cp-workflow-init explicitly called out as intentionally absent** —
  cp workflow init is a one-shot bootstrap; agent orchestration adds
  no value. Documenting the absence prevents reviewer confusion.

## Deviations

None.

## Issues

None — npm test green at exit 0; no regressions.

## Next Phase Readiness

Phase 47 is complete. Phase 48 (resume v1.1.0 release) is unblocked:
final test run + git tag v1.1.0 + npm publish (user-driven OTP) +
push.
