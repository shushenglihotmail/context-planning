---
phase_id: 118
title: docs-changelog-release
milestone: v1-10-skill-routing-verify-gate
status: in-progress
created: 2026-06-02
expected_files:
  - CHANGELOG.md
  - package.json
  - .planning/milestones/v1-10-skill-routing-verify-gate/DESIGN.md
base-commit: cb9d02ed345cedd4d9eace436cfe7dfb122f5877
---

# PLAN — Phase 118: docs + CHANGELOG + npm publish v1.10.0

## Goal

Close the v1.10 milestone: bump version, write CHANGELOG entry, document
the parens-sigil syntax in user-facing docs, correct the DESIGN.md
role-filter deviation (DESIGN said filter by SKILL.md `role:` frontmatter
which doesn't exist in SP — actual implementation is pure token-overlap
without role filter), publish v1.10.0 to npm, push commits.

## Tasks

1. **CHANGELOG.md** — new `## [1.10.0] - 2026-06-02 — Skill Routing & Verify Gate`
   section. Three bullets:
   - **Fuzzy sigil + per-skill availability probe** (phases 114, 115)
   - **`cp run-verify` subcommand** (phase 116)
   - **Milestone verify gate** (phase 117)
   With behavioral-change callouts where intentional.

2. **package.json**: bump `version` 1.9.0 → 1.10.0.

3. **DESIGN.md deviation note**: append a short "Implementation
   deviations" section to
   `.planning/milestones/v1-10-skill-routing-verify-gate/DESIGN.md`
   noting that the role-filter mechanism was dropped because SP
   `SKILL.md` files have only `name:` + `description:` frontmatter,
   no `role:` field. Pure token-overlap fuzzy match shipped instead.

4. **README / docs sweep** — light pass: add a one-line callout about
   the parens-sigil syntax to whichever existing docs file is most
   user-facing. (Skip if no obvious target; the CHANGELOG entry is the
   primary doc surface.)

5. **Publish**: `npm publish --access public` from repo root.

6. **Push**: push all local commits to origin.

## Verification

- `npm pack --dry-run` to confirm package contents.
- `node -e "require('./lib/verify').runVerify('x',{skip:true})"` smoke.
- `cp.cmd version` reports 1.10.0 after install.

## Out of scope

- Patch-version follow-ups.
- Downstream consumer migration guides (will react to feedback if any).

## Attestation

`invoked_skill: (inline-fallback)`.
