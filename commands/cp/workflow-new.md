---
name: cp-workflow-new
description: Scaffold a new workflow template (blank or copied from a built-in) and validate it. Use when the user wants to author a fresh custom workflow.
argument-hint: "<new-name> [--from <built-in>] [--force]"
requires: []
---

# /cp-workflow-new

You are running `cp-workflow-new`. Your job is to help the user author
a brand-new workflow template — either from a blank scaffold or starting
from one of the built-in templates (`quick`, `dev`, `debug`) as a
template to mutate.

This skill is a thin agent-side wrapper around the v1.0 `cp workflow new`
and `cp workflow validate` CLI commands. It does the user-experience
glue (prompting for edits, validating the result) so the user never has
to drop to a terminal.

**When to use this skill vs `cp-workflow-customize`:**
- Use `cp-workflow-new` when the user wants to **author** a workflow
  (blank slate or distant variation of a built-in).
- Use `cp-workflow-customize` when the user wants to **tweak** an
  existing built-in (most fields stay; small edits).

If you're not sure which to use, ask the user.

## Step 1 — Parse arguments

`$ARGUMENTS` contains the user's invocation. Parse:

- `NEW_NAME` (required, positional) — the name of the new template.
  Must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`. Reject shell metacharacters,
  path separators, or empty strings.
- `--from <BUILT_IN>` (optional) — copy this built-in as the starting
  point. Acceptable values: any name from `cp workflow ls --json` with
  `source: built-in`.
- `--force` (optional) — overwrite an existing template file.

If `NEW_NAME` is missing or invalid, print usage and stop:
```
Usage: /cp-workflow-new <new-name> [--from <built-in>] [--force]
```

## Step 2 — Check for name collision

```bash
cp workflow ls --json
```

Parse the JSON output. If `NEW_NAME` already appears in the list:

- If the existing entry is `source: built-in`: refuse — built-in names
  are reserved. Tell the user to pick a different name or use
  `/cp-workflow-customize <built-in>` to tweak the built-in.
- If `source: project` and `--force` is **not** set: refuse with
  ```
  Template "<NEW_NAME>" already exists in .planning/workflows/.
  Pass --force to overwrite, or use /cp-workflow-customize for an
  edit-existing workflow.
  ```
- If `source: project` and `--force` **is** set: continue (will be
  overwritten in Step 3).

## Step 3 — Ensure project workflow directory exists

```bash
cp workflow init
```

Idempotent — no-op if `.planning/workflows/` already exists. Always
safe to run.

## Step 4 — Scaffold the template file

```bash
cp workflow new <NEW_NAME> [--from <BUILT_IN>] [--force]
```

Capture the printed destination path (typically
`.planning/workflows/<NEW_NAME>.yaml`).

On non-zero exit, report the CLI's stderr verbatim and stop.

## Step 5 — Open file for editing

Tell the user:

```
✓ Scaffolded: .planning/workflows/<NEW_NAME>.yaml

This is a fresh template. Open it in your editor and customize:
  - workflow:    keep as "<NEW_NAME>"
  - binds_to:    "milestone" (multi-phase) or "custom" (one-shot)
  - principles:  guiding rules for the agent
  - phases:      the wave-by-wave plan (id, role, prompt, depends_on)

Reference the built-in templates for shape:
  /cp-workflow-list dev      ← multi-phase example
  /cp-workflow-list quick    ← one-shot example

When you're done editing, tell me and I'll validate it.
```

Wait for the user to confirm edits are complete.

## Step 6 — Validate

```bash
cp workflow validate <NEW_NAME> --strict
```

`--strict` makes warnings exit non-zero — catches subtle issues like
unreferenced roles or dependency cycles.

- On success: continue to Step 7.
- On failure: print the validator's errors verbatim. Offer to:
  (a) re-open the file for another pass (return to Step 5), or
  (b) abandon and `rm .planning/workflows/<NEW_NAME>.yaml`.
  Let the user choose.

## Step 7 — Confirm and report

```bash
cp workflow ls
```

Verify `<NEW_NAME>` appears in the listing with `source: project`.

Report:
```
✓ Template "<NEW_NAME>" ready.
  Source:    .planning/workflows/<NEW_NAME>.yaml
  Validated: yes (strict)
  Binds to:  <binds_to>

Try it:
  /cp-workflow-run <NEW_NAME>
```

## Notes

- This skill does **not** touch `.planning/PROJECT.md`, `ROADMAP.md`,
  or `STATE.md` — it's pure template authoring.
- The `cp workflow new --from <built-in>` flag copies the built-in's
  YAML body as a starter. If the user wants a *deep* customization,
  `cp-workflow-customize` is the better entrypoint (it round-trips
  through export, preserves more structure, and handles the
  `workflow:` key rename automatically).
- If validation keeps failing, suggest `/cp-workflow-list <built-in>`
  to remind the user of the canonical template shape.
- After the template is ready, the next user action is almost always
  `/cp-workflow-run <NEW_NAME>`. Make that hint visible.
