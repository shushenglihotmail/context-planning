---
name: cp-quick
description: Lightweight ad-hoc task. Creates a quick DESIGN.md + STATE.md pair, drives it through the provider, records SUMMARY.md. No phase/roadmap baggage.
argument-hint: "<task description>"
requires: []
---

# /cp-quick

You are running `cp-quick`. Use this for small, ad-hoc work that doesn't
deserve a full phase: a bug fix, a small refactor, a dependency bump.

Quick tasks use the same artifact shape as milestone-phases:
**DESIGN.md** (what + why + done-when) and **STATE.md** (progress).
There is no separate PLAN.md — tasks are short enough that the DESIGN
itself is the plan.

## Step 1 — Parse arguments

- If `$ARGUMENTS` starts with `list`: list everything under
  `.planning/quick/` (one row per dir, status from STATE.md frontmatter,
  no agent spawn). Stop.
- If `$ARGUMENTS` starts with `resume <slug>`: find
  `.planning/quick/*-<slug>/`, load its DESIGN.md + STATE.md, jump to
  Step 5 (Execute).
- Otherwise: `TASK = $ARGUMENTS` is the task description. If empty, ask.

## Step 2 — Slug + directory

- `slug` = lowercase, hyphenated first 5–8 words of TASK, max 40 chars,
  `[a-z0-9-]+` only.
- `dir` = `.planning/quick/{YYYYMMDD}-{slug}/`. Create it.

## Step 3 — Scaffold DESIGN.md + STATE.md

Copy `templates/quick-DESIGN.md` to `{dir}/DESIGN.md`, substituting
`{{SLUG}}`, `{{TITLE}}` (first line of TASK, sentence case),
`{{DESCRIPTION}}` (full TASK), `{{DATE}}` (today).

Copy `templates/quick-STATE.md` to `{dir}/STATE.md`, substituting the
same placeholders.

## Step 4 — Fill DESIGN.md collaboratively

Quick tasks skip the heavyweight plan skill. Instead:

- Briefly discuss with the user to agree on:
  - **Approach** — what change you'll make, at what files, and why.
  - **Done When** — observable success condition.
- Write the agreed approach + done-when into `{dir}/DESIGN.md`.
- Update DESIGN.md frontmatter: `status: ready`.

If the user passed `--full` in $ARGUMENTS, invoke the provider's `plan`
skill instead (Step 4b) to produce a more rigorous DESIGN section. This
is opt-in only.

## Step 5 — Execute

Resolve role `execute` via `npx cp doctor`.

- Preferred: provider's `execute` (Superpowers' `subagent-driven-development`
  or `executing-plans` — whichever the provider config maps).
- Manual: drive the change inline; commit atomically.

Each substantive change should produce a commit. Use Conventional
Commits, prefixed with `(quick: {slug}) `.

While executing, append entries to `{dir}/STATE.md` under
`## Last Activity` so progress is recoverable. Update `last_activity`
in the frontmatter.

## Step 6 — Write SUMMARY.md

When done, copy `templates/quick-SUMMARY.md` to `{dir}/SUMMARY.md`. Fill in:

- `{{SLUG}}`, `{{TITLE}}`, `{{ONE_LINER}}` (substantive!),
- `{{CREATED}}` from DESIGN.md frontmatter, `{{COMPLETED}}` = now,
  `{{DURATION_MIN}}` = diff,
- `{{PROVIDER}}` from cp-config,
- "What Changed" — files from `git diff --name-only {start_sha}..HEAD`,
- "Commits" — `git log --oneline {start_sha}..HEAD`.

Update DESIGN.md frontmatter: `status: complete`.
Update STATE.md frontmatter: `status: complete`.

## Step 7 — Update project STATE.md (lightly)

Quick tasks don't move the phase/plan counters. They only update:

- `Last activity:` = `today — quick task: {slug}`
- `Last session` / `Stopped at` in Session Continuity
- Append a row to the `## Quick Tasks Completed` table:
  `| {YYYY-MM-DD} | {slug} | {one-liner} |`

The Quick Tasks Completed table is created by `cp init` and is
GSD-compatible (GSD's STATE.md template has the same section).

## Step 8 — Commit and report

```
cp: quick task — {slug}
```

Print:
```
✓ Quick task complete: {slug}
  {one-liner}
  {N} commits, {M} files
  DESIGN:  {dir}/DESIGN.md
  SUMMARY: {dir}/SUMMARY.md
```

## Notes

- Quick tasks live OUTSIDE the phase/roadmap structure on purpose.
- DESIGN.md is the contract. STATE.md is the journal. SUMMARY.md is
  the closing artifact. Same shape as milestone-phases — easier to
  promote a quick task into a phase later if it grows.
- Use a `--full` style of provider invocation (review + verification)
  ONLY if the user passed `--full` in $ARGUMENTS.
- Resume support: if DESIGN.md frontmatter shows `status: ready` or
  `in-progress` when `/cp-quick resume <slug>` is invoked, jump
  straight to Step 5 — do not re-scaffold.
