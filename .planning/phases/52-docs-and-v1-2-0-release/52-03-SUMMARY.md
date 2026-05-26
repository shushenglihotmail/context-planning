---
title: Bump to 1.2.0 + ship release artifacts
outcome: Bumped package.json + package-lock.json from 1.1.0 to 1.2.0; tagged v1.2.0 locally. Updated CHANGELOG.md, README.md, and MIGRATION-v1.2.md to teach the new optimizable fan-out flag (phase 52.5) — replacing earlier all-or-nothing prose with the {optimizable, items} contract + semantics table. Removed duplicate docs/MIGRATION-v1.2.md created during 52.5-04; canonical migration doc lives at repo root. Full npm test suite green. npm publish is user-driven (not run from agent).
key-decisions:
  - Folded the 52.5 doc work into the canonical root MIGRATION-v1.2.md rather than maintaining a parallel docs/MIGRATION-v1.2.md — single source of truth, easier for migrators.
  - "Updated CHANGELOG inline rather than appending a new [1.2.1] section: 1.2.0 has not shipped yet, so the optimizable refinement belongs in the 1.2.0 entry next to the rest of the fan-out work."
  - Tagged v1.2.0 locally only (no push). Leaving `git push origin main --tags` and `npm publish` to the user per project convention.
key-files:
  - path: package.json
    change: modified
    note: version 1.1.0 -> 1.2.0
  - path: package-lock.json
    change: modified
    note: refreshed via npm install --package-lock-only
  - path: CHANGELOG.md
    change: modified
    note: 1.2.0 fan-out bullet rewritten around optimizable flag
  - path: README.md
    change: modified
    note: "Fan-out section: optimizable + depends_on contract with semantics"
  - path: MIGRATION-v1.2.md
    change: modified
    note: Inter-child dependencies section rewritten with {optimizable, items} contract + truth table
phase: 52
plan: 52-03
completed: 2026-05-26
end-commit: ac297b745c0fb7e80ec986ca827015c11ede2100
---
# Summary 52-03

Plan 52-03 completed.
