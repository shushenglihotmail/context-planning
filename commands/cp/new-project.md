---
name: cp-new-project
description: Initialise a new context-planning project — scaffold .planning/, fill PROJECT.md via the provider's brainstorm skill, then create a first milestone + phase breakdown.
argument-hint: "[project description, optional]"
requires: [cp-new-milestone, cp-autonomous]
---

# /cp-new-project

You are running the `cp-new-project` command. Your job is to set up a fresh
`.planning/` directory in the user's repo and use the configured workflow
provider to fill in PROJECT.md and break the work into a first set of phases.

## Step 1 — Initialise the state layer

Run:

```bash
npx cp init
```

This is idempotent. It creates:

- `.planning/PROJECT.md`     (template — empty)
- `.planning/ROADMAP.md`     (template — single placeholder phase)
- `.planning/STATE.md`       (template — position = pre-planning)
- `.planning/cp-config.json` (default provider: superpowers)
- `.planning/phases/`, `.planning/quick/`

Report what was created vs kept.

## Step 2 — Resolve the workflow provider

Run:

```bash
npx cp doctor
```

Read the output. Identify:

- `Provider:` line — which provider is configured (default: `superpowers`).
- For role `brainstorm`, is the skill installed? (✓ or ✗)

**If the brainstorm skill is missing AND the user has a way to install it,**
print a one-line note recommending they install the provider and continue.
Don't block.

## Step 3 — Delegate to the brainstorm skill

Hand off to the provider's `brainstorm` skill.

For Superpowers users, that means invoking the `brainstorming` skill: explain
to the user that you're going to refine the design through questions before
writing any code, then run the skill's workflow with `$ARGUMENTS` (the
project description) as seed.

If the provider is `manual` (no real skill available), inline a minimal
brainstorm:

> Ask the user, one question at a time, until you have enough to fill the
> PROJECT.md sections (What This Is, Core Value, Active Requirements, Out of
> Scope, Constraints). Always confirm before writing.

## Step 4 — Write PROJECT.md

When the brainstorming skill returns the design (or the manual flow gathers
enough info), populate `.planning/PROJECT.md`:

- **What This Is** — 2-3 sentences in the user's words
- **Core Value** — the ONE thing that matters
- **Active Requirements** — `- [ ] {requirement}` bullets
- **Out of Scope** — explicit exclusions with reasoning
- **Constraints** — `- **{Type}**: {what} — {why}`
- **Key Decisions** — initial table (can be empty)

Show the user the proposed PROJECT.md (or the key sections) and confirm
before writing.

## Step 5 — Decide the first milestone + phase breakdown

Propose **1 milestone** and **3–6 phases** based on the requirements.
For each phase write:

- `### Phase N: {Name}` heading
- `**Goal**:` one line
- `**Depends on**:` previous phase or "Nothing"
- `**Success Criteria**:` 2-5 observable behaviors
- Plans list: `- [ ] NN-01: {brief}` (start with 1 plan per phase; the
  workflow `plan` phase produces the per-phase DESIGN later)

Show the user the proposed roadmap and confirm.

Then update `.planning/ROADMAP.md`:

- Replace the placeholder milestone heading with the real milestone
- Replace the placeholder phase block with the real phase blocks
- Rebuild the Progress table (`require('context-planning/lib/roadmap').rebuildProgressTable`)

## Step 6 — Update STATE.md and commit

- Set `Phase: 1 of N`, `Plan: 1 of {phase1 plan count}`, `Status: Ready to plan`
- Set `Current focus:` to phase 1 name
- Set `Last activity:` to `today — initialised project`
- Update `Last session` and `Stopped at` in Session Continuity

If `cp.behavior.atomic_commits` is `true` in `.planning/config.json` and
we're in a git repo, commit with:

```
cp: init project state for {project name}
```

## Step 7 — Tell the user what's next

Print:

```
✓ Project initialised.
  Phase 1: {name} — {N} plans
  Next:    /cp-autonomous       # drive all phases end-to-end
```

## Notes

- Never invent requirements the user didn't agree to.
- Confirm before writing each major file.
- Read `.planning/config.json` (the merged GSD+cp config) for the provider
  mapping. cp-specific keys live under `cp.*`. Don't hard-code `superpowers`
  skill names.
- If `.planning/PROJECT.md` already exists with real content (not the
  placeholder), stop and tell the user to run `/cp-new-milestone` instead.
