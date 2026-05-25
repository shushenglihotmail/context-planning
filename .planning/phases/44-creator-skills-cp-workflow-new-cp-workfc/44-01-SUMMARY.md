---
subsystem: tooling
tags:
  - workflow
  - cli
  - export
  - round-trip
requires: []
provides:
  - cp-workflow-export
affects:
  - bin/commands/workflow.js
  - test/dryrun-workflow-cli.js
tech-stack:
  added: []
  patterns:
    - line-precise-regex-yaml-rewrite
    - validate-before-write
key-files:
  created: []
  modified:
    - bin/commands/workflow.js
    - test/dryrun-workflow-cli.js
key-decisions:
  - "Rewrite top-level workflow: key via per-line regex instead of YAML reserialisation. Reason: preserves formatting so export-edit-export cycles produce minimal diffs; reserialisation would change quoting/ordering."
  - "Strip the # template: header that cp workflow show emits (kept in show for back-compat). Without this, import round-trip would treat the comment as content drift."
  - Validate the rewritten YAML before writing — even with --force. Refuse to ship a broken file.
  - Default destination is ./<name>.yaml (or ./<as-name>.yaml). The DESIGN's open question (default into .planning/workflows/) was answered no — users may want to inspect before committing to the project tree; --out covers the explicit case.
patterns-established:
  - "New cp workflow subcommands follow the existing arg-parse pattern: positional args first, --flag args after, unknown options exit 2."
requirements-completed: []
duration: 30min
phase: 44
plan: 44-01
completed: 2026-05-25
end-commit: 731d1271d8ab7d89b3bc05d968da99b7c4ade3b0
---
## Accomplishments

Added `cp workflow export <name> [--out <path>] [--as <new-name>] [--force]`
to close the missing half of the workflow customization round-trip.
v1.0 had `cp workflow import` but no matching `export` — users could
only cobble together `cp workflow show <name> > file` which left a
`# template:` comment header and a baked-in `workflow:` key.

## Task Commits

- 622ee1b cp: start 44-01 execution
- 731d127 feat(44-01): add cp workflow export <name> [--out <path>] [--as <new-name>]

## Files Modified

- bin/commands/workflow.js — new workflowExport() function (~120 lines),
  switch-case entry, USAGE text update, jsdoc header update.
- test/dryrun-workflow-cli.js — new "Section 8.5: export" with 18
  assertions covering 9 CLI-level scenarios (usage error, basic export,
  header strip, default --out from --as, overwrite refusal exit 6,
  --force overwrite, empty --as rejection, unknown template exit 3,
  nested --out parent dir creation, --help mentions).

## Decisions Made

- **Regex-based rename, not YAML reserialisation.** Per-line match on
  `/^workflow:\s+\S/` rewrites only the first top-level occurrence;
  YAML library would reformat the whole file and break diff-friendliness.
- **Validate before write, always.** Even with `--force`, a broken
  export does not clobber a working file.
- **Default destination is ./<name>.yaml.** DESIGN.md left this as an
  open question; chose cwd-relative so users can inspect before
  committing to the project tree, with `--out` for explicit cases.
- **`cp workflow show` is untouched.** Back-compat critical:
  `cp workflow show dev > foo.yaml` still works exactly as before.

## Deviations

None.

## Issues

None.

## Next Phase Readiness

Plan 44-01 unblocks 44-03 (cp-workflow-customize skill needs the export
CLI to exist) and 44-04 (integration tests for the round-trip). 44-02
(cp-workflow-new) was always independent and can proceed in parallel.
Manual round-trip verified end-to-end: `export dev --as my-dev` →
`import my-dev.yaml` → `workflow ls` lists `my-dev` as a project template.