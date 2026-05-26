---
name: cp-autonomous
description: Drive the active milestone autonomously — for each pending phase, delegate to `cp run <workflow>`; smart-gate on test/audit/runner; stop cleanly to .planning/.continue-here.md.
argument-hint: "[START] [--workflow=<name>] [--scope=phase|N|N-M|milestone] [--check]"
requires: []
---

# /cp-autonomous

You are running `cp-autonomous`. Your job is to drive the active
milestone's pending phases to completion without per-phase user
approval, while remaining safe: stop the loop the moment a test fails,
an audit HIGH finding appears, or the workflow runner reports an
error. Stops are captured in `.planning/.continue-here.md` and surfaced
inline so the user can decide what to do next without leaving the
session.

This skill is the **outer orchestrator**. The inner work — each
phase's planning + execution — is delegated to `cp run <workflow>`.
The cp CLI `cp autonomous` provides preview (`--check`) + gate
primitives; the per-phase delegation lives here.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- An optional positional `START`:
  - omitted → auto-detect from `cp status --json`
  - a phase number like `36` → start at that phase
  - a quoted milestone name like `"v0.10 Autonomy"` → first pending
    phase in that milestone
- An optional `--workflow=<name>`:
  - The workflow template to delegate each phase to (default: `dev`,
    overridable via `cp.behavior.default_workflow`).
- An optional `--scope=<value>`:
  - `phase` → just the START phase
  - `<N>` → next N phases from START (inclusive)
  - `<N>-<M>` → explicit phase range (e.g. `--scope=32-34`)
  - `milestone` (DEFAULT) → all remaining phases in the milestone
- `--check` → preview only; do not execute anything.

Sanitize as you would for any cp slash command. Reject anything that
isn't one of these forms.

## Step 2 — Pre-flight via `cp autonomous --check --json`

Always invoke:

```
cp autonomous [START] --workflow=<name> --scope=<value> --check --json
```

(Pass through the parsed args verbatim.) The CLI will return either:

- `ok: true, dryRun: true, phasesWouldRun: [..], totalPlans: N,
  workflow: "...", milestone: "..."` — proceed.
- `ok: false, reason: "..."` — hard stop. Show the message; suggest
  the corrective verb (`cp init`, `cp new-milestone`, etc).

If the user passed `--check`, print the preview block (milestone +
workflow + phases that would run + plan count) and **stop**. Do not
enter the loop.

Otherwise show a one-line summary like:

```
About to drive {N} phase(s) in milestone "{name}" via workflow "{workflow}".
  Phases: {comma list}
  Smart gates: tests + audit-HIGH + runner errors
  Stop produces: .planning/.continue-here.md
```

## Step 3 — Resolve or start the workflow run

Before entering the per-phase loop, you need the workflow run's
**slug**:

1. Run `cp run status --json` and look for an active run whose
   `workflow` field matches `<workflow>` AND (where applicable) whose
   binding maps to the current milestone.
2. If one exists, capture its `slug` — you'll resume it per phase.
3. If none exists, start a fresh run:
   ```
   cp run <workflow> "<milestone-name>"
   ```
   This scaffolds the run (and milestone phases if the milestone is
   new). Capture the slug from stderr (`slug: <slug>`).
   - **Skip this step if the milestone already has phases scaffolded
     the legacy way (PLAN.md present per phase)** — in that case,
     starting a `cp run` would conflict. Instead, treat the per-phase
     loop as a pure pass-through: the agent simply does the phase work
     in the existing PLAN.md model and you skip the `mark-complete`
     hand-off until phase 51-04's deprecation work lands.

## Step 4 — The per-phase loop

For each `phaseNum` in `phasesWouldRun` (in order):

### 4a. Get the workflow instruction (if using `cp run`)

If you have a slug from Step 3, run:

```
cp run resume <slug>
```

This re-emits the current wave's instruction (which corresponds to
this phase). Follow it: do the planning + implementation work as
directed, committing atomically per task. Use whatever sub-skills the
workflow template names (e.g. `writing-plans`,
`subagent-driven-development`).

If you have **no** slug (legacy pass-through), just execute the phase
the same way you would have under the old `cp-plan-phase` +
`cp-execute-phase` flow: read PLAN.md, work through each pending plan
in order, commit per task, run `cp tick <phase-plan>` per plan, and
write a SUMMARY at the end.

### 4b. Hand off the phase

If you have a slug, when the phase work is complete, mark it done:

```
cp run mark-complete <slug> <phase-id> < <summary-file>
```

Where `<phase-id>` is the workflow phase id (e.g. `plan`,
`child-plan`) and `<summary-file>` is a short markdown SUMMARY of
what you did. Then re-run `cp run status --json <slug>` to confirm
the run advanced.

If you have no slug, the legacy pass-through has already ticked the
last plan and written SUMMARY — nothing extra to do here.

### 4c. Runner-error handling

If `cp run resume` or `cp run mark-complete` returns a non-zero exit
or surfaces a deviation message in its stderr, treat that as a
`phase-failed` stop:

