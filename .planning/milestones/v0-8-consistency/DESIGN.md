---
# Tier marker: cp scaffold substitutes one of:
#   phase: ""     (for phase-tier DESIGN.md)
#   milestone_slug: "v0-8-consistency"  (for milestone-tier DESIGN.md)
milestone_slug: "v0-8-consistency"
milestone: v0.8 Consistency
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [sli]
supersedes: []
superseded_by: null
---

# Design: v0.8 Consistency

## Status

Accepted on 2026-05-21. Brainstorm transcript: `.planning/MILESTONE-CONTEXT.md`
(auto-promoted into this doc as an appendix at `cp complete-milestone`).

## Context

By v0.7 cp has shipped the full design-capture loop (DESIGN.md, REVIEW-LOG.md,
key-decisions hard-block, milestone DESIGN.md aggregation). But there is **no
guarantee** that what `.planning/` claims happened in the codebase actually
happened. Six concrete drift causes were identified in brainstorming:

| # | Drift type | Example |
|---|---|---|
| 1 | Forgetful executor | Plan says `lib/foo.js` created; SUMMARY's `key-files` list omits it |
| 2 | Stale STATE | `STATE.md` says "Phase 11" but ROADMAP shows Phase 16 done |
| 3 | Manual file ops outside cp | User edits `.planning/PROJECT.md` directly; no commit, no tick |
| 4 | Plan–execute mismatch | PLAN says "implement X in foo.js"; SUMMARY says "implemented X in bar.js" with no `key-decisions` deviation note |
| 5 | Cross-phase contamination | Phase 11 SUMMARY claims a file that was actually created in Phase 12 |
| 6 | Skipped commands | User runs `cp scaffold-phase 13` without `cp write-summary 12` |
| 7 | Milestone-close lies | `cp complete-milestone` accepts a `<details>` collapse even though Phase 14's `key-files` reference deleted paths |
| 8 | Agent unscoped changes | AI agent edits 5 files in a cp project without wrapping the work in a cp scaffold-phase/write-summary cycle |
| 9 | Post-commit forgetfulness | User commits with `git commit` directly; SUMMARY never updated |

Pre-v0.8 cp has four partial defenses: atomic commits (v0.3.3), `key-decisions`
hard-block (v0.7), `cp map-codebase` (v0.3.x for brownfield), `cp doctor`
(v0.5). They cover write-time validation only — nothing checks alignment
between what state files claim and what's actually on disk.

## Decision

Ship a **three-layer consistency stack** in a single milestone:

1. **Prevent** drift at four enforcement points (write-time, plan-time,
   commit-time, agent-level) via 7 mechanisms (P1–P7, P11, P12).
2. **Detect** drift deterministically via `cplan audit` (P8).
3. **Repair** drift via `cplan audit --fix` (GSD-mimic loop, P9) +
   four outcome commands (P10).

The architectural lynchpin is **SHA pinning** (P1): `base-commit` and
`end-commit` git-SHA fields on PLAN.md / SUMMARY.md frontmatter, auto-stamped
by `cplan scaffold-phase` and `cplan write-summary`. This converts "what
changed in phase N?" from a fuzzy heuristic into a deterministic
`git diff base-commit..end-commit` query — every detection and repair
mechanism downstream relies on it.

Backward compatibility is **forward-only by default**: phases scaffolded after
v0.8 get the new frontmatter; older phases are tagged `confidence: low` in
audit output and can be backfilled via opt-in
`cplan reconcile --infer-shas [--milestone <id>|--phase <N>|--all]` with two
modes (best-effort timestamps, or accurate via `cp(NN-MM):` commit-message
parsing).

## Consequences

### Positive
- Codebase and `.planning/` are kept in sync by default; drift is detectable
  in one read-only command and repairable by single command.
- The `cplan audit` JSON output is composable into CI, IDE extensions, or
  third-party dashboards without re-parsing markdown.
- Agent literacy injection (P11) prevents drift *at the source* by teaching
  every harness (Copilot/Claude/Cursor/Aider) when to wrap user requests
  in cp commands — friendlier than refusal-based gating.
- Hooks are opt-in (`cp install --hooks`); zero surprise for v0.7 users.
- Single-cp-project repos pay zero overhead; monorepos with multiple cp
  sub-projects are handled correctly via a smart shim at git root.

