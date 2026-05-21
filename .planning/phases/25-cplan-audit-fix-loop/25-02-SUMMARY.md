---
outcome: "Wired --fix into bin/commands/audit.js. Flags: --max N (default 5, validated positive int), --severity high|medium|all, --dry-run, --interactive (warns + falls back). Pretty-prints Applied/Failed/Manual sections; --json emits {findings, summary, classify, fix, summary_fix}. Exit codes 0/1/2 distinct from detect mode. 20 dryrun assertions green."
key-decisions:
  - --interactive accepted but deferred to avoid TTY complexity in v0.8 MVP
  - Exit 2 when manual findings remain alerts user without --strict
  - --fix shares detect-mode filters (--milestone, --phase) for free
  - Validation of --max in CLI not lib keeps registry pure
phase: 25
plan: 25-02
completed: 2026-05-21
key-files:
  created:
    - lib/audit-fix.js
    - test/dryrun-audit-fix.js
    - test/unit-audit-fix.js
  modified:
    - bin/commands/_usage.js
    - bin/commands/audit.js
    - package.json
end-commit: 51d2e387162b5f533e5a7c6a27a753c5cb671252
---
# Summary 25-02

Plan 25-02 completed.
