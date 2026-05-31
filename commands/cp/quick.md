---
name: cp-quick
description: Lightweight ad-hoc task. Scaffolds a quick DESIGN.md + STATE.md, drives it through the quick workflow, records SUMMARY.md. No phase/roadmap baggage.
argument-hint: "<task description>"
requires: []
---

# /cp-quick

You are running `cp-quick`. This is a thin wrapper around the
`quick` workflow (Decision #10 of the v1.4 milestone). The workflow
does the real work; you only delegate.

## Step 1 — Sanitize

Trim `$ARGUMENTS`. Reject if empty.

If the user passed a `--full` flag, strip it from the task text —
`--full` switches the design phase's skill from the lightweight
quick-design skill to the full plan skill (handled by the workflow
runtime via param defaults).

If the user passed `--project <path>` (or its alias `--projectDir <path>`),
capture the value into `$PROJECT_PATH` and strip the flag and its
value from the task text. The remaining text is the task name.
Examples (all equivalent — both produce task `"fix login bug"` bound
to `./services/auth`):

    /cp-quick fix login bug --project ./services/auth
    /cp-quick fix login bug --projectDir ./services/auth
    /cp-quick --project ./services/auth fix login bug

If no project flag is passed, `$PROJECT_PATH` is empty and the run
binds to the cwd-resolved repo root (existing behavior).

## Step 2 — Delegate

Invoke:

    cp run quick "$ARGUMENTS"

If `$PROJECT_PATH` was extracted in step 1, append `--projectDir`:

    cp run quick "$ARGUMENTS" --projectDir "$PROJECT_PATH"

(For `--full`, pass `--param design_skill=$(cp config get cp.provider.plan_skill)`
in addition. `--full` and `--project` may be combined.)

Stream the workflow output to the user. Do NOT inline-perform any
brainstorm, design, or implementation work — the workflow's supervised
phases handle each step. Follow the per-phase instructions that
`cp run` emits exactly.

## Step 3 — Stop on errors

If `cp run` exits non-zero, surface the error to the user and stop.
Do not attempt to resume — that's `/cp-resume`.

## Notes

- The quick workflow uses `supervised: true`. The harness LLM
  (you) plays the supervisor role for the `design` and `execute`
  phases; the `setup` and `finalize` phases are deterministic
  CLI calls (no supervision needed).
- All state lives at `.planning/quick/<YYYY-MM-DD>-<slug>/` (created
  by `cp quick-setup`) and `.planning/runs/<run-slug>/state.json`
  (supervisor state).
- **`--project <path>`** binds the quick task to a specific project
  directory instead of the cwd-resolved repo root. Useful in
  multi-project repos where one git root contains several
  `.planning/`-rooted projects, or when invoking `/cp-quick` from
  outside the project tree. `<path>` is the project root (the
  directory that contains, or will contain, `.planning/`); relative
  paths resolve against cwd. State lands at
  `<path>/.planning/quick/<date>-<slug>/`. The path is forwarded to
  `cp run` as `--projectDir` under the hood.