- Write `.planning/.continue-here.md` with reason `phase-failed`,
  the captured stderr, and "Inspect the failure and re-run
  /cp-autonomous" as next-step.
- Jump to Step 6.

### 4d. Smart-gate: tests

Read `cp config get cp.behavior.test_command`. If non-empty (and not
the placeholder "echo skipped"), run it. Pipe the output to a
tail-capture (last ~30 lines). On non-zero exit:

- Write `.continue-here.md` with reason `test-failure`, the captured
  output, and "Debug the test failure" as next-step.
- Jump to Step 6.

### 4e. Smart-gate: audit

Run `cp audit --json`. If `summary.high > 0`:

- Write `.continue-here.md` with reason `audit-high`, the HIGH
  findings list, and "Run /cp-audit-fix or address findings
  manually" as next-step.
- Jump to Step 6.

### 4f. Loop

Move to the next `phaseNum`. Re-check `cp status --json` if you want
a clean snapshot; otherwise continue down the list from Step 2.

## Step 5 — Scope-end completion

When the outer loop finishes (all phases in scope processed without
stopping):

- Re-run `cp status --json` to confirm.
- Print:
  ```
  ✓ cp autonomous: COMPLETE
    Milestone:        {name}
    Workflow:         {workflow}
    Phases processed: {comma list}
    Suggested next:   /cp-complete-milestone "{name}" (if all phases done)
                      /cp-autonomous (if more phases remain in this or other milestone)
  ```
- Do NOT auto-invoke `/cp-complete-milestone`. The milestone close
  has its own UAT gate and the user should approve it explicitly.

## Step 6 — Stop UX (inline, never exit the session)

When a smart gate trips OR `cp run` returns a runner error:

1. Confirm `.planning/.continue-here.md` was written. If it wasn't,
   write it yourself with the exact frontmatter:
   ```
   # cp autonomous — paused
   Stopped at: phase {N}
   Reason: {reason}
   Time: {ISO}

   ## Details
   {captured details}

   ## Next
   - {reason-specific next step}
   - Re-run `cp autonomous` (or `/cp-resume`) — execution picks up at
     phase {N}
   <!-- written by /cp-autonomous skill -->
   ```
2. Print a stop block to the user:
   ```
   ✗ cp autonomous: STOPPED at phase {N}
     Reason: {reason}
     See:    .planning/.continue-here.md
   ```
3. Prompt the user inline via `ask_user` with reason-tailored
   choices:

   | Reason | Choices |
   |---|---|
   | `test-failure` | "Debug now (open failing test)", "Skip this phase", "Stop" |
   | `audit-high` | "Run /cp-audit-fix", "Stop" |
   | `phase-failed` | "Inspect & retry", "Skip this phase", "Stop" |
   | default | "Continue at next phase", "Stop" |

4. Act on the choice:
   - "Continue at next phase" → resume the per-phase loop at the
     next pending phase.
   - "Skip this phase" → run `cp run mark-complete <slug> <phase-id>`
     with a minimal "skipped" SUMMARY, then resume loop. Warn the
     user that a skipped phase will be flagged by `cp audit`.
   - "Debug now" / "Inspect & retry" / "Run /cp-audit-fix" → invoke
     the relevant skill (`/cp-debug`, `/cp-audit-fix`, etc.) and
     after it returns, ask the user whether to resume.
   - "Stop" → finish this skill cleanly. Do not exit the session.

## Step 7 — Report

When the skill ends (success or user-chosen "Stop"), print:

```
cp autonomous: {COMPLETE | STOPPED}
  Milestone: {name}
  Workflow:  {workflow}
  Phases done in this run: {comma list}
  Stop reason (if any):    {reason or "—"}
  Continue file (if any):  .planning/.continue-here.md
```

## Notes

- **Bounded to a single milestone.** Even with `--scope=milestone`,
  the CLI clamps to the active milestone's last phase. Cross-milestone
  drives are a separate skill, intentionally.
- **One workflow per run.** All phases in a single `cp autonomous`
  invocation use the same workflow. Switch workflows mid-milestone by
  stopping and re-running with a different `--workflow=<name>`.
- **Idempotent on success.** Re-running `/cp-autonomous` after a
  successful completion is a no-op (CLI reports `phasesWouldRun: []`).
- **Each phase is one commit-bracket.** Atomic per-task commits live
  inside the phase; the smart gates here happen AFTER the phase's
  commits land, so a stop always leaves git clean.
- **Legacy pass-through is temporary.** Phase 51-04 will deprecate
  `cp-plan-phase` and make `cp run` the unambiguous single path. Until
  then, milestones scaffolded the legacy way (PLAN.md present per
  phase) skip the `cp run resume` / `cp run mark-complete` calls.
- **No agent reasoning in the lib.** `cp autonomous` (the CLI) is
  used here only for `--check` previews and the gate primitives
  (`cp audit`, `cp status`). Per-phase delegation is in this skill.
