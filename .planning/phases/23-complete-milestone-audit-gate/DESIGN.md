---
phase: "23"
milestone: v0.8 Consistency
status: active
created: 2026-05-21
---

# Phase 23 Design — complete-milestone audit gate

**Milestone**: v0.8 Consistency (Tier 2 prevent — P7)
**Base-commit**: `b78a188`

## Context

Phase 24 shipped `cp audit`, which surfaces drift across `.planning/`
(ticked-without-summary, base/end-commit gaps, expected-key-files drift,
etc.). But `cp complete-milestone` today *only* checks
`verifyMilestoneComplete` — all roadmap phases ticked + SUMMARY files
exist. It happily ships milestones whose SUMMARYs are corrupt, whose
base/end commits never got pinned, or whose key-files diverged.

That defeats the v0.8 thesis: drift detection is worthless if the
close-out ceremony ignores it.

## Decision

`completeMilestone` runs `audit.runAudit(root)` after
`verifyMilestoneComplete` passes but before any mutation.

| Severity | Default | `--audit-warn` |
|---|---|---|
| HIGH | refuse | refuse |
| MEDIUM | refuse | warn |
| LOW | warn | warn |

Escape hatches:

- `--no-audit` skips the gate (mandatory stderr override notice — phase
  22 `--force` pattern).
- `--audit-warn` blocks only on HIGH.

Fail-closed: if `runAudit` throws, refuse with `audit-error`.

## Alternatives considered

1. **Block on HIGH only by default** — too lax; MEDIUM compounds.
   Rejected; offered as `--audit-warn`.
2. **`--strict` mode (block everything)** — LOW (state-stale) routinely
   fires harmlessly. Rejected.
3. **Opt-in `--audit` flag** — defeats prevention thesis. Rejected.

## Architecture

```
completeMilestone(root, opts)
├── existing: roadmap-missing / no-current-milestone / milestone-not-found
├── existing: verifyMilestoneComplete → reason 'incomplete'
├── NEW: audit.runAudit(root)            ← gate here
│   ├── on throw → reason 'audit-error'
│   ├── HIGH > 0 → reason 'audit-failed'
│   ├── MEDIUM > 0 unless auditWarn → reason 'audit-failed'
│   └── otherwise → continue (LOW = warn)
├── existing: aggregateSummaries / renderDigest
└── existing: write actions + commit
```

Skip path: `opts.noAudit === true` → emit override notice, skip gate.

## CLI surface

`bin/commands/complete-milestone.js` gains:

- `--no-audit` → `opts.noAudit = true`.
- `--audit-warn` → `opts.auditWarn = true`.

Refusal output mirrors phase 22's pretty-print: header, findings
indented under severity, suggest `cp audit` for details. Exit 2 on
`audit-failed` (distinct from generic 1).

## Tests

Unit (`test/unit-lifecycle.js`):
- happy path (no findings) ships.
- HIGH finding → refuse, no mutations.
- MEDIUM default → refuse.
- MEDIUM + auditWarn → ships.
- LOW only → ships.
- noAudit → ships even with HIGH.
- runAudit throw → reason 'audit-error'.

Dryrun (`test/dryrun-complete-milestone.js`): add cases for `--no-audit`
notice and `--audit-warn` exit 0 on MEDIUM-only.

## Out of scope

- Auto-running `cp audit --fix` (phase 25).
- Per-check whitelist (defer).
