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

## TL;DR — use the `cp status` CLI wrapper

The `cp status` CLI command does almost everything this command needs.
Run it, format the output for the user, and add any extras (project name
from PROJECT.md, continue-here notice).

```bash
cp status --json
```

Returns:

```json
{
  "ok": true,
  "milestone": "v0.1 MVP",
  "milestoneStatus": "in-progress",
  "phases": [
    { "num": "1", "name": "Foundation", "done": 2, "total": 2 },
    { "num": "2", "name": "Search",     "done": 0, "total": 1 }
  ],
  "nextPlan": {
    "phaseNum": "2",
    "phaseName": "Search",
    "planId": "02-01",
    "desc": "search command"
  },
  "stateContentPresent": true
}
```

If `cp` isn't on PATH, fall back to the manual procedure in the
["Fallback"](#fallback--manual-implementation) section.

## Step 1 — Read project name

Read the first `# heading` of `.planning/PROJECT.md` for the project name
(or fall back to the repo dir basename). This is the only thing
`cp status` doesn't surface.

## Step 2 — Run `cp status`

```bash
cp status --json
```

If `ok: false`, surface the error message verbatim and suggest
`/cp-new-project` or `cp init`.

## Step 3 — Detect continue-here

Check whether `.planning/.continue-here.md` (or
`.planning/phases/{NN-slug}/.continue-here.md`) exists. If so, you'll add a
suffix to the output.

## Step 4 — Render the report

Format like this (substitute values from the JSON):

```
cp progress
───────────

Project:    {project name}
Milestone:  {milestone or "(none in progress)"}

You are here:
  Phase {num}: {name}   ({done}/{total} plans complete)
  Plan  {nextPlan.planId}: {nextPlan.desc}    ← next action

Overall:    {sum done}/{sum total} plans complete   {progress bar — see below}

Phase breakdown:
  ✓ Phase 1: Foundation                 (2/2 — Complete)
  ▶ Phase 2: Search                     (0/1 — In progress)

Suggested next:
  /cp-autonomous                            # drive the milestone end-to-end
  /cp-execute-phase {nextPlan.phaseNum}     # advance just the current plan
```

**Progress bar** — match `lib/state.progressBar(pct)` exactly so STATE.md
edits agree: `[██████░░░░] 60%` style (10-char bar of `█`/`░`).

**Phase legend:**
- `✓` Complete (done == total > 0)
- `▶` In progress (the one "you are here", or 0 < done < total)
- ` ` Not started (done == 0, total > 0)
- `?` Planned (total == 0 — no plan file yet)

## Step 5 — Decide the suggested next command

Default to `/cp-autonomous` (it handles every phase shape — planned,
in-progress, and freshly scaffolded). Surface `/cp-execute-phase` as a
secondary option for users who want to advance just one plan.

## Step 6 — Continue-here notice (if Step 3 found one)

```
↩ A continue-here.md is waiting. Run /cp-resume to restore mid-task context.
```

## Step 7 — Edge cases

- **No milestone in progress:** print "Milestone: (none in progress)" and
  suggest `/cp-new-milestone "<name>"`.
- **All plans across all phases done:** suggest `/cp-complete-milestone`.
- **STATE.md disagrees with ROADMAP (e.g. STATE says Phase 4 but ROADMAP
  shows Phase 4 has no plans yet):** surface as a warning line but trust
  ROADMAP (which is what `cp status` reads from).

## Fallback — manual implementation

If `cp` isn't on PATH, replicate `lib/lifecycle.statusReport(root)`:
- `roadmap.listPhases(content)` → phases array with `{num, name, plans[]}`
- Find the in-progress milestone heading (`### 🚧 {name} (In Progress)`
  or just `(In Progress)` in the heading)
- Filter `listPhases` results to those whose `num` is in
  `findMilestoneInRoadmap(content, name).phases`
- nextPlan = first phase × first plan where `!plan.done`

Then render as above.

## Notes

- This command MUST NOT write any file. It only reads.
- Keep output compact; the user runs this often.
- The progress bar should match `lib/state.progressBar(pct)` exactly so
  downstream STATE.md edits agree.
- `cp status` already handles the milestone/phase/next-plan logic with
  394-test coverage; prefer it over re-implementing.
