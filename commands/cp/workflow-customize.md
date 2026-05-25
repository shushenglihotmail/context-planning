---
name: cp-workflow-customize
description: Round-trip customize a built-in workflow — export it, let the user edit, validate, then import as a new template. Use when the user wants to tweak an existing built-in workflow.
argument-hint: "<built-in> [<new-name>] [--out <path>] [--force]"
requires: []
---

# /cp-workflow-customize

You are running `cp-workflow-customize`. Your job is to walk the user
through the export → edit → import round-trip for customizing a
built-in workflow template — so they end up with their own named
project-local variant without ever hand-editing YAML in the terminal.

This skill ties together three v1.0/v1.1 CLI primitives:
- `cp workflow export` (v1.1, plan 44-01) — write template YAML to a
  file, optionally renaming via `--as`
- `cp workflow validate` (v1.0) — ensure the edited template is sound
- `cp workflow import` (v1.0) — register the result as a project template

**When to use this skill vs `cp-workflow-new`:**
- Use `cp-workflow-customize` when the user wants to **tweak** an
  existing built-in (most of the template stays; small surgical edits).
- Use `cp-workflow-new` when the user wants to **author** from a blank
  slate or write something distantly related to a built-in.

If unsure, ask.

## Step 1 — Parse arguments

`$ARGUMENTS` contains the user's invocation. Parse:

- `BUILT_IN` (positional, optional in this skill — see Step 2) — the
  built-in template name to customize. Acceptable values: any name from
  `cp workflow ls --json` with `source: built-in` (today: `dev`,
  `debug`, `quick`).
- `NEW_NAME` (positional, optional in this skill — see Step 3) — the
  name the customized template will be registered under.
- `--out <PATH>` (optional) — explicit destination for the export file.
  Defaults to `.planning/workflows/<NEW_NAME>.yaml` if `cp workflow init`
  has been run, else `./<NEW_NAME>.yaml`.
- `--force` (optional) — allow overwrite of an existing destination file
  AND an existing imported template of the same name.

Sanitize: `BUILT_IN` and `NEW_NAME` must each match
`^[A-Za-z0-9][A-Za-z0-9_-]*$`. Reject shell metacharacters or path
separators.

## Step 2 — Resolve the built-in (interactive if missing)

If `BUILT_IN` was supplied: run `cp workflow ls --json`, confirm an
entry exists with that name and `source: built-in`. If not, list the
available built-ins and ask the user to pick.

If `BUILT_IN` was NOT supplied:

```bash
cp workflow ls --json
```

Filter to entries where `source == "built-in"`. Present as a small
table:

```
Available built-in workflows:
  - quick   one-shot tasks (binds_to: custom)
  - dev     multi-phase milestone work (binds_to: milestone)
  - debug   debugging session (binds_to: custom)

Which would you like to customize?
```

Ask the user to choose. Set `BUILT_IN` to their answer.

## Step 3 — Resolve the new name (interactive if missing)

If `NEW_NAME` was supplied: verify it does NOT collide with any
existing template (built-in or project) unless `--force` is set. Refuse
collisions with built-in names regardless of `--force` (you cannot
override a built-in).

If `NEW_NAME` was NOT supplied: prompt the user. Suggest a default like
`my-<BUILT_IN>` (e.g. `my-dev`). Re-check for collisions once they
answer.

## Step 4 — Resolve the destination path

If `--out` was supplied: use the supplied path (resolve relative to
cwd).

Otherwise check whether `.planning/workflows/` exists:
- If yes: default to `.planning/workflows/<NEW_NAME>.yaml`.
- If no: default to `./<NEW_NAME>.yaml` (cwd).

Tell the user the resolved path before proceeding.

## Step 5 — Export

```bash
cp workflow export <BUILT_IN> --as <NEW_NAME> --out <OUT_PATH> [--force]
```

`cp workflow export` (added in plan 44-01) does three things in one shot:
- Reads the built-in's YAML
- Strips the `# template: ...` source comment header
- Rewrites the embedded `workflow:` key to `<NEW_NAME>`
- Validates the result before writing
- Writes to `<OUT_PATH>`

On collision without `--force`, exit code is 6. If that happens, ask the
user whether to overwrite — re-run with `--force` if they confirm.

On other non-zero exit: print stderr verbatim and stop.

## Step 6 — Open for editing

Tell the user:

```
✓ Exported: <OUT_PATH>

The file has:
  - workflow: <NEW_NAME>  (renamed from "<BUILT_IN>")
  - All of <BUILT_IN>'s phases, principles, and defaults

Open <OUT_PATH> in your editor and customize. Common edits:
  - Change `principles:`  to your team's guiding rules
  - Add / remove phases   from the `phases:` list
  - Reorder dependencies  (`depends_on:` on each phase)
  - Update prompts        to match your project context

When you're done editing, tell me and I'll validate + import it.
```

Wait for the user to confirm.

## Step 7 — Validate

```bash
cp workflow validate <OUT_PATH> --strict
```

Use the file path (not the name) — the template is not yet registered.
`--strict` makes warnings fail (catches unreferenced roles, cycles).

- On success: continue to Step 8.
- On failure: print the validator's errors verbatim. Offer to:
  (a) re-open the file for another pass (return to Step 6),
  (b) abandon and `rm <OUT_PATH>`.

## Step 8 — Import

```bash
cp workflow import <OUT_PATH> [--force]
```

`import` validates again, then copies to
`.planning/workflows/<NEW_NAME>.yaml`. If `<OUT_PATH>` is already in
`.planning/workflows/`, the copy is idempotent.

On collision without `--force` (template name already registered),
re-run with `--force` if the user wants to overwrite the existing
project template.

## Step 9 — Confirm and report

```bash
cp workflow ls
```

Verify `<NEW_NAME>` appears with `source: project`.

Report:
```
✓ Customized template "<NEW_NAME>" ready.
  Based on:   <BUILT_IN>
  Source:     .planning/workflows/<NEW_NAME>.yaml
  Edit file:  <OUT_PATH>
  Validated:  yes (strict)

Try it:
  /cp-workflow-run <NEW_NAME>

To re-customize later: edit <OUT_PATH> directly, then re-run
  cp workflow import <OUT_PATH> --force
```

## Notes

- The export → edit → import round-trip is the recommended way to
  evolve a project workflow over time. Keep the export file checked in
  to the repo (or `.planning/workflows/` if you defaulted there) so
  teammates inherit the same customization.
- This skill does NOT touch `.planning/PROJECT.md`, `ROADMAP.md`, or
  `STATE.md` — template authoring only.
- Step 5 calls `cp workflow export --as` which uses a line-precise
  regex to rewrite the `workflow:` key (preserves formatting; no YAML
  reserialisation). If the user later edits the `workflow:` key by
  hand, that's fine — `import` reads the key verbatim.
- If validation keeps failing after edits, suggest the user diff the
  edited file against a fresh export to spot what changed:
  ```
  cp workflow export <BUILT_IN> --as <NEW_NAME> --out /tmp/orig.yaml
  diff /tmp/orig.yaml <OUT_PATH>
  ```
- After the template is registered, the next user action is almost
  always `/cp-workflow-run <NEW_NAME>`. Make that hint visible.
