---
phase: "29"
name: CI template + backfill
milestone: v0.8 Consistency
status: in-progress
created: 2026-05-22
base-commit: dcaeaaa377a3a0ca1d0e0fa10a08a5e7b017635f
expected-key-files:
  "29-01":
    - templates/ci/cp-audit.yml.example
    - bin/commands/install.js
    - bin/commands/_usage.js
    - test/dryrun-install-ci.js
    - package.json
  "29-02":
    - lib/reconcile.js
    - bin/commands/reconcile.js
    - bin/commands/_usage.js
    - test/unit-reconcile-all.js
    - test/dryrun-reconcile-all.js
    - package.json
---

# Phase 29 — CI template + reconcile --all backfill

**Design**: see [DESIGN.md](./DESIGN.md)

## Plans

- [x] 29-01: CI template + `cp install --ci` flag
- [ ] 29-02: `cp reconcile --all` / `--phase <range>` + backfill this repo

## Notes

Last dogfood step: run `cp reconcile --all --infer-shas` on this repo and
commit the backfill in a single `cp(reconcile): backfill legacy SHAs`
commit. Clears the 62 legacy MEDIUM findings predating phase 21.
