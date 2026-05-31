---
title: v1.8 Phase 98 — Supervisor dispatch contract (fix bleed-through + wave display)
status: ready
---

# Problem

Two related bugs surfaced while running v1.8 Phase 97:

**Bug A — Bleed-through scaffolding** (the bug we keep cleaning up manually):
`cp run milestone "<name>"` scaffolds *every* phase in the template as a
top-level `.planning/phases/N-<id>/` directory — including child phases
that have `parent: <parent-id>` set. Child phases should only be
materialized when the parent's fan-out runs at runtime
(`lib/fanout.js#expandPhases`), not at workflow startup.

Root cause: `lib/runtime.js#startRun` (line 512) calls
`flatTopoSort(tpl.phases)` without filtering out children, then scaffolds
each one as a separate phase dir.

**Bug B — Wave display elevates children to top-level**:
`cp workflow inspect milestone` shows Wave 1 = `setup, child-plan, child-execute`
because `computeWaves` treats any phase with `indegree=0` (no `depends_on:`)
as a wave-1 root, including children (which use `after:` instead of
`depends_on:`). This is confusing to users and gives the topological-order
warning we currently silence.

Root cause: `lib/workflow.js#computeWaves` (line 807) and
`lib/workflow.js#topoSortIds` (line 1083) don't filter out children.

# Scope (narrowed)

This phase fixes the two static-analysis / scaffolding bugs above. The
end-to-end "smoke test of `cp run milestone`" is **deferred**; it's hard to
automate inside `npm test` and we have prior milestone runs to validate
against manually.

Also deferred to a follow-up:
- ROADMAP status write-back on child completion (Bug C, runtime concern,
  needs an integration harness)
- `commands/cp/cp-workflow-run.md` contract documentation (Bug D, doc-only,
  better done after the runtime is fully shaken out)

# Approach

Edit `lib/workflow.js`:

1. In `computeWaves` (line 807): before building the indegree map, filter
   `template.phases` to exclude any phase with a `parent:` field. Children
   are materialized at runtime by `lib/fanout.js#expandPhases`; they have
   no place in the top-level wave plan.

2. In `topoSortIds` (line 1083): same filter — operate only on phases
   with no `parent:`. This eliminates the spurious
   `Phases not in topological order; suggested order: setup, child-plan,
   child-execute, brainstorm, ...` warning.

Edit `lib/runtime.js`:

3. In `startRun` (line 512): change
   `flatTopoSort(tpl.phases)`
   to filter out children first:
   `flatTopoSort(tpl.phases.filter(p => !Object.prototype.hasOwnProperty.call(p, 'parent')))`.
   This stops the bleed-through scaffolding.

# Done-When

- [ ] `lib/workflow.js#computeWaves`: child phases (those with `parent:`)
      excluded from waves output.
- [ ] `lib/workflow.js#topoSortIds`: child phases excluded from
      topological-order suggestion (no more bogus warning).
- [ ] `lib/runtime.js#startRun`: milestone binding scaffolds only
      top-level phases (children deferred to runtime fan-out).
- [ ] New unit tests in `test/unit-workflow.js`:
      - `computeWaves` on a template with parent+child returns only the
        parent in the wave (no child).
      - Re-validates parent's presence and child's absence.
- [ ] New unit test in `test/unit-workflow-schema-v14.js` (or
      `unit-workflow.js`): topoSortIds-driven warning does NOT fire for
      template with parent+child but otherwise correct order.
- [ ] `node bin/cp.js workflow validate milestone` exits 0 with NO
      topological-order warning.
- [ ] `node bin/cp.js workflow inspect milestone` shows Wave 1 = `setup`
      only (no children).
- [ ] `node bin/cp.js workflow validate {milestone,quick,dev,docs}` all
      still exit 0.
- [ ] `npm test` shows the expected pass count (no regressions).
- [ ] One atomic commit
      `feat(workflow): hide parent:-children from wave planning + scaffolding (v1.8 P98)`.

# Notes

- This is a behavior change for the `dev` workflow too — `cp run dev`
  will no longer scaffold `child-plan`/`child-execute` as standalone
  phase dirs. They're materialized only when `plan` fans out. This is
  correct behavior; the previous behavior was the bug.
- This does NOT change `lib/fanout.js` — runtime expansion already
  separates top-level and child phases correctly (line 65-71). The fix
  is purely upstream of fanout.
