---
phase: "42"
name: Docs + v1.0.0 release
milestone: v1.0 Workflow Engine
status: ready
plan-status:
  42-01: pending
created: 2026-05-25
base-commit: 918b96da3b9bf6f6a01a6f6f1bf45fb52f8c1e30
expected-key-files:
  42-01:
    - README.md
    - MIGRATION-v1.0.md
    - CHANGELOG.md
    - package.json
---

# Phase 42: Docs + v1.0.0 release

**Milestone**: v1.0 Workflow Engine
**Created**: 2026-05-25

## Goal

Document the v1.0 Workflow Engine (new `cp run` + `cp workflow` CLI families, 3 built-in templates, custom-tier state, principles), publish MIGRATION-v1.0.md, bump `package.json` to `1.0.0`, and close the milestone.

## Success Criteria

1. README has a `## Workflow Engine` section with two compact tables (cp run family, cp workflow family) and a link to MIGRATION-v1.0.md.
2. `MIGRATION-v1.0.md` exists at repo root covering: What's New, Three State Tiers, Template Format Reference, Built-in Templates, FAQ. Pre-1.0 projects need no migration (this is documented explicitly in the FAQ).
3. CHANGELOG.md has a `[1.0.0]` section with Added bullets covering: workflow engine (lib/workflow, lib/runtime, lib/custom), `cp run` CLI family, `cp workflow` CLI family, three built-in templates (dev / debug / quick), AI authoring via `cp workflow brainstorm`, top-level `principles:` mechanism. Date the release.
4. `package.json` version = `1.0.0`.
5. `npm test` green (34 test files; 0 failures).
6. `node bin\cp.js complete-milestone "v1.0 Workflow Engine"` succeeds (audit gate passes, milestone marked validated and collapsed in ROADMAP).
7. Final commit prompts user to: `git tag v1.0.0 && git push --tags`, then `npm publish` (interactive OTP — user owns this step), then `gh release create v1.0.0 --notes-file <extracted CHANGELOG section>` (optional, user-driven).

## Plans

- [x] 42-01: README + MIGRATION-v1.0.md + CHANGELOG + version bump + milestone close.

## Notes

- This is a release phase; no new code or tests. Mechanical doc + version work.
- Recommend 2 commits inside the plan: `docs(v1.0): README + MIGRATION-v1.0.md + CHANGELOG` followed by `release: v1.0.0`. A single combined commit is also acceptable.
- `npm publish` is user-driven (OTP). After CI work completes the plan, stop and surface the publish-checklist for the user to execute.
- README skill table location: search for `/cp-update` in README; insert the new `## Workflow Engine` section before or after the skill section as appropriate.
- MIGRATION-v1.0.md should link to `.planning/milestones/v1-0-workflow-engine/DESIGN.md` for deeper architecture rationale.
- The `cp workflow brainstorm` flow itself is a way to author new workflows — call this out in MIGRATION as the "AI authoring" feature promised by the milestone.

