---
name: cp-execute-phase
description: Execute a planned phase by handing PLAN.md to the provider's execute skill, then record SUMMARY.md and update STATE.md/ROADMAP.md.
argument-hint: "<phase number>"
requires: []
---

# /cp-execute-phase

You are running `cp-execute-phase`. PLAN.md exists; your job is to drive it
through to a green build and atomic commits via the configured workflow
provider, then record the result back into the state layer.

## Step 1 — Resolve the phase + plan

- `PHASE_NUM` = `$ARGUMENTS` (sanitize as in cp-plan-phase).
- Find the phase dir via `lib/paths.findPhaseDir(PHASE_NUM)` — returns
  `.planning/phases/{NN-slug}/` or `null` if missing. If missing, tell the
  user to run `/cp-plan-phase {PHASE_NUM}` first.
- Iterate plan files in the phase dir matching `{NN}-{MM}-PLAN.md` in
  ascending order. For each plan that has not yet been ticked in ROADMAP.md
  (`- [ ] NN-MM:`), this is the next plan to execute.
- Read its frontmatter; confirm `type: execute` and either no `status` set
  yet OR `status: in-progress` (resume case).
- Read the phase block in ROADMAP.md for Goal / Success Criteria / Requirements.

## Step 2 — Set the start markers

- Update PLAN.md frontmatter: add `status: in-progress`, `started: {ISO timestamp}`.
- Update STATE.md: `Status: In progress`, `Last activity: today — executing phase {N}, plan {MM}`.

If `cp.behavior.atomic_commits` true, commit:
```
cp: start {phase}-{plan} execution
```

## Step 3 — Resolve the execute skill

Run `npx cp doctor`. Resolve role `execute`.

- Default: Superpowers' `subagent-driven-development` — fires one fresh
  subagent per task with two-stage review.
- Alternative: Superpowers' `executing-plans` (simpler batch execution).
- If `manual`: walk through each task one at a time, asking the user to
  confirm the intent, doing the work, running verification, committing.

## Step 4 — Delegate execution

Invoke the execute skill with:
- The current plan's `{phase}-{plan}-PLAN.md` as the work plan
- The phase Goal, Success Criteria, and Requirements as the must-haves
- An instruction: each task gets an atomic commit using
  `Conventional Commits` style (feat/fix/refactor/test/docs), prefixed with
  `({phase}-{plan}) ` (e.g. `feat(01-02): add JWT verifier`).

The execute skill OWNS what happens during the work — including TDD,
verification, code review between tasks, and any deviations.

## Step 5 — On task / plan completion

Each time a task is checked off in PLAN.md (✓ in the task list), the execute
skill should commit. Don't intervene unless the skill returns control.

When the execute skill reports the whole plan is complete:

1. Verify Success Criteria from ROADMAP.md actually hold. (You can ask the
   provider's `verify` skill, e.g. `verification-before-completion`, or do
   an inline check.)
2. If any criterion fails: don't write SUMMARY.md; tell the user, pause for
   instructions.

## Step 6 — Write SUMMARY.md

Write to `.planning/phases/{phase-dir}/{phase}-{plan}-SUMMARY.md` (NOT
plain `SUMMARY.md` — GSD-compatible naming) using `templates/SUMMARY.md`.

Substitute:
- `{{PHASE_DIR}}`, `{{PHASE_NUM}}`, `{{PHASE_NAME}}`, `{{PLAN_NUM_PADDED}}`
- `{{SUBSYSTEM}}` — pick from: auth, payments, ui, api, database, infra,
  testing, docs, tooling. Ask the user if ambiguous.
- `{{DURATION_MIN}}` and `{{DURATION_HUMAN}}` — diff `started` -> now.
- `{{STARTED_ISO}}`, `{{COMPLETED_ISO}}`, `{{COMPLETED_DATE}}`
- `{{TASKS_COUNT}}` — count `<task>` blocks in PLAN.md (or completed-only).
- `{{FILES_COUNT}}` — `git diff --name-only {start_sha}..HEAD | wc -l`
- `{{ONE_LINER}}` — substantive outcome. Ask the user if you're unsure.
- `{{PROVIDER}}`, `{{EXECUTE_SKILL}}` — from `cp doctor`.

Fill the body sections:
- **Accomplishments** (2-4 substantive bullets)
- **Task Commits** — `git log --oneline {start_sha}..HEAD`
- **Files Created / Modified** — bullet per path with one-line purpose
- **Decisions Made** (or "None — followed plan as written")
- **Deviations from Plan** (or "None")
- **Issues Encountered** (or "None")
- **Next Phase Readiness** — anything to surface in STATE.md

Then ALSO populate the GSD-shaped frontmatter fields:
- `tags: [...]`         searchable tech (e.g., jwt, prisma, react)
- `requires:` and `provides:` and `affects:` — dependency-graph hints
- `tech-stack.added` / `tech-stack.patterns`
- `key-files.created` / `key-files.modified`
- `key-decisions:` — copy from Decisions section as YAML strings
- `patterns-established:` — patterns future phases should maintain
- `requirements-completed:` — copy from PLAN.md `requirements:` frontmatter

This rich frontmatter is what enables GSD's `gsd-planner` (or our future
context-assembly logic) to quickly select relevant prior summaries when
planning later phases.

Update PLAN.md frontmatter: add `status: complete`, `completed: {ISO ts}`.

## Step 7 — Update ROADMAP.md

- Tick this plan in the phase's plans list (`- [ ] {phase}-{plan}:` →
  `- [x] {phase}-{plan}:`). Use `lib/roadmap.setPlanDone(content, planId, true)`.
- Rebuild the Progress table:
  `lib/roadmap.rebuildProgressTable(content, milestoneByPhase)`.

## Step 8 — Update STATE.md

- Bump `Phase:` and `Plan:` to the next planned plan (or "all complete" if
  this was the last).
- `Status:` = `Ready to plan` (next phase) or `Milestone complete`.
- `Last activity:` = `today — completed phase {N}`.
- Update the progress bar (% = total ticked plans / total plans across all
  phases).
- Append a one-line `Recent Decisions` entry if there were any decisions.

## Step 9 — Commit and report

If `cp.behavior.atomic_commits` is true:
```
cp: complete {phase}-{plan} ({phase name})
```

Print:
```
✓ Plan {phase}-{plan} complete: {phase name}
  Duration: {X} min, {tasks} tasks, {files} files
  SUMMARY:  .planning/phases/{phase-dir}/{phase}-{plan}-SUMMARY.md
  Next:     {next command — usually /cp-execute-phase {N} for the next plan,
            or /cp-plan-phase {N+1} if this was the last plan in the phase}
```

## Notes

- Never write SUMMARY.md if Success Criteria aren't met.
- If the execute skill pauses mid-task, leave PLAN.md `status: in-progress`
  so the user can resume by re-invoking `/cp-execute-phase {N}`.
- Don't re-implement the execute skill. Delegate. Your job is the state
  layer + bookkeeping.
- Filenames are GSD-compatible: `{phase}-{plan}-PLAN.md` and
  `{phase}-{plan}-SUMMARY.md`. Don't create short-form `PLAN.md`/`SUMMARY.md`.
- Frontmatter (especially SUMMARY.md's dependency graph) is the canonical
  cross-tool interop surface — GSD's gsd-planner relies on these fields,
  so populate them faithfully.
