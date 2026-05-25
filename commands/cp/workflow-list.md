---
name: cp-workflow-list
description: List available workflow templates (built-in + project). Pass a name to show that template's YAML body.
argument-hint: "[<name>]"
requires: []
---

# /cp-workflow-list

You are running `cp-workflow-list`. Your job is to help the user
discover what workflows are available in the current project — both
the built-in templates that ship with cp and any custom templates
under `.planning/workflows/`.

This skill is a pure consumer of the v1.0 `cp workflow ls` and
`cp workflow show` CLI commands. It does no state mutation.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain a single optional positional `NAME`.

- No `NAME` → **list mode** (enumerate templates).
- `NAME` present → **show mode** (dump that template's YAML).

Sanitize: `NAME` must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`. Reject
shell metacharacters or path separators.

## Step 2 (list mode) — Enumerate templates

```bash
cp workflow ls --json
```

The JSON output is an array of objects like:

```json
[
  { "name": "debug", "source": "built-in", "binds_to": "custom" },
  { "name": "dev",   "source": "built-in", "binds_to": "milestone" },
  { "name": "quick", "source": "built-in", "binds_to": "custom" }
]
```

Render as a table for the user:

```
Available workflows:

  NAME    SOURCE      BINDS TO    DESCRIPTION
  ─────   ─────────   ─────────   ────────────────────────────
  debug   built-in    custom      <first principle from template>
  dev     built-in    milestone   <first principle from template>
  quick   built-in    custom      <first principle from template>
```

To derive the DESCRIPTION column, fetch the first `principles:`
entry from each template's YAML — call `cp workflow show <name>`
(per template) and grab the first item under `principles:`. If
`principles:` is empty or absent, use the template's `workflow:`
field plus binding tier as a fallback ("e.g. custom-bound, 3 phases").

If the project has any custom templates under `.planning/workflows/`,
they appear in the listing with `source: project`. Render them in a
separate "Project workflows" section below the built-ins.

End with:

```
Run one with:    /cp-workflow-run <name> [<run-name>]
Inspect one:     /cp-workflow-list <name>
Scaffold custom: /cp-workflow-new <name> [--from <built-in>]
```

## Step 2 (show mode) — Dump template YAML

```bash
cp workflow show <NAME>
```

- Exit 0 → print the YAML body verbatim inside a fenced code block,
  preceded by a brief framing line:

  ```
  Template `<NAME>` (source: <built-in | project>, binds to <binding>):

  ```yaml
  <YAML body>
  ```
  ```

- Exit 2 with "template not found" → print the error, then run
  `cp workflow ls` to suggest valid names. Stop.

End with:

```
Run this workflow:  /cp-workflow-run <NAME> <run-name>
Scaffold a copy:    /cp-workflow-new my-copy --from <NAME>
```

## Step 3 — Optional offer

After either mode, if the user appears to be exploring (e.g. this
was their first cp-workflow-* invocation in the session), offer:

> "Want me to run one for you? Pick a workflow and I'll start it
> with `/cp-workflow-run`."

Skip this offer if the user has already run a workflow in this
session.

## Notes

- Pure read-only skill — no state mutation, no `.planning/` writes.
- If `cp` is not on PATH (running outside an installed cp project),
  stop and tell the user: "cp CLI not found; run `cplan update` or
  install cp via `npm install -g context-planning`."
- The DESCRIPTION column intentionally uses each template's first
  `principles:` entry rather than a separate `description:` field,
  because the workflow schema doesn't have a top-level description
  today (deferred to a future schema rev).
