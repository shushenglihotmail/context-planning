---
phase: "24"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [user, copilot]
supersedes: []
superseded_by: null
---

# Design: Phase 24 — `cplan audit` detection

## Status

Accepted on 2026-05-21.

## Context

This is the Tier 3 **detect** layer of the three-tier drift defense. Even
with prevent (Tier 1, 2) in place, drift will occur in the wild:

- Forks of cp projects where someone disabled hooks
- Pre-v0.8 cp projects that never had P1–P6
- Hand-edited PLAN/SUMMARY files
- Git history rewrites that invalidate base-commit SHAs
- External tooling that creates SUMMARY without ticking

The audit command is a **read-only sweep** that surfaces every drift it
can find, with severity, location, and a one-line recommended fix.
Output supports both human reading (default) and JSON (for CI / scripts).

This phase ships **detection only**. The `--fix` orchestrator is phase 25.

## Decision

`cplan audit [--json] [--strict] [--milestone <name>] [--phase <N>]`

- Walks `.planning/phases/*/` and `ROADMAP.md`.
- Runs each registered "check function" and collects findings.
- Each finding: `{ id, severity: 'HIGH'|'MEDIUM'|'LOW', location, message, fix }`.
- Exit code:
  - 0 = no findings
  - 1 = LOW/MEDIUM findings only
  - 2 = at least one HIGH finding (or `--strict` is set and any finding)
- `--milestone X` / `--phase N`: scope the sweep.
- `--json`: emit machine-readable output.

**Check registry (v0.8 ship set):**

| ID | Severity | Description |
|---|---|---|
| `ticked-without-summary` | HIGH | Plan is `- [x]` in ROADMAP/PLAN but no `{NN-MM}-SUMMARY.md` |
| `summary-without-tick` | MEDIUM | SUMMARY.md exists but plan still `- [ ]` |
| `missing-base-commit` | MEDIUM | PLAN.md has no `base-commit:` field (post-v0.8 phases) |
| `invalid-base-commit` | HIGH | `base-commit:` SHA does not exist in git |
| `missing-end-commit` | MEDIUM | SUMMARY.md has no `end-commit:` field (post-v0.8 phases) |
| `expected-vs-actual-drift` | LOW | SUMMARY key-files differs from PLAN expected-key-files |
| `state-stale` | LOW | STATE.md derived block differs from `state.regenerate` output |
| `phase-no-roadmap` | MEDIUM | Phase dir exists but no `### Phase N:` heading in ROADMAP |
| `roadmap-no-plan-md` | LOW | ROADMAP lists phase but PLAN.md missing |

**Severity policy:**
- HIGH = data inconsistency that breaks tooling (broken SHA, missing
  documentation for completed work)
- MEDIUM = silent drift that will compound (missing forward-pinning
  fields on post-v0.8 phases)
- LOW = informational (key-files mismatch is often legitimate)

**Architecture:**
```
bin/commands/audit.js
  -> lib/audit.js::runAudit(root, opts)
     -> for each check fn:
          findings.push(...checkFn(root, ctx))
     -> sort by severity then location
     -> return { findings, summary }
  -> formatter (human / JSON)
  -> exit code based on max severity + --strict
```

## Consequences

### Positive
- Single command surfaces ALL drift signals; supersedes ad-hoc grep.
- JSON output enables CI integration (phase 29) and `--fix`
  orchestrator (phase 25).
- Check registry is extensible: future drift types add one function.

### Negative
- Slow on large projects (scans every phase + reads many files).
  Acceptable for v0.8 — optimize if needed.
- Some checks (state-stale) cost a full state regen — guard with
  `--quick` flag deferred to v0.9.

### Neutral
- Read-only. Never mutates anything. `--fix` is a separate phase.

---

## Components

### `lib/audit.js`

- `runAudit(root, opts = {})` — main entry point.
  - opts: `{ milestone, phase, checks }` (checks = override registry).
  - Returns `{ findings: [...], summary: { high, medium, low, total } }`.
- `CHECKS` — array of `{ id, fn(root, ctx) -> [findings] }`.
- Each check fn is pure-ish (may read files; never writes).

### `bin/commands/audit.js`

- Parse args, call `runAudit`, render output, exit.
- Human format: severity-grouped, color-coded (TTY only), with fix hints.
- JSON format: `{ findings, summary, exit_code }`.

### Helpers
- Reuse `lifecycle._priorPhaseAudit` (phase 22) for the
  ticked-without-summary check — extract a shared
  `_collectTickedPlans(phaseDir)` if needed.
- Reuse `state.deriveState` for state-stale check.
- Reuse `milestone._extractExpectedKeyFiles` for the expected-vs-actual
  cross-check (LOW severity to avoid noise).

## Data Flow

```
1. cplan audit
2. audit.js: build context (root, planning dir, phases list, ROADMAP)
3. for each check fn: run, collect findings
4. sort findings: severity DESC (HIGH first), then phase ASC, then plan ASC
5. compute summary counts
6. choose exit code: max severity → exit (0/1/2)
7. format + print
```

## Error Handling

- Per-check errors caught; logged as a finding `{ id: 'check-error',
  severity: 'LOW', location: check.id, message: e.message }`. Never
  crash the whole audit.
- Missing `.planning/`: exit 0 with "no cp project" notice.
- Invalid `--milestone` / `--phase` filter: exit 2 with usage error.

## Testing Strategy

Unit tests in `test/unit-audit.js`:
- Each check fn in isolation (happy path + drift path).
- `runAudit` integration: assemble a project with multiple known
  drifts, verify findings match expected list (id + severity + location).

Dryrun in `test/dryrun-audit.js`:
- Default invocation in clean project → exit 0, no findings.
- Same project with planted drift → exit 1 or 2, findings rendered.
- `--json` → valid JSON, `findings` array matches.
- `--strict` → LOW finding triggers exit 2.
- `--phase 1` filter scopes the sweep.

## Alternatives Considered

### Option A — Block at write-time only, never detect retroactively

**Pros:** No new command; less surface area.

**Cons:** Doesn't help legacy projects or post-hoc edits. Tier 3 is
explicitly about detection of drift that escaped prevention.

**Verdict:** rejected.

### Option B — Use Joi/Yup for declarative checks

**Pros:** Standard schema validation.

**Cons:** Overkill for cross-file consistency checks; introduces a
dep. Inline check fns are clearer.

**Verdict:** rejected.

## Open Questions

- [ ] Should `state-stale` finding auto-trigger a `cp state regen` on
  detect-only mode, or always require `audit --fix`? Currently:
  detect-only is read-only; let `--fix` handle it.

## References

- Milestone DESIGN row 24
- Phase 22 `_priorPhaseAudit` (will be reused/refactored)
- GSD `audit-fix` workflow (`~/.copilot/get-shit-done/workflows/audit-fix.md`)
