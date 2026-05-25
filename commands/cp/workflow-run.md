---
name: cp-workflow-run
description: Drive any cp workflow to completion. Wraps `cp run <workflow> <name>` + the mark-complete wave loop. Generic over all built-in and custom workflows.
argument-hint: "<workflow> [<name>] [--plan-only] [--scope=...] [--check]"
requires: []
---

# /cp-workflow-run

You are running `cp-workflow-run`. Your job is to start a cp workflow
(built-in or custom) and drive its wave-by-wave execution loop to
completion, delegating each phase to the appropriate provider role
skill. This is the **outer orchestrator** for any workflow; the inner
work — actually performing a phase — is delegated to the role skill
resolved by `cp doctor`.

This skill is the agent-side wrapper over the v1.0 `cp run` CLI
family. It uses `cp run` for all state mutation and instruction
emission; never mutates `.planning/runs/` directly.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- A required positional `WORKFLOW`: the template name (e.g. `quick`,
  `debug`, `dev`, or a custom template under
  `.planning/workflows/<name>.yaml`).
- An optional positional `NAME`: the run slug. **Required** for
  milestone- and phase-bound workflows; **optional** for
  custom-bound workflows (cp generates one if omitted).
- `--plan-only` → preview the wave plan and exit before any state
  mutation. Useful for "what would this do?" inspection.
- `--scope=phase|<N>|<N-M>|milestone` → restrict the loop's scope.
  Same semantics as `cp-autonomous`:
  - `phase` → just the next pending phase, then stop.
  - `<N>` → next N phases (inclusive).
  - `<N>-<M>` → explicit phase range.
  - `milestone` (DEFAULT) → all remaining phases of the run.
- `--check` → preview waves like `--plan-only`, but additionally show
  the role-skill mapping that would be invoked.

If `WORKFLOW` is missing: stop and instruct the user to run
`/cp-workflow-list` to see available templates.

Sanitize: reject any value that contains shell metacharacters or
path separators. `WORKFLOW` must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`;
`NAME` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.

## Step 2 — Validate the workflow exists

```bash
cp workflow validate <WORKFLOW> --strict
```

- Exit 0 → proceed to Step 3.
- Exit 2 with "template not found" → stop. Print the stderr verbatim
  and append: "Run `/cp-workflow-list` to see available templates."
- Exit 2 with validation errors → stop. Print the errors. Suggest:
  "Edit `.planning/workflows/<WORKFLOW>.yaml` to fix, or pick a
  different template with `/cp-workflow-list`."

## Step 3 — Resolve provider roles via `cp doctor`

```bash
cp doctor
```

Parse the "Roles → resolved skill" block. Cache the mapping —
typically:

```
brainstorm -> superpowers/brainstorming
plan       -> superpowers/writing-plans
execute    -> superpowers/subagent-driven-development
review     -> superpowers/requesting-code-review
finish     -> superpowers/finishing-a-development-branch
worktree   -> superpowers/using-git-worktrees
tdd        -> superpowers/test-driven-development
debug      -> superpowers/systematic-debugging
verify     -> superpowers/verification-before-completion
```

For each phase the workflow declares (visible via `cp workflow show
<WORKFLOW>`), confirm its `role:` has a resolved skill. If any role
maps to nothing (provider = `manual`, or skill not installed):

- Print the gap and ask the user: "Role `<role>` for phase `<phase>`
  has no resolved skill. Continue with manual fallback for that
  phase (you'll do the work yourself), or abort and install the
  provider?"
- If manual fallback is accepted: record which phases are manual and
  carry that decision into the wave loop.

## Step 4 — Start the run

If `--check` or `--plan-only`:

```bash
cp run <WORKFLOW> <NAME> --plan-only
```

Print the emitted wave plan to the user, plus (if `--check`) the
resolved role→skill mapping per phase. Stop.

Otherwise:

```bash
cp run <WORKFLOW> <NAME>
```

- Capture `slug` from stderr (line matches `slug:\s+(\S+)`). If
  `NAME` was provided, slug == NAME; otherwise cp generated one.
- Capture wave 1's emitted block from stdout (everything up to the
  first `---` separator or end-of-output).
- On exit 2 (missing run name for milestone-bound workflow): ask the
  user for a name, retry once.
- On any other non-zero exit: print stderr, stop.

## Step 5 — Wave loop

Repeat until the run is complete or a smart-gate stops execution:

### 5.1 — Parse the current wave block

Each emitted wave block from `cp run` / `cp run mark-complete` /
`cp run resume` follows this shape (from `bin/commands/run.js`
formatting):

```
Global directives (apply to every phase of this workflow):
  Project constraints:
    ...
  Workflow principles:
    ...

Wave N of M — K phase(s) to execute:

