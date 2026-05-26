---
phase-id: "51"
title: Smart-gate + scope/argv parity tests
outcome: Extended test/unit-autonomous.js from 24 to 43 assertions. Covers smart-gate ordering (test gate fires per phase, fails with test-failure stopReason, .continue-here.md written), runTests/runAuditGate direct unit calls, cp autonomous CLI argv (--check, --workflow, scope, invalid-scope exit, --help), cp-quick skill+template contract (DESIGN.md+STATE.md shape, no PLAN.md), and quick-tier lib/custom.js back-compat (createRun targets quick/, legacy custom/ slug still readable).
key-decisions:
  - Smart-gate trip tests use process.platform-aware testCommand strings (cmd /c exit N on Windows, true/false on POSIX) so tests run cross-platform.
  - CLI argv tests shell out via execSync against bin/cp.js and accept both exit 0 (clean) and exit 1 (phases pending) for --check, since bin/commands/autonomous.js intentionally exits 1 when phasesWouldRun > 0.
  - Quick-tier parity is exercised via lib/custom.js (createRun + readState) rather than a bin/quick.js CLI, since cp-quick is a pure skill with no JS entry point.
  - Did not attempt to mock lib/audit at runtime — runAuditGate test asserts ok=true on a synthetic fixture with no audit-trippable findings; HIGH-finding path remains covered by integration tests, not unit.
key-files:
  - path: test/unit-autonomous.js
    change: modified
    note: "+19 new assertions: 7 smart-gate, 5 CLI argv, 5 quick contract, 2 quick parity"
phase: 51
plan: 51-05
completed: 2026-05-26
end-commit: 3e826fe80323466e0ff12224a30f79e113e383fb
---
# Summary 51-05

Plan 51-05 completed.
