---
name: cp-autonomous
description: Drive the active milestone autonomously — auto-plan + auto-execute each pending phase, smart-gate on test/audit/deviation, stop cleanly to .planning/.continue-here.md.
argument-hint: "[START] [--scope=phase|N|N-M|milestone] [--check]"
requires: []
---

# /cp-autonomous

You are running `cp-autonomous`. Your job is to drive the active
milestone's pending phases to completion without per-phase user
approval, while remaining safe: stop the loop the moment a test fails,
an audit HIGH finding appears, or the execute skill returns a
deviation. Stops are captured in `.planning/.continue-here.md` and
surfaced inline so the user can decide what to do next without leaving
the session.

This skill is the **outer orchestrator**. The inner work — planning a
phase, executing each plan — is delegated to `/cp-plan-phase` and
`/cp-execute-phase`. The cp CLI `cp autonomous` provides preview
(`--check`) + gate primitives; the agent reasoning lives here.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- An optional positional `START`:
  - omitted → auto-detect from `cp status --json`
  - a phase number like `36` → start at that phase
  - a quoted milestone name like `"v0.10 Autonomy"` → first pending
    phase in that milestone
- An optional `--scope=<value>`:
  - `phase` → just the START phase
  - `<N>` → next N phases from START (inclusive)
  - `<N>-<M>` → explicit phase range (e.g. `--scope=32-34`)
  - `milestone` (DEFAULT) → all remaining phases in the milestone
- `--check` → preview only; do not execute anything.

Sanitize as you would for `/cp-execute-phase`. Reject anything that
isn't one of these forms.

## Step 2 — Pre-flight via `cp autonomous --check --json`

Always invoke:

```
cp autonomous [START] --scope=<value> --check --json
```

(Pass through the parsed args verbatim.) The CLI will return either:

- `ok: true, dryRun: true, phasesWouldRun: [..], totalPlans: N,
  milestone: "..."` — proceed.
- `ok: false, reason: "..."` — hard stop. Show the message; suggest
  the corrective verb (`cp init`, `cp new-milestone`, etc).

If the user passed `--check`, print the preview block (milestone +
phases that would run + plan count) and **stop**. Do not enter the
loop.

Otherwise show a one-line summary like:

```
About to drive {N} phase(s) in milestone "{name}" autonomously.
  Phases: {comma list}
  Smart gates: tests + audit-HIGH + deviation
  Stop produces: .planning/.continue-here.md
```

## Step 3 — The per-phase loop

For each `phaseNum` in `phasesWouldRun` (in order):

### 3a. Plan if stub

Read `.planning/phases/{NN}-*/PLAN.md`. If the Goal section contains
`{Describe what this phase delivers in 1-2 sentences.}` OR any plan
description is `{brief description}`, the PLAN.md is a scaffold stub.

Delegate to:

```
/cp-plan-phase {phaseNum}
```

