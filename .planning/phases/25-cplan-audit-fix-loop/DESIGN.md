---
phase: "25"
milestone: v0.8 Consistency
status: active
created: 2026-05-21
---

# Phase 25 Design — cplan audit --fix loop

**Milestone**: v0.8 Consistency (Tier 3 repair — P8)
**Base-commit**: `acd0dad`

## Context

Phase 24 detects drift; phase 23 blocks ship on it. Today the user
fixes findings by reading the message + manually running the suggested
command. For repeat-offender findings (state-stale, summary-without-tick)
this is mechanical busy-work. `cp audit --fix` automates the
auto-fixable subset with atomic commits per fix, GSD-shape classify
(auto/manual/skip) + present + 6-step loop.

## Decision

Add a `--fix` flag to `cp audit`. New module `lib/audit-fix.js` owns:

1. **classify(findings)** — split into `{ auto, manual, skip }`.
   - `auto`: state-stale (calls `state.regenerate`),
     summary-without-tick (calls `lifecycle.tickPlan`).
   - `manual`: every other check id (returns a suggestion).
   - `skip`: anything with `severity === 'LOW'` when
     `--severity high|medium` is set.
2. **applyFixes({ auto, opts })** — iterate up to `--max N` (default 5),
   call the registered fixer for each, atomic-commit per fix with
   subject `cp(audit-fix): {finding.id} {finding.location}`. Stop loop
   on any fixer throw. Returns `{ applied: [], skipped: [], failed: [] }`.
3. **report({ applied, manual, failed })** — pretty-print summary.

Default behaviour:

- `cp audit --fix` → classify + present + apply auto + report.
- `--max N` → cap fixes per run (default 5, matches GSD).
- `--severity high|medium|all` → filter findings before classify
  (default `all`).
- `--dry-run` → show what would be fixed, no commits, no mutations.
- `--interactive` → prompt y/N per fix (post-MVP; v0.8 ships
  non-interactive only; flag accepted but warns "not yet implemented"
  and proceeds non-interactively).

Exit codes:

- 0 if all auto applied OR nothing to fix.
- 1 if any failed.
- 2 if applied succeeded but manual findings remain (alerts user).

## Fixer registry

| Finding id | Fixer | Severity it targets |
|---|---|---|
| `state-stale` | `state.regenerate(root)` | LOW |
| `summary-without-tick` | `lifecycle.tickPlan(root, planId, { noCommit: true })` | MEDIUM |
| _all others_ | none (classified manual) | — |

Phase 26 will extend the registry when reconcile/supersede/deviate
land. The registry is exported and pluggable so phase 26 just adds
entries.

## Alternatives considered

1. **Run tests between each fix (GSD-style)** — out of scope for v0.8
   MVP; requires `--verify <cmd>` flag and test orchestration. Defer.
2. **Interactive by default** — non-interactive default is friendlier
   for CI usage. Interactive is opt-in.
3. **Single mega-commit for all fixes** — defeats atomicity; loses
   bisect granularity. Rejected.

## CLI surface

`cp audit --fix [--max N] [--severity LEVEL] [--dry-run] [--interactive]`

The existing `cp audit` flags (`--json`, `--strict`, `--milestone`,
`--phase`, `--quiet`) all still work and apply to the findings pool
**before** classification.

## Tests

- Unit (`test/unit-audit-fix.js`): classify partitioning, applyFixes
  happy paths, --max cap, fixer-throw handling, dry-run no-mutations.
- Integration (`test/dryrun-audit-fix.js`): real fixture, state-stale
  and summary-without-tick scenarios, atomic-commit subject verification.

## Out of scope

- `--verify <cmd>` (test harness invocation between fixes).
- `--interactive` actual prompting (accepts flag, warns).
- Repair-command fixers (reconcile, supersede, deviate) — phase 26.
- `--continue` for resumable loops.
