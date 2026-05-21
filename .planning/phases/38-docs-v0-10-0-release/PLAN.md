---
phase: "38"
name: Docs + v0.10.0 release
milestone: v0.10 Autonomy
status: in-progress
created: 2026-05-21
base-commit: dc978e53c924bc8ee7ce13f694d7d3ad4c5bce77
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 38: Docs + v0.10.0 release

**Milestone**: v0.10 Autonomy
**Created**: 2026-05-21

## Goal

Document `cp autonomous` / `/cp-autonomous` in README + CHANGELOG,
bump package.json to 0.10.0, and run lifecycle wrap-up for the v0.10
milestone (complete-milestone, commit, push).

## Success Criteria

1. README has a `/cp-autonomous` entry in the skill list with
   one-liner usage example.
2. README decision matrix (or "When to use what" section) mentions
   the autonomous driver as an alternative to per-phase
   `/cp-execute-phase`.
3. CHANGELOG.md has a `[0.10.0]` section listing the new CLI verb,
   the new slash skill, the smart gates, and the
   `.continue-here.md` stop contract.
4. package.json version = `0.10.0`.
5. `npm test` green.
6. `cp complete-milestone "v0.10 Autonomy"` succeeds (audit gate
   passes, milestone marked validated).
7. Git tag `v0.10.0` pushed; GitHub release cut.
8. `npm publish` run by user (out-of-band, requires OTP).

## Plans

- [ ] 38-01: README + CHANGELOG + version bump + milestone close.

## Notes

- The `npm publish` step is user-driven (interactive OTP) — do not
  attempt to publish from the skill. After the rest is committed,
  prompt the user to publish + report the release.
- Mirror v0.9.0 release notes shape: short Added bullet list, link
  to design spec, link to milestone DESIGN.md.
- README skill list location: search for "/cp-update" in README to
  find the table — add the row directly below.

