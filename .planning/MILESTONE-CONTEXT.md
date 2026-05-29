# Milestone context (live)

**Active milestone:** Template parameterization whitelist
**Slug:** `template-parameterization-whitelist`
**Started:** 2026-05-29
**DESIGN.md:** `.planning/milestones/template-parameterization-whitelist/DESIGN.md`

## One-line goal

Restrict workflow + phase template parameterization to a small whitelist of
content-bearing fields; hard-ban `{{item.X}}` tokens and any unresolved
`{{...}}` after expansion; audit & migrate all built-in templates in this
milestone.

## Locked scope

- **Allow tokens in:** `skill`, `prompt`, `description`, `max_children`,
  `min_children`.
- **Forbid tokens in:** `id`, `parent`, `after`, `depends_on`, `optimizable`,
  `runner`, `outputs`, `title`, `require`, `invoke`, `config_fallback`,
  `completion`.
- **Hard ban anywhere:** `{{item.X}}`; any leftover `{{...}}` after expansion.
- **Scope:** both `templates/workflows/*.yaml` and `templates/phases/**`.
- **Migration:** hard break, no soft-warn period, no migrator CLI. Built-ins
  audited & migrated in-milestone.

## Out of scope

- Per-item parameterization mechanism (supervisor runtime injection handles).
- `cp workflow migrate` CLI.
- Loosening the whitelist for new fields.

See DESIGN.md for full rationale.