### Negative
- 15 phases ≈ ~2200 LOC across one milestone. Largest cp milestone to date.
- SHA pinning frontmatter is a breaking-shape change. Mitigated by
  forward-only default; pre-v0.8 phases remain auditable in a degraded mode.
- Git-hook installation adds a `.git/hooks/pre-commit` + `post-commit`
  shim that some users may not want; opt-in `--hooks` flag addresses this.

### Neutral
- `cplan audit --fix` mimics GSD's `gsd-audit-fix` workflow shape verbatim
  (parse-args → run-audit → classify → present → fix-loop → report). Keeps
  cp's audit UX familiar to GSD users who switch over.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                   PREVENT (write-time)                             │
│                                                                    │
│  scaffold-phase ──► stamps base-commit         (P1)                │
│  write-summary  ──► stamps end-commit          (P1)                │
│  write-summary  ──► auto-fills key-files       (P2, default on)    │
│  write-summary  ──► refuses if file missing    (P3, hard-block)    │
│  any cp command ──► regenerates STATE.md       (P4, derived)       │
└────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   PREVENT (plan-time / lifecycle)                  │
│                                                                    │
│  plan-phase      ──► writes expected-key-files in PLAN frontmatter │
│  write-summary   ──► diffs expected vs actual; demands deviation   │
│                       note in key-decisions on mismatch  (P5)      │
│  scaffold-phase  ──► refuses if prior phase SUMMARY missing (P6)   │
│  complete-milestone ──► hard-runs audit --strict --milestone (P7)  │
└────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   DETECT                                           │
│                                                                    │
│  cplan audit [--milestone X] [--phase N] [--staged] [--strict]     │
│    └─► reads SUMMARY key-files, diffs against                      │
│         git diff base-commit..end-commit                           │
│    └─► finds: phantom-file, forgotten-file, phantom-phase,         │
│                stale-state                                         │
│    └─► outputs structured JSON (severity-tagged) + human report    │
└────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   REPAIR                                           │
│                                                                    │
│  cplan audit --fix [--max N] [--severity high|medium|all]          │
│                    [--dry-run] [--interactive]                     │
│    GSD-mimic 6-step loop:                                          │
│    1. parse-args → 2. run-audit → 3. classify (auto/manual/skip)   │
│    4. present → 5. fix-loop (atomic commits, stop on test fail)    │
│    6. report                                                       │
│                                                                    │
│  4 outcome commands (also invoked internally by --fix):            │
│    cplan reconcile <phase>       — outcome A (doc was wrong)       │
│    cplan scaffold-phase --continue — outcome B (work incomplete)   │
│    cplan supersede <phase>       — outcome C (decision changed)    │
│    cplan deviate <phase>         — outcome D (intentional drift)   │
└────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────────┐
│                   PREVENT (commit-time / agent-level)              │
│                                                                    │
│  P11: Agent literacy — extended CP_BLOCK in CLAUDE.md /            │
│       .github/copilot-instructions.md / .cursor/rules /            │
│       .aider.conf.yml. 8 prevention behaviors. Always-on after     │
│       cp install. Project-scoped by default, --user for global.    │
│                                                                    │
│  P12: Git hooks — opt-in via `cp install --hooks`. Smart shim at   │
│       .git/hooks/pre-commit + post-commit. Discovers affected      │
│       cp projects per commit (monorepo-safe).                      │
│       pre-commit  → cplan audit --staged                           │
│       post-commit → cplan tick --auto                              │
└────────────────────────────────────────────────────────────────────┘
```

## Components

| Phase | Component | Purpose | Public interface | Depends on |
|---|---|---|---|---|
| 17 | SHA pinning foundation | Auto-stamp `base-commit`/`end-commit` on PLAN/SUMMARY frontmatter | `lib/lifecycle.js::scaffoldPhase` + `lib/milestone.js::writeSummary` extensions; `lib/git.js::headSha()` helper | git CLI |
| 18 | Auto key-files at write-time | Default-on; `--no-auto-key-files` flag | `lib/milestone.js::writeSummary` reads `git diff base..end --name-only`, merges with existing key-files | P1 |
| 19 | File-existence hard-block | Exit 2 if any key-file path missing on disk | `lib/milestone.js::writeSummary` ValidationError | (none) |
| 20 | Derived STATE.md | Regenerated on every cp command from phase tree | `lib/state.js::deriveState(root)` replaces all current `writeState` calls; STATE.md becomes read-only output | (none) |
| 21 | Plan-time expected-key-files | PLAN.md frontmatter array; write-summary diffs expected vs actual | `templates/PLAN.md` schema + `lib/milestone.js::writeSummary` check | P1, P2 |
| 22 | scaffold-phase prior-summary check | Refuses if N-1 has no SUMMARY.md | `lib/lifecycle.js::scaffoldPhase` guard + `--force` escape hatch | (none) |
| 23 | complete-milestone audit gate | Hard-runs `audit --strict --milestone X` | `lib/milestone.js::completeMilestone` calls audit; `--no-audit` escape hatch | P8 |
| 24 | `cplan audit` detection | Read-only sweep | `bin/commands/audit.js` + `lib/audit.js`; JSON & human output | P1 |
| 25 | `cplan audit --fix` loop | GSD-mimic 6-step | `bin/commands/audit.js --fix` + `lib/audit-fix.js` orchestrator | P8, P10 |
| 26 | Repair commands | 4 atomic-commit verbs | `bin/commands/reconcile.js`, `bin/commands/supersede.js`, `bin/commands/deviate.js`; `scaffold-phase --continue` flag | P1, P8 |
| 27 | Pre-commit hook | Smart shim at git root | `bin/cp-hook.js` (new) + `install/hooks.js`; `cp install --hooks` flag | P8 |
| 28 | Post-commit hook | Smart shim; `cplan tick --auto` per affected cp project | same shim, post-commit branch | P1, P2 |
| 29 | CI template + backfill | `.github/workflows/cp-audit.yml.example` + `cplan reconcile --infer-shas` | `bin/commands/reconcile.js --infer-shas` (best-effort + accurate modes) | P1, P8 |
| 30 | Agent literacy injection | Drift-prevention principles in CP_BLOCK | `templates/agent-instructions.md` (new) + extensions to all 4 installers | (none) |
| 31 | Docs + release | drift-playbook.md, CHANGELOG, v0.8.0 npm publish | `docs/drift-playbook.md` (new); standard release process | all |

## Data Flow

**Happy path (no drift):**
```
1. cp scaffold-phase 17 → PLAN.md.base-commit = <HEAD>
2. user edits code, commits multiple times
3. cp write-summary 17  → SUMMARY.md.end-commit = <HEAD>
                        → key-files auto-filled from git diff
                        → existence check passes
                        → STATE.md regenerated
