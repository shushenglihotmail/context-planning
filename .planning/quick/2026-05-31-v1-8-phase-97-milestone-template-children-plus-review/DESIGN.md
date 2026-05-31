---
status: ready
milestone: milestone-workflow-end-to-end-quick-attach
phase: 97
phase_slug: milestone-template-children
created: 2026-05-31
approved: 2026-05-31
---

# Phase 97 — milestone-template-children + review

Quick-task scope for v1.8 Phase 97. Implements **Workstream A** of the
milestone spec at
`.planning/milestones/milestone-workflow-end-to-end-quick-attach/DESIGN.md`.

## Approach

Edit `templates/workflows/milestone.yaml` to:

1. **Add four new params** to the `params:` block (after the existing
   `plan_role`, before the supervisor-supplied `milestone_slug`):

   ```yaml
   - name: execute_skill
     default: "execute"
   - name: execute_role
     default: "developer"
   - name: review_skill
     default: "code-review"
   - name: review_role
     default: "reviewer"
   ```

2. **Add two materialized child phases** under `propose-phases`
   (mirror `dev.yaml` lines 36-52 shape exactly — `parent:` + `after:`,
   not `depends_on:`):

   ```yaml
   - phase:
       id: child-plan
       description: |
         Per-child planning: produce PLAN.md for one ROADMAP phase.
       parent: propose-phases
       role: "{{plan_role}}"
       skill: "{{plan_skill}}"
       prompt: |
         Produce a detailed implementation plan for this ROADMAP phase.
         Write it to .planning/phases/<phase-id>/PLAN.md.

   - phase:
       id: child-execute
       description: |
         Per-child execution: implement PLAN.md and write SUMMARY.md.
       parent: propose-phases
       after: [ child-plan ]
       role: "{{execute_role}}"
       skill: "{{execute_skill}}"
       prompt: |
         Execute the plan for this ROADMAP phase. Implement, verify,
         commit atomically. Write SUMMARY.md and mark the row complete
         in ROADMAP.md.
   ```

3. **Insert a milestone-level `review` phase** between `propose-phases`
   and `finalize`:

   ```yaml
   - phase:
       id: review
       description: |
         Code-review the milestone's accumulated changes before finalize.
       depends_on: [ propose-phases ]
       role: "{{review_role}}"
       skill: "{{review_skill}}"
       prompt: |
         Review all changes made during this milestone. Run the code-review
         skill against the diff vs the milestone base commit. Summarize
         findings and flag any blockers before finalize.
   ```

4. **Repoint `finalize`'s `depends_on`** from `[propose-phases]` to
   `[review]` so review gates finalize.

5. **No code changes outside the template.** The validator (Phase 96)
   and supervisor dispatch (Phase 98) are separate phases.

6. **Verify with existing tools:**
   - `node bin/cp.js workflow validate milestone` → passes (uses today's
     lenient validator)
   - `npm test` → all 122 still pass

## Done-When

- [ ] `templates/workflows/milestone.yaml` contains 4 new params, 2 new
      child phases with `parent: propose-phases`, and 1 new `review`
      phase with `depends_on: [propose-phases]`.
- [ ] `finalize.depends_on == [review]`.
- [ ] `node bin/cp.js workflow validate milestone` exits 0.
- [ ] `npm test` shows 122+ passing, 0 failing.
- [ ] `node bin/cp.js workflow inspect milestone` shows the new phases
      in the correct waves (propose-phases → child-plan/child-execute
      materialize bucket; then review; then finalize).
- [ ] One atomic commit titled
      `feat(workflows): milestone.yaml child phases + review (v1.8 P97)`
      with the Co-authored-by trailer.

## Out of scope (other v1.8 phases handle these)

- Validator hard-fail rules → Phase 96
- Supervisor actually dispatching children at runtime → Phase 98
- Smoke test of `cp run milestone` end-to-end → Phase 98
- `cp project list` / `cp milestone list` / `--project` / `--milestone`
  flags → Phases 99–100

## Open questions

None — spec is concrete enough. Proceed to implementation on user
approval.
