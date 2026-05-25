---
name: cp-workflow-validate
description: Validate a workflow template against the schema + DAG rules. Pass --strict to fail on warnings (CI mode).
argument-hint: "<name-or-path> [--strict]"
requires: []
---

# /cp-workflow-validate

You are running `cp-workflow-validate`. Your job is to validate a
workflow template — either a built-in name, a project-local template
under `.planning/workflows/<name>.yaml`, or a path to any YAML file —
against cp's schema and DAG rules.

This skill is a thin wrapper over `cp workflow validate`. It does no
state mutation.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- A required positional `NAME_OR_PATH`: a built-in name (e.g. `dev`),
  a project template name, or a filesystem path to a YAML file.
- An optional `--strict` flag: exit 2 on warnings too (CI usage).

If `NAME_OR_PATH` is missing: stop and instruct the user to either
pass a name or run `/cp-workflow-list` to see what's available.

Sanitize: if the argument doesn't look like a path (no `/` or `\`),
it must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Step 2 — Run validate

```bash
cp workflow validate <NAME_OR_PATH> [--strict]
```

## Step 3 — Render the result

- **Exit 0** → print:
  ```
  ✓ Template `<NAME_OR_PATH>` is valid.
  ```
  If any warnings appeared on stderr, list them under "Warnings:" so
  the user sees them even on success.

- **Exit 2 with errors** → print:
  ```
  ✗ Template `<NAME_OR_PATH>` failed validation.

  Errors:
    - <error 1>
    - <error 2>
  ```
  Suggest the next step: edit the template (`/cp-workflow-show
  <NAME>` to inspect, edit the file, re-run validate). If the user
  was trying to use this from CI (mentioned `--strict`), suggest
  dropping `--strict` to see if it's only warnings, not errors.

- **Exit 3** ("template not found") → suggest
  `/cp-workflow-list` to enumerate valid names.

## Step 4 — Optional follow-up

If validation passed:

> "Want to see the deduced execution sequence?
> `/cp-workflow-inspect <NAME>` shows the YAML plus the wave-by-wave
> plan."

## Notes

- Pure read-only — no `.planning/` writes.
- `--strict` is the CI mode; warnings won't normally fail a build
  unless you opt into it.
- For YAML syntax errors (malformed file before schema checks),
  `cp workflow validate` returns exit 2 with the parser error in the
  message — surface it verbatim; don't try to re-parse the YAML in
  the skill.
