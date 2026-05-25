---
name: cp-workflow-resume
description: Resume, retry, or inspect an existing cp workflow run. Lists active runs when invoked with no slug.
argument-hint: "[<slug>] [--retry <phase-id>] [--abandon]"
requires: []
---

# /cp-workflow-resume

You are running `cp-workflow-resume`. Your job is to pick up an
existing cp workflow run that was paused (smart-gate stop,
scope-bounded exit, manual interruption) or to retry a specific phase
that needs rework.

This skill is a thin wrapper over `cp run resume`, `cp run retry`,
`cp run abandon`, and `cp run status`. The actual wave-loop execution
logic lives in `/cp-workflow-run` — this skill hands off to it after
restoring run state.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- Optional positional `SLUG`: the run slug to operate on.
- Optional flag `--retry <phase-id>`: roll back that phase and
  re-enter the wave loop at it.
- Optional flag `--abandon`: mark the run abandoned (no further
  execution).

Mode selection:

| Args | Mode |
|---|---|
| (none) | **enumeration** — list all active runs |
| `<SLUG>` only | **resume** — pick up at current wave |
| `<SLUG> --retry <phase-id>` | **retry** — rewind that phase, re-enter loop |
| `<SLUG> --abandon` | **abandon** — flip status, stop |

Sanitize: `SLUG` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`;
`<phase-id>` must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`. Reject shell
metacharacters or path separators.

## Step 2 (enumeration mode) — List active runs

```bash
cp run status --json
```

Render as a table:

```
Active workflow runs:

  SLUG              WORKFLOW   BINDING     WAVE      STATUS         STARTED
  ───────────────   ────────   ─────────   ───────   ────────────   ──────────
  fix-login-bug     debug      custom      2 of 5    in_progress    2026-05-25
  v1-1-skills-43    dev        milestone   3 of 5    in_progress    2026-05-25
  smoke-test        quick      custom      —         complete       2026-05-25
```

If no runs are active, print:

```
No active workflow runs.

Start one with:  /cp-workflow-list  (to see available templates)
                 /cp-workflow-run <workflow> [<run-name>]
```

Otherwise, end with:

```
Pick one to resume:  /cp-workflow-resume <slug>
To retry a phase:    /cp-workflow-resume <slug> --retry <phase-id>
To abandon a run:    /cp-workflow-resume <slug> --abandon
```

Stop.

## Step 3 (resume mode) — Sanity-check the run

```bash
cp run status <SLUG> --json
```

- Exit 0 → parse the JSON. If `status: complete`, tell the user:
  "Run `<slug>` is already complete (workflow `<wf>`, all `<M>`
  waves done). Nothing to resume." Stop.
- Exit 0 with `status: in_progress | paused` → proceed.
- Exit 0 with `status: abandoned` → tell the user: "Run `<slug>` was
  abandoned. To start fresh, use `/cp-workflow-run <wf> <new-name>`."
  Stop.
- Exit non-zero with "run not found" → suggest
  `/cp-workflow-resume` (no args) to enumerate; suggest the user
  may have mistyped the slug. Stop.

## Step 3a (abandon flow) — `--abandon`

```bash
cp run abandon <SLUG> --yes
```

- Exit 0 → confirm to user: "Run `<slug>` abandoned. Run dir
  preserved at `.planning/runs/<slug>/` for reference; STATE marked
  abandoned."
- Exit non-zero → print stderr, stop.

Stop here. Do NOT enter the wave loop.

## Step 3b (retry flow) — `--retry <phase-id>`

```bash
cp run retry <SLUG> <phase-id>
```

- Exit 0 → STATE rewound; the wave containing `<phase-id>` is now
  the current wave. The CLI emits the rewound wave's prompt to
  stdout. Capture it.
- Exit non-zero with "phase not part of run" → print stderr, suggest
  `cp run status <SLUG>` to inspect, stop.

Proceed to Step 4 with the freshly emitted wave prompt.

## Step 3c (plain resume flow) — no flag

```bash
cp run resume <SLUG>
```

- Exit 0 → CLI emits the current wave's prompt to stdout (idempotent
  — re-emits the same prompt if you call it twice). Capture it.
- Exit non-zero → print stderr, stop.

Proceed to Step 4 with the freshly emitted wave prompt.

## Step 4 — Hand off to the wave loop

At this point the run is in a state where the next wave's prompt
has been emitted by the CLI and captured by this skill. The
wave-loop execution logic — parsing the wave block, dispatching
each phase to its role skill, smart-gate checks, `cp run
mark-complete`, scope-bounded exit — is **identical to
`/cp-workflow-run` from its Step 5 onward**.

Do NOT re-implement that logic here. Instead, transition to
`/cp-workflow-run`'s Step 5 with the following pre-conditions
already satisfied:

- The workflow is validated (it was, when the run was originally
  started).
- `cp doctor` role mappings should be re-resolved (`cp doctor`
  call) since they may have changed since the original start.
- The slug is `<SLUG>` (from this skill's args).
- The current wave's prompt block is in hand (from Step 3b or 3c
  above).

Run `cp doctor` to refresh role mappings, then follow
`/cp-workflow-run`'s Step 5 (Wave Loop) and Step 6 (Report) to
completion.

## Notes

- `--scope` is intentionally NOT supported here. If you want to
  resume only a bounded scope of a run, abandon the current run and
  start a fresh one with `/cp-workflow-run <wf> <new-name>
  --scope=...`. Resuming with a different scope than the original
  run was started with would create inconsistent STATE.
- `--retry <phase-id>` only rewinds within the same run; it does not
  re-validate the template or change the workflow.
- If the user passes both `--retry` and `--abandon`, the abandon
  wins (silently — abandon is destructive and unambiguous).
- This skill never directly mutates `.planning/runs/<slug>/`. All
  state changes go through `cp run` sub-commands.
