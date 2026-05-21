---
subsystem: hooks
key-files:
  created:
    - test/dryrun-install-hooks.js
  modified:
    - bin/commands/install.js
    - bin/commands/_usage.js
    - package.json
key-decisions:
  - Hook flags (--hooks / --uninstall-hooks) short-circuit before the harness arg check, so users do not need a harness positional. Mirrors install --uninstall semantics other tools use.
  - Exit code 3 when a user-owned hook is refused (without --force) — matches the existing harness-install exit-3 contract for partial installs.
discoveries: []
phase: 27
plan: 27-02
completed: 2026-05-21
end-commit: 29aeb5496ad16c1e8a14d4b07fc9f63b7b618193
---
# Summary 27-02

Plan 27-02 completed.
