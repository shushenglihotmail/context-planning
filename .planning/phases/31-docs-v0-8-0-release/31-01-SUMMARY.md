---
what-shipped: "Authoritative drift-defense walkthrough: docs/drift-playbook.md (9.6KB, 200+ lines) covering all 3 layers (prevent/detect/repair), the 9 audit checks tabulated by severity, manual repair verb family, 5-step migration recipe for pre-v0.8 projects, and a finding-id -> verb quick reference. README gets a 4-row 'Drift defense (v0.8)' section linking to the playbook."
key-decisions:
  - Single concentrated doc beats splitting prevent/detect/repair across 3 sub-docs — the 3-layer mental model is the whole point and needs to be skimmed in one pass
  - Loud destructive-action warning for 'cp reconcile --accept' embedded twice (in repair section + in migration recipe) because it inverts the usual 'docs follow code' intuition
  - README gets just an overview table + link rather than the full content — README is already long and the playbook is canonical
  - "expected-vs-actual drift: 2 unexpected (CHANGELOG.md, package.json)"
files-changed:
  - docs/drift-playbook.md
  - README.md
phase: 31
plan: 31-01
completed: 2026-05-21
key-files:
  created:
    - docs/drift-playbook.md
  modified:
    - CHANGELOG.md
    - README.md
    - package.json
end-commit: e317a570c9d38db20356d55abbc882a16b311d50
---
# Summary 31-01

Plan 31-01 completed.
