---
name: cp-new-milestone
description: Start a new milestone on an existing cp project — gather goals, propose PROJECT.md updates, break into phases, update STATE.md.
argument-hint: "<milestone name>"
requires: []
---

# /cp-new-milestone

You are running `cp-new-milestone`. This is a thin wrapper around the
`milestone` workflow (Decision #10 of the v1.4 milestone). The workflow
does the real work; you only delegate.

## Step 1 — Sanitize

Trim `$ARGUMENTS`. Reject if empty. The milestone name is the
human-readable string (e.g. `"v1.5 Backlog UX"`); the engine derives
a slug for paths.

## Step 2 — Delegate

Invoke:

    cp run milestone "$ARGUMENTS"

Stream the workflow output. Do NOT inline-perform brainstorm or phase
breakdown — the workflow's supervised `brainstorm`, `propose-project-updates`,
and `propose-phases` phases handle each step using the configured
provider skills.

## Step 3 — Stop on errors

If `cp run` exits non-zero (e.g. setup-check fails because PROJECT.md
is missing), surface the error and stop. The most common fix is
`/cp-new-project`, not retrying this command.

## Notes

- The milestone workflow uses `supervised: true`. The harness LLM
  (you) supervises the three skill phases; the four scaffold phases
  (`setup`, `apply-project-updates`, `finalize`) are deterministic
  CLI calls.
- `propose-phases` uses `materialize: roadmap-phases` — phases land
  in `ROADMAP.md` (and per-phase PLAN.md skeletons), not as inline
  child phases of this workflow.
