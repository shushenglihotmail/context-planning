---
subsystem: tooling
tags:
  - workflow
  - yaml
  - dag
  - wave-planner
  - validator
requires: []
provides:
  - workflow.loadTemplate
  - workflow.validate
  - workflow.computeWaves
  - workflow.resolveTemplate
affects:
  - lib/workflow.js
  - test/unit-workflow.js
  - test/fixtures/workflows/
tech-stack:
  added: []
  patterns:
    - Kahn's-algorithm topological wave planner
    - DFS three-color cycle detection
    - project-local first then built-in template resolution
    - pure-function lib module (no I/O beyond fs.readFileSync of the template)
key-files:
  created:
    - lib/workflow.js
    - test/unit-workflow.js
    - test/fixtures/workflows/linear.yaml
    - test/fixtures/workflows/parallel.yaml
    - test/fixtures/workflows/cycle.yaml
    - test/fixtures/workflows/dangling-dep.yaml
    - test/fixtures/workflows/bad-yaml.yaml
    - test/fixtures/workflows/missing-id.yaml
  modified:
    - package.json
key-decisions:
  - computeWaves emits phase OBJECTS (not just ids) per wave — downstream runtime needs full phase metadata (role, model, skill, prompt, persist_output) at instruction-emission time
  - validate() runs ALL checks before returning (no short-circuit) so users see every error in one pass
  - cycle error messages reconstruct the offending path with → arrows for fast diagnosis
  - resolveTemplate tolerates missing built-in templates/workflows/ directory (Phase 41 ships it) — searches project-local .planning/workflows/ first, then built-in, then throws with attempted paths listed
  - loadTemplate defaults binds_to='custom', principles=[], defaults={}, per-phase depends_on=[] so templates can omit boilerplate
patterns-established:
  - "YAML workflow template canonical shape: {workflow, version, binds_to?, defaults?, principles?, phases[{id, depends_on?, role?, model?, skill?, prompt?, persist_output?}]}"
  - "Test fixture directory layout: test/fixtures/workflows/<scenario>.yaml — one fixture per validation scenario plus happy paths"
requirements-completed: []
duration: 21min
end-commit: 1c77693
phase: 40
plan: 40-01
completed: 2026-05-25
---
# Summary 40-01

## Goal

Implement `lib/workflow.js` — the YAML template loader, schema/DAG validator, and
Kahn's-algorithm wave planner that sits at the front of the workflow runtime.
Plus 6 fixture YAML files and a comprehensive unit test.

## Outcome

Shipped. `lib/workflow.js` exposes the four public functions specified in the
phase DESIGN.md contract; 75 assertions pass standalone and in the full
`npm test` chain (`unit-workflow: 75 passed`). No regressions.

## Task Commits

- `0a8862f` test(40-01): add workflow template fixtures
- `7a675fe` test(40-01): add unit-workflow test scaffolding
- `1c77693` feat(40-01): implement workflow templates

## Files Created

- `lib/workflow.js` — module
- `test/unit-workflow.js` — 75 assertions, 11 sections
- `test/fixtures/workflows/linear.yaml`
- `test/fixtures/workflows/parallel.yaml`
- `test/fixtures/workflows/cycle.yaml`
- `test/fixtures/workflows/dangling-dep.yaml`
- `test/fixtures/workflows/bad-yaml.yaml`
- `test/fixtures/workflows/missing-id.yaml`

## Files Modified

- `package.json` — added `node test/unit-workflow.js` to the npm test chain.

## Decisions Made

- **Phase OBJECTS in waves** — `computeWaves` returns `[[phaseObj, ...], ...]` (not id arrays). Rationale: downstream `runtime.js` (40-02) needs the full phase metadata (role/model/skill/prompt) when emitting wave instructions. Returning ids would force a second lookup.
- **All-errors validation** — `validate()` collects every schema/DAG/principles error before returning. Better UX than abort-on-first.
- **Cycle path in error message** — `Cycle detected: a → b → c → a`. Reconstructed via DFS three-color back-edge tracking.
- **Tolerant `resolveTemplate`** — built-in `templates/workflows/` directory may not exist yet (Phase 41 ships it). Resolver searches project-local `.planning/workflows/` first, falls through to built-in, throws with attempted-paths list. Tests still work today against fixture absolute paths.
- **Generous defaults on load** — `binds_to → 'custom'`, `principles → []`, `defaults → {}`, per-phase `depends_on → []`. Lets minimal templates omit boilerplate.

## Deviations

None. Contract from `.planning/phases/40-core-engine-custom-tier/DESIGN.md` was implemented as written.

## Issues

None.

## Next Phase Readiness

Plan 40-02 (`lib/runtime.js`) can now require `workflow.loadTemplate`, `workflow.validate`, `workflow.computeWaves`, and `workflow.resolveTemplate` directly. The phase-object wave format is the consumption contract.
