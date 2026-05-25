---
subsystem: testing
tags:
  - installer
  - integration
  - workflow-export
  - cp-workflow-skills
requires:
  - 44-01
  - 44-02
  - 44-03
provides:
  - installer-coverage-cp-workflow-new
  - installer-coverage-cp-workflow-customize
  - integration-coverage-workflow-export
affects:
  - test/unit-v034.js
  - test/integration-workflow-skills.js
tech-stack:
  added: []
  patterns:
    - spawnSync-CLI-round-trip-integration
key-files:
  created: []
  modified:
    - test/unit-v034.js
    - test/integration-workflow-skills.js
key-decisions:
  - Extended the cp-workflow-* skills array in unit-v034.js from 3 to 5 entries rather than adding a parallel section — keeps installer-pickup assertions data-driven and trivially extensible for v1.2+.
  - Integration test reuses dir2 fixture across both round-trip scenarios (basic export and rename-export) — cheaper than separate fixtures and exercises that 'init' + 'import' are idempotent across multiple invocations.
patterns-established:
  - "Round-trip integration tests for CLI surfaces should exercise both directions in the same fixture: write side (export) verifies content, read side (import + ls) verifies the writer's output is consumable."
requirements-completed:
  - v1.1 phase 44
duration: 20min
phase: 44
plan: 44-04
completed: 2026-05-25
end-commit: 4220c833fca1087f164f70acfcb254ae86706939
---
## Accomplishments

Closed phase 44 with 21 new test assertions (8 installer + 13
integration), all green. The cp-workflow-new and cp-workflow-customize
skills are now under installer auto-pickup coverage; the cp workflow
export → import round-trip is end-to-end validated for both basic and
rename flows.

## Task Commits

- 6e34e6b cp: start 44-04 + sync frontmatter for completed 44-03
- 4220c83 test(44-04): add cp-workflow-new/customize installer assertions
  + export round-trip integration tests

## Files Modified

- test/unit-v034.js — extended the cp-workflow-* skills array in the
  installer-auto-pickup section added in 43-04 from 3 to 5 entries.
  8 new assertions (cp-workflow-new and cp-workflow-customize × copilot
  and claude × {file exists, frontmatter name matches}).

- test/integration-workflow-skills.js — new Part 4 section "cp workflow
  export → import round-trip" with 13 assertions:
  * Section A (basic export): `cp workflow export dev` writes
    `./dev.yaml` with no `# template:` header, contains `workflow: dev`;
    `cp workflow import dev.yaml --force` accepts the file cleanly.
  * Section B (rename export): `cp workflow export dev --as my-dev --out
    my-dev.yaml` produces a file with `workflow: my-dev` and no bare
    `workflow: dev` line; `cp workflow import my-dev.yaml` registers it;
    `cp workflow ls --json` lists `my-dev` with `source: 'project'`.

## Decisions Made

- **Data-driven extension** of the unit-v034.js section instead of a
  parallel block. The `expectedSkills = [...]` array makes v1.2+
  additions trivial.
- **Shared dir2 fixture** across both integration scenarios — cheaper
  than rebuilding the project and incidentally proves `init` + `import`
  are idempotent across multiple invocations.

## Deviations

None.

## Issues

None. Full `npm test` suite stays green.

## Next Phase Readiness

Phase 44 is complete. v1.1 milestone progress:
  ✓ Phase 43 — 3 consumer skills + tests (done)
  ✓ Phase 44 — 2 creator skills + export CLI + tests (done)
  · Phase 45 — refactor cp-quick + cp-autonomous to shims (next)
  · Phase 46 — docs + MIGRATION + v1.1.0 release

Phase 45 is the highest-risk phase of the milestone (it touches two
mature, in-use skills). The full cp-workflow-run skill from phase 43 is
now battle-tested at the test-level for everything except a live LLM
session, so the shim refactor should be a safe collapse.

Pre-phase-45 recommendation: do a manual smoke test of
`/cp-workflow-customize dev` in a live Copilot CLI session to flush out
any UX issues before shims start delegating to cp-workflow-run.