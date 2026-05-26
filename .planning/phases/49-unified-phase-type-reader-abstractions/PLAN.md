---
phase: "49"
name: Foundations + tier files + persist primitives
milestone: v1.2 Unified Phase Model
status: in-progress
plan-status:
  49-01: complete
  49-02: complete
  49-03: complete
  49-04: in-progress
created: 2026-05-25
base-commit: 8f40fc160238d0635f06556f8f66c80153ac7813
---

# Phase 49: Foundations + tier files + persist primitives

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-25

## Goal

Lay the entire foundation for v1.2 in one phase: the unified `Phase`
typedef, milestone + workflow readers that emit it, milestone-tier
DESIGN.md/STATE.md scaffolding, and the persist primitive that folds
phase output into DESIGN.md (including the `persist_output:` →
`persist:` rename). Everything downstream (fan-out runtime, CLI
shims, docs) depends on these primitives.

## Success Criteria

1. `lib/types.js` exports `Phase` JSDoc typedef + `validatePhase(obj)`.
2. `lib/milestone.js#readPhases(roadmapMd)` returns unified `Phase[]`;
   `lib/milestone.js#scaffoldTierFiles(milestoneSlug, brief)` creates
   `.planning/milestones/<slug>/{DESIGN.md, STATE.md}` if absent.
3. `lib/workflow.js#phasesFromTemplate(template)` returns unified
   `Phase[]` carrying `parent`, `after`, `persist`, `max_children`,
   `min_children` fields.
4. `lib/persist.js#foldIntoDesign(designPath, phaseId, summary)`
   appends/replaces a section in DESIGN.md named after the phase id;
   `persist_output:` is accepted as an alias for `persist:` with one
   deprecation warning per template load.
5. Default value of `persist:` is `false` (opt-in).
6. Test files: `test/unit-types.js` ✅, `test/unit-milestone-reader.js`
   (~30 assertions), additions to `test/unit-workflow.js` for new
   fields (~25 assertions), `test/unit-persist.js` (~20 assertions).
7. `npm test` exit code 0; zero regressions in 108+ existing test
   files.
8. No CLI surface changes. No public API removals.

## Plans

- [x] 49-01: `lib/types.js` — define the `Phase` JSDoc typedef and the `validatePhase(obj)` runtime check (returns `{ok, errors}`); ship `test/unit-types.js` with ~20 assertions covering required-field validation, status enum, depends_on array shape, and layer-specific extension field tolerance.
- [x] 49-02: `lib/milestone.js` — add `readPhases(roadmapMd)` (unified `Phase[]` for all 4 ROADMAP shapes: in-progress/collapsed/with-plans/without-plans, plus tolerate future `workflow:` annotation) AND `scaffoldTierFiles(milestoneSlug, brief)` (creates milestone-tier `DESIGN.md` + `STATE.md` if absent, never overwrites). Ship `test/unit-milestone-reader.js` with ~30 assertions covering both functions.
- [x] 49-03: `lib/workflow.js#phasesFromTemplate(template)` — new adapter returning unified `Phase[]` carrying `parent`, `after` (top-level + child-level), `persist`, `max_children`, `min_children` fields. Does NOT change `computeWaves` or `readTemplate`. Add ~25 parity assertions to `test/unit-workflow.js` (or new file) proving adapter output passes `validatePhase` and round-trips the new fields.
- [x] 49-04: `lib/persist.js` — `foldIntoDesign(designPath, phaseId, summary)` helper that appends or replaces a `## <phaseId>` section in `DESIGN.md`, dedupes on phase id, and tolerates absent file. Add `persist_output:` → `persist:` alias in template loader (`lib/workflow.js` or `lib/templates.js`) with one-time deprecation warning. Default `persist: false` (opt-in). Ship `test/unit-persist.js` with ~20 assertions.

## Notes

- Phase 49 was consolidated from the original phase 49 + phase 50
  during mid-v1.2 design negotiation (combined for cohesion — these
  4 plans are tightly coupled foundations).
- The unified `Phase` typedef stays JSDoc (no TypeScript).
- `scaffoldTierFiles` is idempotent — safe to call on every `cp run`
  against a milestone; only creates files when missing.
- `foldIntoDesign` uses a section header (e.g. `## brainstorm`) as
  the dedupe key. Re-running a workflow re-renders that section.
- Back-compat: all existing call sites of `roadmap.js` keep working;
  `readPhases` is additive. The `persist_output:` alias preserves
  v1.1 templates verbatim.

