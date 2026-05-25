---
phase: "42"
milestone: v1.0 Workflow Engine
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [orchestrator]
supersedes: []
superseded_by: null
---

# Design: Phase 42 — Docs + v1.0.0 release

## Status

Accepted on 2026-05-25.

## Context

Phases 40 + 41 shipped the v1.0 Workflow Engine: lib/{workflow,custom,runtime}.js, the `cp run` + `cp workflow` CLI families, three built-in templates, AI-authoring via `cp workflow brainstorm`, and a 104-assertion CLI test suite. The codebase is functionally ready for v1.0.0. What remains is documentation + release mechanics.

The v1.0.0 bump is MAJOR but not breaking — all pre-v1.0 commands continue to work unchanged. v1.0.0 marks the workflow engine as the headline addition that stabilises cp's public surface (the new `cp run` + `cp workflow` namespaces, the YAML template format, the three lib modules).

## Decision

Ship Phase 42 as a single-plan release phase (same shape as Phase 38 v0.10.0): one atomic plan that updates README + adds MIGRATION-v1.0.md + appends CHANGELOG entry + bumps `package.json` version + closes the milestone. `npm publish` is user-driven (interactive OTP).

## Consequences

### Positive
- Single plan keeps the release atomic and reviewable.
- Mirrors prior release-phase pattern (Phase 15, 31, 38) — predictable for cp users following git history.

### Negative
- Bundles README + CHANGELOG + MIGRATION + version into one commit set — slightly larger diff than splitting, but tightly coupled so this is acceptable.

### Neutral
- MIGRATION-v1.0.md is a NEW doc convention (prior releases used CHANGELOG only). Established here because v1.0.0 introduces a public template format (YAML) and CLI surface (`cp run`, `cp workflow`) worth a dedicated "what's new" document.

---

## Architecture

```
README.md                    +Workflow Engine section
  └─ Tables for cp run, cp workflow sub-commands
  └─ Pointer to MIGRATION-v1.0.md

MIGRATION-v1.0.md            +NEW
  ├─ What's new in v1.0
  ├─ Three state tiers (milestone / phase / custom)
  ├─ Template authoring guide (principles, defaults, phases)
  └─ FAQ: pre-1.0 projects (no migration required)

CHANGELOG.md                 +[1.0.0] section

package.json                 version: 0.10.3 → 1.0.0
```

## Components

- **README updates** — add `Workflow Engine` H2 section between existing sections (likely after the skill table). Two sub-tables: `cp run` family, `cp workflow` family. Link to MIGRATION-v1.0.md.
- **MIGRATION-v1.0.md** — new top-level file. Sections: What's New / Three State Tiers / Template Format Reference / Built-in Templates / FAQ. Reference `.planning/milestones/v1-0-workflow-engine/DESIGN.md` for architecture rationale.
- **CHANGELOG [1.0.0]** — bullet list under sub-headings Added / Changed / Deprecated (empty) / Removed (empty) / Fixed (empty). Date the release.
- **package.json** — single field bump: `"version": "1.0.0"`.
- **Milestone close** — `node bin\cp.js complete-milestone "v1.0 Workflow Engine"` after commits land.

## Data Flow

1. README edits land.
2. MIGRATION-v1.0.md drafted; cross-checks DESIGN.md.
3. CHANGELOG updated.
4. package.json bumped.
5. `npm test` green (35 test files after Phase 41).
6. Single commit OR 2 commits (docs + version bump). Recommend 2: `docs(v1.0): README + MIGRATION + CHANGELOG`, then `release: v1.0.0`.
7. `cp complete-milestone` — audit passes (all summaries written), milestone marked validated, ROADMAP collapsed.
8. STOP — instruct user to: `git tag v1.0.0 && git push --tags && npm publish` (user owns OTP).

## Error Handling

- If `cp complete-milestone` audit fails on missing summary or drift: STOP, surface the audit output, fix gaps before retrying.
- If `npm test` fails: STOP, fix breakage before bumping version.

## Testing Strategy

- No new tests in this phase. Existing `npm test` (34 files) must remain green.
- Manual smoke before milestone close: `node bin\cp.js run quick "release-smoke"`, walk through 3 phases via mark-complete, confirm done. Tests cover this but a live walkthrough catches docs/CLI mismatches.

## Alternatives Considered

### Option A — Split into 3 plans (docs / release / milestone-close)
**Pros:** smaller commits.
**Cons:** introduces overhead for ~1 hour of mechanical work. Each commit would need its own SUMMARY ceremony. Rejected.

### Option B — Skip MIGRATION-v1.0.md (CHANGELOG only)
**Pros:** less documentation surface to maintain.
**Cons:** v1.0.0 introduces a YAML template format that users will need a reference for; CHANGELOG bullets are too compact. Rejected — MIGRATION doc adds real value at v1.0.

## Open Questions

- [ ] Should MIGRATION-v1.0.md live at repo root or `docs/MIGRATION-v1.0.md`? **Lean:** repo root (matches CHANGELOG, README convention; users find it on the GitHub front page).
- [ ] Should we publish a GitHub Release with notes auto-generated from CHANGELOG? **Lean:** yes — `gh release create v1.0.0 --notes-file <extracted CHANGELOG section>`. Document in plan notes; user runs after `npm publish`.

## References

- `.planning/milestones/v1-0-workflow-engine/DESIGN.md` — milestone-tier ADR (locked architecture)
- `.planning/phases/40-core-engine-custom-tier/{40-01,40-02,40-03}-SUMMARY.md` — lib module surface
- `.planning/phases/41-cli-surface-built-in-templates-ai-author/{41-01,41-02,41-03}-SUMMARY.md` — CLI surface
- `.planning/phases/38-docs-v0-10-0-release/PLAN.md` — release-phase template
- `templates/workflows/{dev,debug,quick}.yaml` — built-in templates to reference in docs

