---
name: cp-plan-phase
description: Create the phase directory and PLAN.md for phase N by delegating to the provider's plan skill.
argument-hint: "<phase number, e.g. 1 or 2.1>"
requires: [cp-execute-phase]
---

# /cp-plan-phase

You are running `cp-plan-phase`. Your job is to take a phase that exists in
ROADMAP.md and turn it into a concrete `PLAN.md` ready for execution.

## TL;DR — use the v0.3 `cp` CLI wrapper

If the phase doesn't yet exist in ROADMAP (e.g. the user jumped here from
`/cp-new-milestone` without scaffolding the phases yet), create the phase
shell first:

```
cp scaffold-phase {N} --name "{phase name}" --plans {initial-plan-count}
```

Output:
```
✓ .planning/ROADMAP.md
✓ .planning/phases/{NN-slug}/PLAN.md
Phase {N} added to milestone "{active milestone}" ({M} plans: {NN-01}, ...)
committed <hash>
```

The wrapper inserts the `### Phase N: {name}` heading under the active
milestone in ROADMAP, creates `.planning/phases/{NN-slug}/PLAN.md` from the
`templates/phase-PLAN.md` template, pre-fills `- [ ] NN-MM: TBD` checkboxes
for the requested plan count, and auto-commits. Use `--dry-run` to preview,
`--milestone <name>` to target a non-active milestone, `--no-commit` to skip
the commit.

After the wrapper runs (or if the phase already exists), proceed below to
fill in the per-plan details (objectives, tasks, success criteria) by
delegating to the provider's plan skill.

## Step 1 — Resolve the phase

- `PHASE_NUM` = `$ARGUMENTS` (sanitize: must match `^[\d]+(\.\d+)?$`).
- Read `.planning/ROADMAP.md`. Find the matching `### Phase {PHASE_NUM}: {Name}`
  block. Extract:
  - phase name
  - goal
  - success criteria
  - requirements (the `**Requirements**:` line)
  - planned plans list
- If not found, stop and tell the user to add it first via `/cp-new-milestone`
  or by editing ROADMAP.md.

## Step 2 — Create the phase directory and PLAN file

Use the cp helpers (`require('context-planning/lib/paths')`) to derive
GSD-compatible filenames:

```
phaseDirName(N, name)      -> "01-foundation"   (zero-padded; decimals kept as-is)
phasePlanPrefix(N, planN)  -> "01-01"
planFile(N, name, planN)   -> ".planning/phases/01-foundation/01-01-PLAN.md"
summaryFile(...)           -> ".planning/phases/01-foundation/01-01-SUMMARY.md"
```

Create the dir if missing. For each planned plan in the ROADMAP, create the
stub PLAN file from `templates/PLAN.md`, substituting:

- `{{PHASE_DIR}}`   — e.g. `01-foundation`
- `{{PLAN_NUM_PADDED}}` — e.g. `01`
- `{{PHASE_PLAN_PREFIX}}` — e.g. `01-01`
- `{{WAVE}}`        — `1` initially; the plan skill or a future
  parallelization pass can update it
- `{{OBJECTIVE}}`, `{{PURPOSE}}`, `{{OUTPUT}}` — derived from the ROADMAP
  goal + this plan's brief description
- `{{PROVIDER}}`, `{{PLAN_SKILL}}` — from `cp doctor`

PLAN frontmatter is GSD-shaped:
```
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-01, REQ-02]   # populate from ROADMAP **Requirements**: line
user_setup: []
must_haves:
  truths: []
  artifacts: []
  key_links: []
```

The `<tasks>` block stays empty for the plan skill to fill in (see Step 4).

## Step 3 — Resolve the plan skill

Run `npx cp doctor`. Find the `plan` role's resolved provider + skill.

- If installed (default: Superpowers' `writing-plans`): invoke it.
- If `manual`: warn the user the provider's plan skill is missing, then fall
  back to inline plan-writing — ask the user about each task, scope, success.

## Step 4 — Delegate to the plan skill

Pass to the plan skill:
- The phase Goal and Success Criteria (verbatim from ROADMAP.md)
- The Requirements list (from ROADMAP's `**Requirements**:` line)
- The Context block from PROJECT.md (Core Value, related Active requirements)
- A pointer to write the resulting plan into the GSD-shaped file
  `.planning/phases/{phase-dir}/{phase}-{plan}-PLAN.md` — replacing the
  `<tasks>` block. **Do not rename the file.** Do not touch frontmatter
  keys cp populated (phase, plan, type, wave, depends_on, requirements);
  the skill MAY append/refine `files_modified`, `must_haves.*`, and
  `autonomous` once it has decomposed the work.
- The instruction that each task should be 2-5 minutes, file-scoped, with a
  clear verification step (per Superpowers' writing-plans conventions), and
  each task expressed as a `<task type="auto">...</task>` block (GSD shape).

The plan skill is expected to populate the `<tasks>` section of PLAN.md with
one `<task>` block per actionable step.

## Step 5 — Reconcile with ROADMAP.md plans list

After the plan skill returns:

- Count `<task type="auto">` blocks in the new PLAN.md.
- If the count differs from the plans listed in ROADMAP.md for this phase,
  show the user and ask whether to:
  (a) keep the original ROADMAP plan count (let PLAN.md just decompose
      each into sub-tasks), or
  (b) replace the ROADMAP plans list with one entry per task in PLAN.md.

  Default to (a). The plans list in ROADMAP.md is the COARSE checklist;
  PLAN.md is the fine detail.

## Step 6 — Update STATE.md

- `Plan:` = `1 of {plan count}`
- `Status:` = `Ready to execute`
- `Last activity:` = `today — planned phase {N}`

## Step 7 — Commit and report

If `cp.behavior.atomic_commits` is true:
```
cp: plan phase {N} ({phase name})
```

Print:
```
✓ Phase {N} planned: {phase name}
  Tasks:  {count}
  File:   .planning/phases/{phase-dir}/{phase}-{plan}-PLAN.md
  Next:   /cp-execute-phase {N}
```

## Notes

- The plan skill OWNS the content of PLAN.md's `<tasks>` block.
- Don't second-guess the plan skill's output — it's the workflow provider's
  area of expertise.
- If the user wants to tweak the plan, let them edit PLAN.md directly and
  re-invoke `/cp-execute-phase`.
- Filenames follow GSD convention: `{phase}-{plan}-PLAN.md` so a GSD
  workflow can read and continue from the same file.
