---
name: cp-write-summary
description: Write a phase SUMMARY from JSON frontmatter and optional markdown body.
argument-hint: "<plan-id> --from <json> [--body <md>] [--overwrite] [--dry-run]"
requires: []
---

# /cp-write-summary

## Required keys (v0.7 hard-block)

- `key-decisions`: **REQUIRED**. Array with ≥1 entry. Each entry is one
  sentence describing a non-trivial decision made during the plan
  (architecture, library choice, trade-off, deferred work, etc.).
  Trivial / mechanical steps do not count.

The cp CLI exits with code 2 and prints the following exact message if
this constraint is violated:

  Error: 'key-decisions' is required and must have ≥1 entry. See spec at
  docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md

If a plan genuinely had no decisions worth recording (e.g. a typo fix),
note that explicitly: `key-decisions: ['mechanical edits only — no design decisions']`.

Use `cp write-summary` to write `{plan-id}-SUMMARY.md` into the phase directory.
Pass frontmatter JSON with `--from`; optionally supply markdown body content with
`--body`. Use `--dry-run` to preview the normalised frontmatter and `--overwrite`
to replace an existing summary.

```bash
cp write-summary 16-03 --from summary.json --body summary-body.md
```
