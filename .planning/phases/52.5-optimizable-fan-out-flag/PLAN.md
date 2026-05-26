---
phase: "52.5"
name: optimizable fan-out flag
milestone: v1.2 Unified Phase Model
status: in-progress
created: 2026-05-26
base-commit: ea2cd5716398012d3f508194464d0973efc8f381
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 52.5: optimizable fan-out flag

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-26

## Goal

Replace the v1.2 "all-or-nothing" fan-out dependency rule with an explicit
parent-level `optimizable` flag, eliminating the silent ambiguity where a
partially-declared `depends_on` set falls back to sequential execution
without warning. Lands before v1.2.0 publish (Phase 52-03) so v1.2 ships
with the corrected contract from day one.

## Success Criteria

1. Parent structured-list output supports a top-level `optimizable` boolean
   (default `false` when missing).
2. `optimizable: false`/missing → items execute strictly in array order;
   any per-item `depends_on` is ignored entirely (no silent partial DAG).
3. `optimizable: true` → items execute as a DAG. Missing `depends_on` on
   an item is treated as `[]` (parallel root). Cycles, self-references,
   and unknown ids throw hard errors.
4. `buildParentPrompt` instructs the agent on the new contract — sequential
   is the safe default; `optimizable: true` is an explicit pledge.
5. `templates/workflows/dev.yaml` plan-phase prompt updated to match.
6. All existing v1.2 fan-out tests pass; new assertions cover every row
   of the resolution table.

## Plans

- [ ] 52.5-01: `lib/runtime-fanout.js` — extend `parseParentOutput` to extract
      top-level `optimizable` (boolean, default `false`); rewrite
      `resolveItemOrder` around the flag; rewrite `buildParentPrompt` copy.
- [ ] 52.5-02: `lib/fanout.js` — adapt `expandPhases` to the new
      `{ optimizable, items }` shape; update JSDoc.
- [ ] 52.5-03: `test/unit-runtime-fanout.js` + `test/unit-fanout.js` +
      `test/integration-fanout-v12.js` — extend coverage for the 7
      resolution scenarios (~15 new assertions).
- [ ] 52.5-04: `templates/workflows/dev.yaml` plan-phase prompt + 
      `docs/MIGRATION-v1.2.md` — describe `optimizable` semantics.

## Notes

<!-- Free-form during phase execution. -->