4. git commit (post-commit hook runs `tick --auto` → no-op, exit 0 silent)
5. cp complete-milestone v0.8 → audit --strict runs → exits 0 → milestone collapsed
```

**Detected drift path:**
```
1. user deletes a key-file from disk (e.g. lib/foo.js removed in refactor)
   without running `cp write-summary` deviation
2. git commit → pre-commit hook runs `cplan audit --staged`
   → finds PHANTOM-FILE on phase 15 (lib/foo.js claimed but absent)
   → exits 2, commit blocked
3. user runs `cplan audit --fix` → classifies finding as auto-fixable
   → spawns reconcile, opens phase 15 SUMMARY, replaces lib/foo.js entry
     with a key-decisions note ("D-15-001: removed lib/foo.js in refactor")
   → atomic commit "cp(15): reconcile #PHANTOM-FILE-001"
   → re-runs audit → clean → exits 0
4. user re-runs git commit → pre-commit hook → audit clean → commit proceeds
```

## Error Handling

| Failure | Behavior |
|---|---|
| `git` not installed | All P1 mechanisms degrade gracefully; warning emitted; `base-commit`/`end-commit` left null; audit treats null as `confidence: low` |
| `cplan write-summary` finds missing key-file (P3) | Exits 2 with `ValidationError`; prints which file is missing + suggestion (use `--no-key-files` or fix file) |
| `cplan audit --fix` test failure mid-loop | Reverts last commit immediately; stops loop; prints "fixed N of M, stopped at finding ID due to test failure" |
| Pre-commit hook on commit with no cp projects affected | Silent exit 0 |
| Post-commit hook `tick --auto` on broken cp state | Silent exit 0 with single-line warning to stderr; never blocks commits (post-commit is informational only) |
| `cplan complete-milestone` finds HIGH-severity drift | Exits 2; suggests `cplan audit --fix --severity high --milestone <id>` |
| Monorepo with cp installed in only 1 of N sub-projects | Smart shim correctly scopes audit to that one project |

## Testing Strategy

| Layer | Coverage | Phase |
|---|---|---|
| Unit: SHA stamping idempotency | `test/unit-sha-pinning.js` (~20 assertions) | 17 |
| Unit: key-files auto-fill / `--no-auto` | `test/unit-auto-key-files.js` (~15) | 18 |
| Unit: file-existence ValidationError | extends `test/unit-lifecycle.js` (~10) | 19 |
| Unit: derived STATE.md determinism | `test/unit-derived-state.js` (~25) | 20 |
| Unit: expected-key-files diff | `test/unit-expected-key-files.js` (~15) | 21 |
| Unit: scaffold-phase guard | extends `test/unit-lifecycle.js` (~8) | 22 |
| Integration: complete-milestone audit gate | `test/integration-complete-milestone-audit.js` (~12) | 23 |
| Unit: audit detection (all 4 drift types) | `test/unit-audit.js` (~50) | 24 |
| Integration: audit --fix end-to-end | `test/integration-audit-fix.js` (~30) | 25 |
| Unit: 4 repair commands | `test/unit-repair.js` (~40) | 26 |
| Integration: hook smart-shim in single + monorepo fixtures | `test/integration-hooks.js` (~20) | 27, 28 |
| Smoke: backfill `--infer-shas` against historical cp commits | `test/smoke-backfill.js` (~10) | 29 |
| Snapshot: agent-block content in all 4 installers | extends `test/unit-installers.js` (~16) | 30 |
| CI: green on Ubuntu+Windows × Node 20+22 | inherited from v0.6 | all |

Target: +~270 test assertions (from 750 to ~1020 total).

## Alternatives Considered

### Option A — Detection-only (no repair commands)

**Pros:** Smallest scope (~4 phases), audit alone is a meaningful improvement.

**Cons:** Leaves the user to hand-edit `.planning/` files to fix findings,
which is the original drift cause. Audit without repair is a checkbox feature.

**Verdict:** rejected — defeats the goal.

### Option B — Repair-only (skip prevent layer)

**Pros:** Smaller scope (~6 phases); reactive only.

**Cons:** Drift is much cheaper to prevent than to repair. Most users won't
remember to run `cplan audit` regularly.

**Verdict:** rejected — fundamentally wrong stance toward consistency.

### Option C — Mandatory hook installation (default-on)

**Pros:** Best coverage; impossible to drift if hooks always run.

**Cons:** Surprise for v0.7 users; potential for hook conflicts (Husky,
lefthook, pre-commit-framework, lint-staged).

**Verdict:** rejected for v0.8; `cp install --hooks` is opt-in. May
revisit as default in v0.9 once hook conflict-detection is built.

### Option D — Knowledge-graph backed truth (gsd-graphify style)

**Pros:** Single canonical source of truth; arbitrary queries.

**Cons:** Heavy infrastructure (SQLite + tree-sitter); violates "no
external services" + "lightweight" principles in PROJECT.md L48–52.

**Verdict:** rejected — explicitly out of scope per PROJECT.md.

### Option E — Strict agent gating (refusal-based)

**Pros:** Hardest enforcement at source.

**Cons:** User-hostile; agents would refuse legitimate exploration requests.

**Verdict:** rejected (Q5 in brainstorm) — P11 always *suggests* the cp
wrapper, never refuses. Post-commit hook (P12) is the safety net.

## Open Questions

- [ ] Should `cplan doctor` exit 2 (not just warn) when `.planning/` exists
      but hooks are not installed? Default for v0.8: warn only.
- [ ] Should `cplan audit --staged` cache its result for the matching
      `post-commit` invocation to avoid double-work? Defer to phase 27 if
      perf becomes an issue.
- [ ] Should there be a `cplan reconcile --auto` mode that infers fixes for
      forgotten-file findings without prompting? Defer to v0.9.

## References

- Brainstorm transcript: `.planning/MILESTONE-CONTEXT.md` (auto-promoted
  here as appendix on `cp complete-milestone`).
- v0.7 design-capture infra: `docs/architecture.md#interaction-with-workflow-providers`
- GSD audit-fix pattern (basis for P9):
  `~/.copilot/get-shit-done/workflows/audit-fix.md`
- Existing CP_BLOCK install pattern (extended by P11):
  `install/claude.js:52-97`, `install/copilot.js`, `install/cursor.js`,
  `install/aider.js`
- repoRoot() monorepo discovery (basis for hook shim):
  `lib/paths.js:10-25`
- `key-decisions` hard-block prior art (basis for P3 / P5):
  `lib/milestone.js::writeSummary` (lines 419-495)
