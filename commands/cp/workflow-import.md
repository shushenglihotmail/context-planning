---
name: cp-workflow-import
description: Import an external workflow YAML into the project (validate + copy into .planning/workflows/).
argument-hint: "<path> [--name <override>] [--force]"
requires: []
---

# /cp-workflow-import

You are running `cp-workflow-import`. Your job is to import an
external workflow YAML file into the current project — validating it
first, then copying it into `.planning/workflows/`.

This skill is a thin wrapper over `cp workflow import`. For
round-trip customization of a built-in (export → edit → import as
new name), use `/cp-workflow-customize` instead — it bundles the
full export+edit+import flow.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- A required positional `PATH`: filesystem path to a YAML file (the
  external template to import).
- Optional `--name <override>`: rename the imported template (the
  default name comes from the file's `workflow:` field). Useful when
  the YAML's internal name clashes with an existing project template.
- Optional `--force`: overwrite an existing
  `.planning/workflows/<name>.yaml`.

If `PATH` is missing: stop and ask the user for the path to the
external YAML they want to import.

Sanitize `--name` (if present) against `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Step 2 — Validate-then-import

```bash
cp workflow import <PATH> [--name <override>] [--force]
```

cp validates the file first and refuses to copy if validation fails.

## Step 3 — Render

- **Exit 0** → import succeeded. Print the destination path and
  suggest next steps:
  ```
  ✓ Imported as `.planning/workflows/<name>.yaml`.

  Next: /cp-workflow-validate <name>      # sanity-check
        /cp-workflow-inspect <name>       # see wave order
        /cp-workflow-run <name> <slug>    # run it
  ```

- **Exit 2** with validation errors → surface verbatim. Suggest
  the user edit the source file (path printed in the error) and
  re-run import. Optionally point at `/cp-workflow-validate <path>`
  for iterative checks before importing.

- **Exit 6** (file exists, refused without `--force`) → tell the
  user the destination already exists; offer either re-running with
  `--force` (overwrites) or with `--name <new>` (imports under a
  different name). Do **not** auto-pass `--force` without explicit
  user confirmation.

## Step 4 — Confirm with the user before destructive ops

If the user asked to import with `--force` or in a way that would
overwrite an existing project template, summarize what will be
overwritten and ask one yes/no question before running.

## Notes

- The `--name` flag rewrites the destination filename only, not the
  internal `workflow:` YAML key. If the imported template's internal
  name doesn't match its filename, validation will fail. Use the
  source's `workflow:` field as your default `--name` or rename the
  YAML key manually first.
- For *creating* a new template from scratch (or from a built-in
  clone), use `/cp-workflow-new` instead.
- For the full round-trip "tweak a built-in" flow, use
  `/cp-workflow-customize` — it's strictly better than calling
  `/cp-workflow-export` + edit + `/cp-workflow-import` manually.
