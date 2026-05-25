---
name: cp-workflow-export
description: Export a built-in workflow template to a YAML file you can edit. Pairs with /cp-workflow-import for round-trip customization.
argument-hint: "<name> [--out <path>] [--as <new-name>] [--force]"
requires: []
---

# /cp-workflow-export

You are running `cp-workflow-export`. Your job is to export a
built-in (or any resolvable) workflow template to a YAML file the
user can edit. This is the export half of round-trip customization;
for the full export→edit→validate→import flow as a single user
action, use `/cp-workflow-customize` instead.

This skill is a thin wrapper over `cp workflow export` (new in
v1.1). It does no `.planning/` writes itself — `cp workflow export`
writes to wherever `--out` points (default: cwd).

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- A required positional `NAME`: a built-in or project template name.
- Optional `--out <path>`: destination file. Default:
  `./<as-or-name>.yaml` (cwd-relative — visible before you commit).
- Optional `--as <new-name>`: rewrite the top-level `workflow:` key
  in the exported file. Useful when exporting a built-in to
  customize as a new template (avoids the hand-edit step before
  importing).
- Optional `--force`: overwrite an existing destination file.

If `NAME` is missing: stop and suggest `/cp-workflow-list`.

Sanitize `NAME` and `--as` against `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Step 2 — Run export

```bash
cp workflow export <NAME> [--out <path>] [--as <new-name>] [--force]
```

cp validates the resolved template before writing (even with
`--force`), so an invalid template never lands on disk.

## Step 3 — Render

- **Exit 0** → print the destination path and the natural follow-up:
  ```
  ✓ Exported `<NAME>` to `<dest>`.

  Next: edit the file, then re-import:
        /cp-workflow-validate <dest>          # check edits before importing
        /cp-workflow-import <dest> --force    # update the project template
  ```

  If the export used `--as <new-name>`, suggest importing under that
  new name instead:
  ```
  /cp-workflow-import <dest>      # imports as <new-name>
  ```

- **Exit 3** ("template not found") → suggest `/cp-workflow-list`.

- **Exit 6** (destination exists, refused without `--force`) → tell
  the user; offer `--force` (with confirmation) or a different
  `--out`.

## Step 4 — Confirm with the user before destructive ops

If `--force` would overwrite an existing file, summarize the path
and ask one yes/no question before running. Don't auto-pass
`--force`.

## Notes

- `cp workflow export` rewrites the `workflow:` YAML key (when
  `--as` is used) via a line-precise regex — comments and indentation
  are preserved. Diffs between an exported file and its re-export
  are minimal.
- The `# template: …` source-attribution header that `cp workflow
  show` prints is stripped from the export (it's metadata, not part
  of the template).
- For the round-trip "tweak a built-in into a new project template"
  flow as one user-facing action, prefer `/cp-workflow-customize`
  — it bundles export + interactive edit cue + validate + import.
