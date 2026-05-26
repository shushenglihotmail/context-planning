---
phase: "52"
name: Docs + MIGRATION-v1.2.md + v1.2.0 release
milestone: v1.2 Unified Phase Model
status: pending
plan-status:
  52-01: pending
  52-02: pending
  52-03: pending
created: 2026-05-26
base-commit: 3cc9262
---

# Phase 52: Docs + MIGRATION-v1.2.md + v1.2.0 release

**Milestone**: v1.2 Unified Phase Model
**Created**: 2026-05-26

## Goal

Document the v1.2 model end-to-end, write the migration guide, refresh
README/CHANGELOG, bump to 1.2.0, tag, and push commits ready for npm publish.

## Success Criteria

1. `MIGRATION-v1.2.md` covers persist rename, custom->quick collapse, cp-plan-phase removal, parent/after/max_children schema, fold-into-DESIGN behavior.
2. README.md + CHANGELOG.md reflect v1.2 schema, storage diagram, CLI table.
3. `package.json` is at `1.2.0`; commit + tag `v1.2.0` pushed.

## Plans

- [ ] 52-01: MIGRATION-v1.2.md - persist rename, custom->quick collapse, cp-plan-phase removal, parent:/after:/max_children: schema, fold-into-DESIGN behavior.
- [ ] 52-02: CHANGELOG.md + README.md updates (workflow YAML examples with new schema; new tier-file storage diagram; updated CLI table).
- [ ] 52-03: Bump package.json to 1.2.0; commit; tag v1.2.0 (publish to npm is user-driven).

## Notes
