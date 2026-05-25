---
name: cp-workflow-show
description: Pretty-print a workflow template's YAML body to inspect what `cp run` will execute.
argument-hint: "<name>"
requires: []
---

# /cp-workflow-show

You are running `cp-workflow-show`. Your job is to print a workflow
template's YAML body so the user can see exactly what `cp run
<name>` will execute — including phases, dependencies, roles, and
prompts.

This skill is a thin wrapper over `cp workflow show`. It does no
state mutation.

## Step 1 — Parse arguments

`$ARGUMENTS` must contain a single positional `NAME` (a built-in or
project template name).

If `NAME` is missing: stop and run `/cp-workflow-list` (or instruct
the user to) to enumerate available templates.

Sanitize: `NAME` must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`. Reject
path separators — for arbitrary YAML files use `cp workflow show` in
your shell directly.

## Step 2 — Run show

```bash
cp workflow show <NAME>
```

## Step 3 — Render

- **Exit 0** → print a brief framing line then the YAML body inside
  a fenced code block:

  ```
  Template `<NAME>` (source: <built-in | project>):

  ```yaml
  <YAML body>
  ```
  ```

  The first line of `cp workflow show`'s stdout is a `# template:`
  comment that already states the source; you can either keep it as
  the first line of the fence or strip it for cleaner output (your
  call based on context).

- **Exit 3** ("template not found") → surface the error and run
  `/cp-workflow-list` to suggest valid names.

## Step 4 — Optional follow-up

> "Want the wave-by-wave execution order?
> `/cp-workflow-inspect <NAME>` shows the YAML plus deduced waves.
> Ready to run it? `/cp-workflow-run <NAME> <run-name>`."

## Notes

- Pure read-only — `cp workflow show` only reads.
- For round-trip customization (export → edit → import as new name),
  use `/cp-workflow-customize <NAME>` instead — it's the higher-level
  workflow.
- `cp workflow show` dumps the YAML verbatim including comments and
  indentation; the output is a valid input to
  `cp workflow validate` and `cp workflow import`.
