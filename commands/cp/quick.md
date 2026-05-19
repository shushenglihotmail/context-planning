---
name: cp-quick
description: Lightweight ad-hoc task. Creates a quick PLAN.md, drives it through the provider, records SUMMARY.md. No phase/roadmap baggage.
argument-hint: "<task description>"
requires: []
---

# /cp-quick

You are running `cp-quick`. Use this for small, ad-hoc work that doesn't
deserve a full phase: a bug fix, a small refactor, a dependency bump.

## Step 1 — Parse arguments

- If `$ARGUMENTS` starts with `list`: list everything under `.planning/quick/`
  (one row per dir, status from frontmatter, no agent spawn). Stop.
- If `$ARGUMENTS` starts with `resume <slug>`: find
  `.planning/quick/*-<slug>/`, load its PLAN.md, jump to Step 4.
- Otherwise: `TASK = $ARGUMENTS` is the task description. If empty, ask.

## Step 2 — Slug + directory

- `slug` = lowercase, hyphenated first 5-8 words of TASK, max 40 chars,
  `[a-z0-9-]+` only.
- `dir` = `.planning/quick/{YYYYMMDD}-{slug}/`. Create it.

## Step 3 — Write a starter PLAN.md

Copy `templates/quick-PLAN.md` to `{dir}/PLAN.md`, substituting
`{{SLUG}}`, `{{TITLE}}` (first line of TASK, sentence case), `{{DESCRIPTION}}`
(full TASK), `{{DATE}}` (today).

## Step 4 — Resolve the plan skill (light)

Run `npx cp doctor`. Resolve role `plan`.

For quick tasks we want a LIGHTER plan than full phases. Two options:

- (preferred) Invoke the provider's `plan` skill but instruct it to produce a
  short plan (3–7 tasks max). Save into `{dir}/PLAN.md` (replace the
  `## Approach` and `## Tasks` sections).
- If the provider's plan skill is unavailable: ask the user 2-3 clarifying
  questions, then write a short task list inline.

Confirm the plan with the user before executing.

## Step 5 — Execute

Resolve role `execute`.

- Preferred: provider's `execute` (Superpowers' `subagent-driven-development`
  or `executing-plans` — whichever the provider config maps).
- Manual: drive task-by-task inline; commit each atomically.

Each task should produce a commit. Use Conventional Commits, prefixed with
`(quick: {slug}) `.

## Step 6 — Write SUMMARY.md

When done, copy `templates/quick-SUMMARY.md` to `{dir}/SUMMARY.md`. Fill in:

- `{{SLUG}}`, `{{TITLE}}`, `{{ONE_LINER}}` (substantive!),
- `{{CREATED}}` from PLAN.md frontmatter, `{{COMPLETED}}` = now,
  `{{DURATION_MIN}}` = diff,
- `{{PROVIDER}}` from cp-config,
- "What Changed" — files from `git diff --name-only {start_sha}..HEAD`,
- "Commits" — `git log --oneline {start_sha}..HEAD`.

Update PLAN.md frontmatter: `status: complete`.

## Step 7 — Update STATE.md (lightly)

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
  SUMMARY: {dir}/SUMMARY.md
```

## Notes

- Quick tasks live OUTSIDE the phase/roadmap structure on purpose.
- Use a `--full` style of provider invocation (review + verification) ONLY
  if the user passed `--full` in $ARGUMENTS.
- Resume support: if PLAN.md frontmatter shows `status: in-progress` when
  `/cp-quick resume <slug>` is invoked, continue from where execution left
  off rather than re-planning.
