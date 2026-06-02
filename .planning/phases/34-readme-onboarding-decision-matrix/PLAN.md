---
phase: "34"
name: README onboarding decision matrix
milestone: v0.9 Onboarding
status: in-progress
created: 2026-05-21
base-commit: d8c7705d50a1a21386075da84556f6639dfb8070
expected_files:
  - CHANGELOG.md
  - README.md
  - bin/commands/_usage.js
  - bin/commands/index.js
  - bin/commands/update.js
  - commands/cp/map-codebase.md
  - commands/cp/update.md
  - lib/update.js
  - package.json
  - test/unit-update.js
---

# Phase 34: README onboarding decision matrix

**Milestone**: v0.9 Onboarding
**Created**: 2026-05-21

## Goal

Add an explicit "Choose your starting path" decision matrix near the top
of the README that documents all four onboarding paths (greenfield,
existing-code-no-planning, existing-code-with-GSD, existing-cp-upgrade)
with the exact one-command invocation for each. Today only greenfield is
prominent; cases 2/3/4 require scrolling and guessing.

## Success Criteria

1. README has a "Choose your starting path" section visible above the
   `## Install` section.
2. Each of the 4 cases has its own row with a one-line command users can
   copy-paste.
3. Each row links to the relevant skill or section so users can drill in.
4. Existing README content is preserved; this is purely additive.

## Plans

- [x] 34-01: README — add decision matrix section + cross-links

## Notes

- Keep it tight: a 4-row table with case / command / outcome columns.
  Long prose belongs in the slash-skill docs.
- The matrix must reference `/cp-map-codebase` (case 2, post-phase-32),
  `cp init && cp gsd-import` (case 3), and `cp update` / npx one-liner
  (case 4, post-phase-33) as one-liners.
