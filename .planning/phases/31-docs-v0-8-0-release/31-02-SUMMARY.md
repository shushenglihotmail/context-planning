---
what-shipped: "v0.8.0 release prep: CHANGELOG.md [Unreleased] block promoted to [0.8.0] - 2026-05-21 with full v0.8 scope reorganised by milestone narrative (Phase 30 agent literacy through Phase 17 SHA pinning), package.json bumped 0.7.1 -> 0.8.0, and npm publish --dry-run validated (100 files, 183 kB tarball, integrity check passed)."
key-decisions:
  - CHANGELOG entries reorganised in newest-phase-first order with the v0.8 narrative summary at top — easier to scan than chronological because v0.8's value prop lands in phase 24-30
  - Did NOT auto-run npm publish — requires user's 2FA OTP and account-bound credentials. Leave the actual publish + complete-milestone roll-up as the user's final manual step
  - Loud Docs subsection at end of changelog calls out the new drift-playbook.md so npm-page readers see it
files-changed:
  - CHANGELOG.md
  - package.json
phase: 31
plan: 31-02
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
# Summary 31-02

Plan 31-02 completed.
