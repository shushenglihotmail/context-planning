---
subsystem: audit-repair
key-files:
  created:
    - test/unit-reconcile-all.js
    - test/dryrun-reconcile-all.js
    - templates/ci/cp-audit.yml.example
    - test/dryrun-install-ci.js
  modified:
    - lib/reconcile.js
    - bin/commands/reconcile.js
    - bin/commands/_usage.js
    - package.json
    - bin/commands/install.js
key-decisions:
  - Bulk mode (--all / --phase) is a sibling code path inside bin/commands/reconcile.js rather than a separate verb. Keeps the cognitive surface small and lets all existing flags (--infer-shas / --accept / --dry-run / --json / --no-commit) compose with bulk mode for free.
  - "_parsePhaseRange accepts 5 shapes: N, N-M, N..M (escape-friendly), N,P,Q comma list, and any combo (5,7-9). Dot-dot form added because many shells interpret a bare hyphen as a flag."
  - Backfill on this repo collapsed 70 → 16 findings in one bulk commit (54 ops). For phases 1-16 the SHAs are all 9d57b67 because .planning/ was checked in en-masse there; that's accurate file-history, not a bug.
discoveries:
  - _listAllPhaseNums uses /^(\d+)-/ so a fractional dir like 1.5-map-codebase resolves to phase 1 and is silently shadowed in bulk mode. Worked around by running cp reconcile 1.5 separately for that one phase.
phase: 29
plan: 29-02
completed: 2026-05-21
end-commit: fa28b039be1b530d70bd8f89afbf3199f46d332b
---
# Summary 29-02

Plan 29-02 completed.
