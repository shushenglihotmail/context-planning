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

## TL;DR — use the v0.3 `cp` CLI wrapper

After brainstorming the milestone name + goals with the user (Steps 1–3
below), you can produce the ROADMAP shape the parser expects with a single
shell call instead of hand-editing `## Phases`:

```
cp scaffold-milestone "v1.1 Notifications"
```

Output:
```
✓ .planning/ROADMAP.md
Milestone:   v1.1 Notifications [in-progress]
committed <hash>
```

This appends `### 🚧 v1.1 Notifications (In Progress)` inside `## Phases` and
auto-commits. Refuses if a milestone of that name already exists. Use
`--planned` for `### 📋 ... (Planned)` if you're queueing milestones rather
than starting one now. Use `--dry-run` to preview without writing.

Then for each phase the brainstorm identified, call `cp scaffold-phase`
(see `/cp-plan-phase` for details) — no need to hand-edit ROADMAP anywhere.

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

**v0.7 design-capture (TWO destinations):**
1. Save the FULL brainstorm transcript (verbatim Q&A) to
   `.planning/MILESTONE-CONTEXT.md`. This is the unedited working file.
2. Save the structured ADR summary (Status / Context / Decision /
   Consequences / Architecture / etc.) to
   `.planning/milestones/<slug>/DESIGN.md`. `cp scaffold-milestone`
   already created the empty template — SP brainstorming overwrites it
   with the populated version using its `path:` override parameter.

At `cp complete-milestone`, MILESTONE-CONTEXT.md is automatically
promoted into the milestone DESIGN.md as a "Brainstorm transcript"
appendix and the transient file is deleted.

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

Confirm with the user, then append each phase block to `.planning/ROADMAP.md`.

**Preferred (v0.3)** — for each phase, call:
```
cp scaffold-phase {N} --name "{phase name}" --plans {initial-plan-count}
```
This inserts `### Phase N: {name}` under the active milestone, creates
`.planning/phases/{NN-slug}/PLAN.md` from the phase-PLAN template, and
auto-commits. Pre-fills `- [ ] NN-MM: TBD` checkboxes for the requested
plan count. Refuses if the phase number already exists.

**Fallback (manual)** — if `cp` CLI is unavailable, edit ROADMAP.md by hand
using `lib/roadmap.appendPhaseBlock`. Then rebuild the Progress table.

Skip the "milestone bullet under `## Milestones`" step — the v0.3 template
no longer has that section; the H3 milestone heading inside `## Phases` is
the source of truth.

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
