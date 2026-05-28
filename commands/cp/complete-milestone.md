---
name: cp-complete-milestone
description: Close out a milestone — verify all phases done, roll up SUMMARYs, collapse in ROADMAP, archive to MILESTONES.md.
argument-hint: "[milestone name]"
requires: []
---

# /cp-complete-milestone

You are running `cp-complete-milestone`. This is a thin wrapper around
the `complete-milestone` workflow (Decision #10 of the v1.4 milestone).
The workflow does the real work; you only delegate.

## Step 1 — Resolve milestone name

If `$ARGUMENTS` is empty, run `cp status --json` and use the
in-progress milestone name. If multiple match or none match, ask the
user which milestone to close.

## Step 2 — Delegate

Invoke:

    cp run complete-milestone "<milestone name>"

Stream the workflow output. The workflow has two phases:

1. `verify` — runs `cp complete-milestone --dry-run` and prints the
   action list (which phases will be collapsed, which files mutated).
2. `complete` — runs `cp complete-milestone` to do the work atomically.

The deterministic engine prompts the user with the verify output and
awaits Y/n before running `complete` — no supervisor is needed
(workflow has `supervised:` omitted).

## Step 3 — Stop on errors

If `verify` exits non-zero (e.g. some plans not ticked), surface the
listed missing items and stop. Do not try to tick them yourself — the
user decides whether to finish those plans or abandon the milestone.

## Notes

- This workflow is NOT supervised. Everything is deterministic CLI.
- The verify/complete split is a single user-confirmation gate, not
  a per-phase agentic loop.