Phase: <phase-id>
  role:  <role>
  model: <model-hint or absent>
  skill: <explicit-skill or absent>
  persist_output: <path or absent>
  prompt: |
    <multi-line prompt body>

When all phases in this wave are complete, run:
  cp run mark-complete <slug> <phase-id> < summary.md
```

Extract for each phase in the wave: `phase-id`, `role`, `model`,
`skill`, `persist_output`, and the multi-line `prompt:` body.

### 5.2 — Dispatch each phase

For each phase in the wave:

1. Resolve the skill: use the explicit `skill:` field if present;
   otherwise the cached `role -> skill` from Step 3.
2. Invoke that skill, passing:
   - The phase's prompt body
   - The Global directives block (so the skill respects project
     constraints + workflow principles)
   - The model hint (if the harness supports per-skill model overrides)
3. Collect the skill's output. For phases with `persist_output:`,
   write the raw output to the declared path.
4. Derive a SUMMARY.md content for the phase from the skill's output
   — typically a "what happened / what's next / open questions"
   block. Keep it concise (≤500 words).

If the workflow declares parallel phases in this wave, dispatch them
in parallel where the harness supports it; otherwise dispatch
sequentially.

### 5.3 — Smart-gate checks (after each phase)

Before marking a phase complete, run the same stop-conditions
`cp-autonomous` enforces:

1. **Test failure** — if the phase ran any code, invoke
   `npm test` (or the project-configured test command). On any
   non-zero exit, stop.
2. **Audit HIGH** — `cp audit --json | jq '.findings[] | select(.severity=="HIGH")'`.
   If any HIGH finding is returned, stop.
3. **Executor deviation** — if the execute skill's output contains
   the sentinel string `DEVIATION:` or returns control with a
   "deviation" status, stop.

On any smart-gate trip:

- Write `.planning/.continue-here.md` with: current slug, phase-id,
  wave number, reason for stop, suggested fix, command to resume
  (`/cp-workflow-resume <slug>` or `/cp-workflow-resume <slug>
  --retry <phase-id>`).
- Do NOT call `cp run mark-complete` for the failed phase. Surface
  the stop to the user with the path to `.continue-here.md` and the
  resume command. Stop the wave loop.

### 5.4 — Mark the phase complete

```bash
cp run mark-complete <slug> <phase-id> < summary.md
```

- Exit 0 → STATE advanced; the next wave's block (if any) is on
  stdout. Loop back to Step 5.1.
- Exit with "run complete" sentinel (check for `status: complete` in
  the output) → exit the loop, proceed to Step 6.
- Exit non-zero with other errors (wrong phase id, missing slug):
  print stderr, ask user to resolve manually, stop.

### 5.5 — `--scope` enforcement

After each phase completes, check the `--scope` flag:

- `--scope=phase` → after the first phase completes, exit the loop
  cleanly (do NOT mark the run abandoned; just stop here).
- `--scope=<N>` → exit after N phases.
- `--scope=<N>-<M>` → exit after phase `<M>` completes.
- `--scope=milestone` (default) → run to completion.

On scope-bounded exit, write `.planning/.continue-here.md` with the
current slug and suggested resume command, so the user can pick up
later.

## Step 6 — Report

On clean completion:

```
✓ Workflow run complete: <slug>
  Workflow:    <workflow-name>
  Binding:     <custom | phase | milestone>
  Waves done:  M of M
  Phases done: <list of phase-ids>
  Run dir:     .planning/runs/<slug>/   (or appropriate binding dir)

Next: review the summaries, or start another run with /cp-workflow-list.
```

On smart-gate stop:

```
⚠ Workflow run stopped: <slug>
  Reason:      <test-failure | audit-HIGH | executor-deviation>
  Phase:       <phase-id> (wave <N>)
  Continue:    .planning/.continue-here.md

To resume after fixing the issue:
  /cp-workflow-resume <slug>
  /cp-workflow-resume <slug> --retry <phase-id>   (to rewind that phase)
```

On scope-bounded exit:

```
◷ Workflow run paused at scope boundary: <slug>
  Scope:       <--scope value>
  Phases done: <list>
  Continue:    /cp-workflow-resume <slug>
```

## Notes

- Never mutate `.planning/runs/<slug>/` directly. All state changes
  go through `cp run` sub-commands.
- The role-skill resolution is **per-invocation**, not cached across
  runs. If the user installs a new provider mid-session, re-running
  `cp-workflow-run` picks it up.
- For `--plan-only` and `--check`, no state is mutated; the run
  directory is NOT created.
- If the underlying `cp run` CLI surface ever changes (new flag, new
  stdout format), this skill must change with it. The CLI is the
  contract; this skill is its consumer.
- This skill is the integration point that `/cp-quick` and
  `/cp-autonomous` delegate to in v1.1+. Argv shapes for
  `--scope`/`--check` MUST match `cp-autonomous`'s historical
  contract so those shims remain transparent.
