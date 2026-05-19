---
name: cp-new-milestone
description: Start a new milestone on an existing cp project — gather goals, break into phases, update PROJECT.md/ROADMAP.md/STATE.md.
argument-hint: "<milestone name, e.g. 'v1.1 Notifications'>"
requires: [cp-plan-phase, cp-execute-phase]
---

# /cp-new-milestone

You are running `cp-new-milestone`. The project already exists. Your job is
to add a new milestone on top — gather its goals (delegated to the provider's
brainstorm skill), break it into phases, and update the state layer.

## Step 1 — Validate state

- Read `.planning/PROJECT.md`. If it doesn't exist, stop and tell the user to
  run `/cp-new-project` first.
- Read `.planning/ROADMAP.md`, `.planning/STATE.md`.
- Run `npx cp doctor` and note which provider/skills are available.

## Step 2 — Get milestone name and intent

- Milestone name comes from `$ARGUMENTS`. If empty, ask the user for it.
- Briefly summarise what shipped previously (read the most recent
  `### Phase N: ...` entries with all plans checked, or the last `<details>`
  block in ROADMAP.md).

## Step 3 — Delegate brainstorming

Invoke the provider's `brainstorm` skill (e.g. Superpowers' `brainstorming`),
passing the milestone name + the user's stated intent + a short summary of
the project context (Core Value, last 3 validated requirements).

Goal of the brainstorm: a clear, scoped specification for the milestone.

Save the brainstorm output to `.planning/MILESTONE-CONTEXT.md` (top-level,
transient — same name and location GSD uses, so a switch back to GSD will
find it). It will be deleted (or moved to `.planning/milestones/{slug}/`)
once all phases in this milestone are planned via `/cp-plan-phase`.

## Step 4 — Update PROJECT.md

- Move any newly-completed requirements from Active to Validated.
- Add this milestone's new requirements to Active.
- Update "Last updated" line to `today — added {milestone name}`.

Show the diff, confirm with the user, write.

## Step 5 — Break into phases

Propose 2–6 phases for this milestone based on the spec. For each:

- Continue phase numbering from the highest existing phase (DON'T restart at 1).
- Heading: `### Phase N: {Name}`
- Goal, Depends on, Success Criteria, plans list (start with 1 plan each).

Confirm with the user, then append each phase block to `.planning/ROADMAP.md`
(use `lib/roadmap.appendPhaseBlock`). Then rebuild the Progress table.

Also add a milestone bullet to the `## Milestones` section:
`- 🚧 **{milestone name}** — Phases {first}-{last} (in progress)`

## Step 6 — Update STATE.md

- `Phase:` = the first new phase number of this milestone
- `Plan:` = 1 of {plan count}
- `Status:` = `Ready to plan`
- `Current focus:` = first new phase name
- `Last activity:` = `today — started milestone {name}`

## Step 7 — Commit and report

If `cp.behavior.atomic_commits` is true and we're in a git repo:
```
cp: start milestone {name} (phases X-Y)
```

Print:
```
✓ Milestone "{name}" planned.
  Phases: X-Y
  Spec:   .planning/MILESTONE-CONTEXT.md
  Next:   /cp-plan-phase X
```

## Notes

- The user should be able to interrupt and refine at any step.
- Never write to ROADMAP/PROJECT before showing the proposed changes.
- If the provider's brainstorm skill is unavailable, fall back to inline
  Socratic questioning — but warn the user once.