Then re-read PLAN.md and verify the stub markers are gone. If the
plan skill failed to fill the stub, treat that as a `plan-failed`
stop: write `.planning/.continue-here.md` (use `cp` writers if
available, otherwise write the file directly with reason
`plan-failed`, the stub markers found, and "Re-run /cp-plan-phase
{phaseNum}" as next-step). Then jump to Step 5 (stop UX).

### 3b. Execute plans one at a time

Repeatedly:

1. Run `cp status --json`. If `.nextPlan.planId` is null OR `.phase`
   has advanced past `phaseNum`, break out of the inner loop —
   phase {phaseNum} is done; move to the next phase.
2. Delegate to:
   ```
   /cp-execute-phase {phaseNum}
   ```
   It executes the **next pending plan** (per `nextPlan.planId`),
   writes SUMMARY, and ticks the plan.
3. If `/cp-execute-phase` returned an explicit failure / deviation
   (its prose surface uses "✗ … failed" or "pausing"), record the
   deviation: write `.continue-here.md` with reason `deviation`,
   `failedPhase`, `failedPlan`, the deviation message, and "Inspect
   the failure and re-run /cp-autonomous" as next-step. Jump to
   Step 5.
4. **Smart-gate: tests.** Read `cp config get cp.behavior.test_command`.
   If non-empty (and not the placeholder "echo skipped"), run it.
   Pipe the output to a tail-capture (last ~30 lines). On non-zero
   exit:
   - Write `.continue-here.md` with reason `test-failure`, the
     captured output, and "Debug the test failure" as next-step.
   - Jump to Step 5.
5. **Smart-gate: audit.** Run `cp audit --json`. If
   `summary.high > 0`:
   - Write `.continue-here.md` with reason `audit-high`, the HIGH
     findings list, and "Run /cp-audit-fix or address findings
     manually" as next-step.
   - Jump to Step 5.
6. Loop back to (1).

### 3c. Phase close-out

When the inner loop breaks naturally (no more pending plans in this
phase), do nothing special — `/cp-execute-phase` already ticked the
last plan and wrote SUMMARY. Move to the next phase.

## Step 4 — Scope-end completion

When the outer loop finishes (all phases in scope processed without
stopping):

- Re-run `cp status --json` to confirm.
- Print:
  ```
  ✓ cp autonomous: COMPLETE
    Milestone:        {name}
    Phases processed: {comma list}
    Total plans:      {sum}
    Suggested next:   /cp-complete-milestone "{name}" (if all phases done)
                      /cp-autonomous (if more phases remain in this or other milestone)
  ```
- Do NOT auto-invoke `/cp-complete-milestone`. The milestone close
  has its own UAT gate and the user should approve it explicitly.

## Step 5 — Stop UX (inline, never exit the session)

When a smart gate trips OR a delegate returns a deviation:

1. Confirm `.planning/.continue-here.md` was written. If the CLI
   didn't write it (because the inner failure happened at the agent
   layer, not in lib), write it yourself with the exact frontmatter:
   ```
   # cp autonomous — paused
   Stopped at: phase {N}, plan {NN-MM}
   Reason: {reason}
   Time: {ISO}

   ## Details
   {captured details}

   ## Next
   - {reason-specific next step}
   - Re-run `cp autonomous` (or `/cp-resume`) — execution picks up at
     the next pending plan
   <!-- written by /cp-autonomous skill -->
   ```
2. Print a stop block to the user:
   ```
   ✗ cp autonomous: STOPPED at phase {N} plan {NN-MM}
     Reason: {reason}
     See:    .planning/.continue-here.md
   ```
3. Prompt the user inline via `ask_user` with reason-tailored
   choices:

   | Reason | Choices |
   |---|---|
   | `test-failure` | "Debug now (open failing test)", "Skip this plan", "Stop" |
   | `audit-high` | "Run /cp-audit-fix", "Stop" |
   | `deviation` | "Inspect & retry", "Skip this plan", "Stop" |
   | `plan-failed` | "Re-run /cp-plan-phase {N}", "Stop" |
   | default | "Continue at next plan", "Stop" |

4. Act on the choice:
   - "Continue at next plan" → resume the per-phase loop at the
     next pending plan (i.e. re-run Step 3b from (1)).
   - "Skip this plan" → run `cp tick {NN-MM}` to mark done WITHOUT
     SUMMARY, then resume loop. Warn the user that an unsummarised
     skipped plan will be flagged by `cp audit`.
   - "Debug now" / "Inspect & retry" / "Run /cp-audit-fix" → invoke
     the relevant skill (`/cp-debug`, `/cp-audit-fix`, etc.) and
     after it returns, ask the user whether to resume.
   - "Stop" → finish this skill cleanly. Do not exit the session.

## Step 6 — Report

When the skill ends (success or user-chosen "Stop"), print:

```
cp autonomous: {COMPLETE | STOPPED}
  Milestone: {name}
  Phases done in this run: {comma list}
  Plans executed:           {N}
  Stop reason (if any):     {reason or "—"}
  Continue file (if any):   .planning/.continue-here.md
```

## Notes

- **Bounded to a single milestone.** Even with `--scope=milestone`,
  the CLI clamps to the active milestone's last phase. Cross-milestone
  drives are a separate skill, intentionally.
- **Idempotent on success.** Re-running `/cp-autonomous` after a
  successful completion is a no-op (CLI reports `phasesWouldRun: []`).
- **Each plan is one commit-bracket.** `/cp-execute-phase` already
  enforces "start" + body + SUMMARY + tick commits per plan. The
  smart gates here happen AFTER each plan's commits land, so a stop
  always leaves git clean.
- **No agent reasoning in the lib.** `cp autonomous` (the CLI) is
  used here only for `--check` previews and the gate primitives
  (`cp audit`, `cp status`). Per-plan delegation is in this skill.
