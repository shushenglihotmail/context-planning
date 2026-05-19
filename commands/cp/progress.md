---
name: cp-progress
description: Show where you are in the project — current phase, last activity, next plan, and progress %. Read-only.
argument-hint: ""
requires: []
---

# /cp-progress

You are running `cp-progress`. This is a **read-only** diagnostic: tell the
user exactly where they are in the project and what the obvious next action
is. Do not modify any files.

## Step 1 — Verify state

- Read `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`.
- If any are missing, stop and tell the user to run `/cp-new-project` or
  `cp init`.

## Step 2 — Parse ROADMAP

Use `lib/roadmap.listPhases(content)` to get every phase + its plans + their
done state. For each phase compute:

- `total` = plans.length
- `done`  = plans filtered by `.done`
- `status` = `Not started` (0/total), `In progress` (0<done<total),
  `Complete` (done==total), `Planned` (total==0)

Then compute project-wide totals:
- `totalPlans` = sum of plans.length across all phases that have at least 1 plan
- `donePlans`  = sum of done plans
- `pct`        = round(donePlans / totalPlans * 100)

## Step 3 — Locate "you are here"

Pick the **current** phase = the lowest-numbered phase whose status is
`In progress`. If none, pick the lowest with status `Not started`. If all are
`Complete`, the milestone (or project) is done — say so.

Pick the **next plan** = within that phase, the first plan whose `done` is
false. If none in that phase, look at the next phase in `lib/roadmap.listPhases`
order.

## Step 4 — Read STATE.md cross-check

Extract these labelled lines from `## Current Position`:
- `Phase: ...`
- `Plan: ...`
- `Status: ...`
- `Last activity: ...`

If STATE.md disagrees with ROADMAP (e.g. STATE says Phase 4 but ROADMAP shows
Phase 4 has no plans yet), surface the mismatch as a warning but trust
ROADMAP for the "next" recommendation.

## Step 5 — Detect a current milestone

Read `.planning/MILESTONE-CONTEXT.md` if present (GSD-shape: transient
milestone spec). Extract its name + status. If absent, look at the most
recent `🚧 ` (in-progress) entry in the `## Milestones` section of
ROADMAP.md.

## Step 6 — Print the report

Print exactly this layout (substitute values):

```
cp progress
───────────

Project:    {project name from PROJECT.md heading}
Milestone:  {milestone name from MILESTONE-CONTEXT.md or ROADMAP Milestones bullet, or "(none)"}

You are here:
  Phase {N}: {name}   ({done}/{total} plans complete — {phaseStatus})
  Plan  {next plan id}: {next plan desc}    ← next action

Overall:    {donePlans}/{totalPlans} plans complete   {progressBar(pct)}

Recent:     {Last activity from STATE.md}

Phase breakdown:
  ✓ Phase 1: Foundation                 (2/2 — Complete)
  ✓ Phase 2: Core Todos                 (2/2 — Complete)
  ▶ Phase 3: Sharing                    (1/2 — In progress)
    Phase 3.1: Token expiry hotfix      (0/1 — Not started)
    Phase 4: Export                     (0/1 — Not started)

Suggested next:
  /cp-execute-phase {next-phase-num}     # if next phase already has a PLAN.md
  /cp-plan-phase    {next-phase-num}     # otherwise, plan it first
```

Phase legend:
- `✓` Complete
- `▶` In progress (the one "you are here")
- ` ` Not started / Planned

To decide between suggesting `/cp-execute-phase` vs `/cp-plan-phase` for the
next-action line: use `lib/paths.findPhaseDir(num)` — if it returns a real
dir AND that dir contains a `{phase}-{plan}-PLAN.md` for the next plan id,
suggest `execute-phase`. Otherwise suggest `plan-phase`.

## Step 7 — If `.continue-here.md` exists

If `.planning/.continue-here.md` is present, add a note at the very bottom:

```
↩ A continue-here.md is waiting. Run /cp-resume to restore mid-task context.
```

## Notes

- This command MUST NOT write any file. It only reads.
- Keep output compact; the user runs this often.
- If a phase has zero plans, label it `Planned` (not `Not started`) so it's
  obvious the next step is `/cp-plan-phase N`, not `/cp-execute-phase N`.
- The progress bar should match `lib/state.progressBar(pct)` exactly so
  downstream STATE.md edits agree.
