---
name: cp-resume
description: Restore mid-task context from .continue-here.md (if present) or STATE.md, then keep going.
argument-hint: ""
requires: [cp-progress, cp-execute-phase]
---

# /cp-resume

You are running `cp-resume`. The user stopped in the middle of something and
wants to pick it back up. Your job is to **restore enough context to keep
going**, then either continue the active plan or hand off to the right
follow-up command.

## Step 1 — Load planning context

Read in this order (each only if it exists):

1. `.planning/.continue-here.md`  — GSD-shape mid-task handoff note (highest
   priority signal: the previous session wrote it intentionally).
2. `.planning/STATE.md`            — current position + last activity.
3. `.planning/ROADMAP.md`          — to translate STATE position into the
   actual phase / plan that's in progress.
4. `.planning/MILESTONE-CONTEXT.md` — current milestone goal, if any.
5. The PLAN.md for the in-progress plan (derived from STATE.md + ROADMAP).

## Step 2 — Identify the in-progress unit of work

There are three cases. Try them in order:

**(A) `.continue-here.md` exists**
- Trust it as the source of truth. Parse it for:
  - "Stopped at" line (a free-form description of where work paused)
  - Any "Next" / "TODO" bullet list
  - File pointers (PLAN.md, code files mid-edit)
- This is GSD-compatible; format the file with the same shape so GSD's
  `gsd-resume-work` will read it after a switch back.

**(B) STATE.md `Status:` is `In progress`**
- Use `Phase:` + `Plan:` from STATE.md to compute the active PLAN file:
  - `lib/paths.findPhaseDir(phaseNum)` → phase dir
  - filename `{phasePlanPrefix}-PLAN.md`
- Read that PLAN.md's frontmatter. If `status: in-progress`, find the first
  `<task>` block whose `<done>` criteria are not yet met (best-effort
  heuristic: agent should re-check via `<verify>` commands).

**(C) Nothing in progress**
- Fall through to `/cp-progress`'s recommended next action (the next pending
  plan in the lowest-numbered phase).

## Step 3 — Verify the workspace

Before suggesting the user keep going, sanity check:

- `git status` — uncommitted changes? Show them; ask if the user wants them
  before resuming (they may be the partial work from the previous session).
- Run the PLAN.md's `<verify>` for any task marked `done` to confirm the
  reported state matches reality. If a `done` task no longer passes verify,
  flag it.
- If a plan claims `wave > 1` and `depends_on` includes a plan id, confirm
  that prerequisite plan is checked in ROADMAP.md. If not, surface the
  ordering issue.

## Step 4 — Restore context to the user

Print:

```
cp resume
─────────

Project:     {project name}
Milestone:   {milestone name or "(none)"}

Resuming:    Phase {N} ({phase name}), plan {phase-plan id}
Stopped at:  {one-line summary from .continue-here.md or STATE.md "Last activity"}

Verified:
  ✓ {task X is still passing}
  ✗ {task Y now fails — needs re-investigation}
  ? {task Z has no <verify> — skipped}

Uncommitted changes:
  {git status --short output, or "(clean)"}

Plan file:   .planning/phases/{phase-dir}/{phase}-{plan}-PLAN.md

Next action:
  {pick the first unfinished <task> in PLAN.md and quote its <name>}

Run:
  /cp-execute-phase {N}    # continue automated execution
  # or work this task manually and re-invoke /cp-resume when done
```

## Step 5 — Update STATE.md (Session Continuity only)

Write back to STATE.md `## Session Continuity` only — do not touch other
sections:

- `Last session: {today's date}`
- `Stopped at:   {one-line summary}` (kept from previous if unchanged)
- `Resume file:  .planning/.continue-here.md` (if it exists) or `(none)`

Use `lib/state.updateSessionContinuity`.

## Step 6 — Hand off or stop

If the user wants automatic continuation and the active plan's `autonomous`
frontmatter is `true`, invoke `/cp-execute-phase N` directly.

If `autonomous: false` (checkpointed plan) or the user wants control, stop
here and let them drive.

## Notes

- This command MAY write only to STATE.md `## Session Continuity` and
  optionally `.planning/.continue-here.md` (to refresh "Resumed at"). It MUST
  NOT modify ROADMAP.md, PROJECT.md, or any PLAN.md / SUMMARY.md.
- `.continue-here.md` is GSD-shaped — keep the same headings GSD writes:
  `## Stopped at`, `## Next`, `## Context`.
- If `cp.behavior.atomic_commits` is true and you wrote to STATE.md, commit:
  ```
  cp: resume — session restored
  ```
