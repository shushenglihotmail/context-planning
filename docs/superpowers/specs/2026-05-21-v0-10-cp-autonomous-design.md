---
spec: v0.10 — /cp-autonomous
date: 2026-05-21
status: Accepted
milestone: v0.10 Autonomy
---

# /cp-autonomous — autonomous phase/milestone driver

## Status

Accepted on 2026-05-21. Centerpiece of v0.10 Autonomy.

## Context

cp ships per-step verbs (`plan-phase`, `execute-phase`, `tick`,
`write-summary`, `state regen`, `complete-milestone`) and the slash
skills that wrap them. To advance a milestone today the user — or the AI
agent — must drive every transition by hand. In a session that ships
multiple phases this is mechanical and error-prone: forget a `tick`,
skip a `state regen`, leave a SUMMARY half-written. GSD ships
`/gsd-autonomous` which loops `discuss → plan → execute` until the
milestone is done; cp has no equivalent.

This spec adds `/cp-autonomous` and the supporting `cp autonomous` CLI.
It is bounded at a single milestone, smart-gated on test/audit/deviation
failures, and stops cleanly via `.planning/.continue-here.md` so
`/cp-resume` can pick up.

## Decision

Ship `/cp-autonomous` as **Approach 2 — skill + lib helper** mirroring
the `cp update` v0.9 shape. Implementation has four pieces:

1. `lib/autonomous.js` — pure orchestrator. Exports
   `runAutonomous(root, opts)` returning a structured result.
2. `bin/commands/autonomous.js` — thin CLI handler. Flags `--scope`,
   `--check`, `--json`, `--quiet`.
3. `commands/cp/autonomous.md` — single-source `/cp-autonomous` slash
   skill, installed by all four harness installers.
4. `test/unit-autonomous.js` — ~15 assertions covering scope parsing,
   START auto-detect, smart gates, JSON shape, `.continue-here.md`
   contents.

## Consequences

### Positive

- One command (or one slash invocation) drives a whole milestone.
- Smart gates surface failures inline instead of silently skipping.
- `.continue-here.md` integrates with the existing `/cp-resume` flow.
- Lib helper is unit-testable; skill layer stays prose-only.
- CLI surface enables CI scripting (`cp autonomous --check` as a gate).

### Negative / risks

- More surface area to maintain (4 new files).
- AI-agent token cost per phase is moderate (plan-phase + execute-phase
  still need agent reasoning); long milestones consume context.
- A poorly-defined PLAN.md can still cause executor deviations
  mid-loop — smart gates catch this but the user must intervene.

## Architecture

```
User → /cp-autonomous slash skill
         │
         ├─► cp autonomous [START] [--scope=...] --json
         │     │
         │     ├─► lib/autonomous.runAutonomous(root, opts)
         │     │     │
         │     │     ├─ resolve start phase (auto-detect | arg | milestone)
         │     │     ├─ resolve scope (phase | N | N-M | milestone)
         │     │     ├─ clamp to milestone boundary
         │     │     ├─ loop over phases:
         │     │     │     ├─ ensure PLAN.md filled (else delegate /cp-plan-phase)
         │     │     │     ├─ for each pending plan:
         │     │     │     │     ├─ delegate /cp-execute-phase scoped to plan
         │     │     │     │     ├─ write-summary, tick, state regen
         │     │     │     │     ├─ smart-gate: tests + audit
         │     │     │     │     └─ if gate trips → write .continue-here.md, return stopped
         │     │     │     └─ on phase-end: continue or run /cp-complete-milestone
         │     │     └─ return structured result
         │     └─ print JSON or human summary
         │
         └─ skill interprets result, prompts user inline on stop
```

## CLI surface

```
cp autonomous [START] [--scope=<value>] [--check] [--json] [--quiet]

START forms (mutually exclusive, all optional):
  (omitted)                auto-detect from STATE.md
                           (in-progress phase if any, else next pending)
  <phase-number>           e.g. "32" — start at this phase
  "<milestone-name>"       e.g. "v0.10 Autonomy" — first pending phase
                           of that milestone

--scope flag values:
  phase                    just the START phase (run all its plans + close-out)
  <N>                      next N phases from START (inclusive of START;
                           e.g. START=32, --scope=3 → phases 32, 33, 34)
  <N>-<M>                  explicit inclusive phase range (e.g. "32-34");
                           START arg is ignored when this form is used
  milestone                DEFAULT — all remaining phases in the active
                           milestone

Hard cap (non-negotiable):
  The loop NEVER crosses milestone boundaries, regardless of --scope.
  e.g. --scope=32-50 stops at the last phase of the current milestone.

Other flags:
  --check                  preview only; equivalent to --json + dryRun=true;
                           exits 1 if any phase would run (CI gate)
  --json                   structured machine-readable output (see "JSON
                           output shape" below)
  --quiet                  suppress per-phase progress lines (final summary
                           still printed unless --json)
```

## Smart gates (stop conditions)

The loop stops, writes `.planning/.continue-here.md`, and returns
`{ok: false, stopped: true, reason: ...}` when ANY of:

| Trigger             | Detection                                                                 | Captured in .continue-here.md                       |
|---------------------|---------------------------------------------------------------------------|-----------------------------------------------------|
| Plan execution fail | `/cp-execute-phase` exits non-zero OR executor reports `deviation`        | Phase/plan id, last error, files mid-edit           |
| Test failure        | `npm test` (or `config.cp.behavior.test_command`) non-zero after a commit | Failed test names, plan id, commit SHA              |
| Audit HIGH          | `cp audit` finds any HIGH severity finding after a plan or phase          | Finding list, files, severity                       |
| Audit gate fail     | `cp complete-milestone` audit gate returns HIGH or MEDIUM                 | Same                                                |
| User SIGINT         | Ctrl+C while loop is running                                              | "User interrupted at phase N plan M"                |

Smart gates are **always on**. There is no `--no-gates` escape. The
correct recovery is: user fixes the cause, then re-invokes
`/cp-autonomous` (or `/cp-resume`), which reads `.continue-here.md` and
picks up at the next pending plan.

## Per-phase loop (pseudocode)

```
for phase in phases_in_scope:                            # resolved by lib
  # Step 1: ensure plan exists
  if PLAN.md is template-stub or missing:
    invoke /cp-plan-phase {N}                            # provider brainstorms

  # Step 2: drive each plan
  for plan in phase.plans (in roadmap order):
    if plan.status == "done" in ROADMAP: continue
    invoke /cp-execute-phase scoped to this plan
    cp write-summary {plan-id} --from <json>
    cp tick {plan-id}
    cp state regen

    # Smart gates after each plan commit
    if test_command configured (config.cp.behavior.test_command;
       defaults to "npm test" if package.json present):
      run tests; on fail → SMART GATE
    run `cp audit`; if HIGH → SMART GATE

  # Step 3: phase-end
  # (no per-phase complete; close-out happens at milestone end)

# Step 4: scope-end
if scope == milestone:
  invoke /cp-complete-milestone
else:
  stop cleanly; state already reflects progress
```

## JSON output shape

### Success

```json
{
  "ok": true,
  "scope": "milestone",
  "milestone": "v0.10 Autonomy",
  "startPhase": "32",
  "phasesProcessed": [
    {"phase": "32", "plans": 3, "status": "done", "duration": "12m"},
    {"phase": "33", "plans": 2, "status": "done", "duration": "8m"}
  ],
  "stopped": false,
  "stopReason": null,
  "continueHere": null
}
```

### Stopped

```json
{
  "ok": false,
  "scope": "milestone",
  "milestone": "v0.10 Autonomy",
  "startPhase": "32",
  "phasesProcessed": [
    {"phase": "32", "plans": 3, "status": "done", "duration": "12m"}
  ],
  "stopped": true,
  "stopReason": "test-failure",
  "failedPhase": "33",
  "failedPlan": "33-02",
  "details": "FAIL test/unit-foo.js > ...",
  "continueHere": ".planning/.continue-here.md"
}
```

### Dry-run (`--check`)

```json
{
  "ok": true,
  "dryRun": true,
  "scope": "milestone",
  "phasesWouldRun": ["32", "33", "34"],
  "totalPlans": 7
}
```

Exit code 1 if `phasesWouldRun.length > 0` (CI gate); 0 if nothing to do.

## Skill behavior (`commands/cp/autonomous.md`)

`/cp-autonomous` runs `cp autonomous --json`, interprets the result, and:

- **On `ok: true`** — print compact summary table (phases × plans ×
  duration), suggest the next step depending on `--scope` used.
- **On `stopped: true`** — print stop reason + failing-context excerpt,
  show the path to `.continue-here.md`, then ask the user **inline via
  the harness's question mechanism** (never silently continue). The
  prompt is tailored to the stop reason:
  - `test-failure` → "(a) drop into /cp-debug, (b) skip this plan and
    continue, (c) abort manually"
  - `audit-high` → "(a) /cp-audit --fix, (b) /cp-reconcile, (c) abort"
  - `deviation` → "(a) /cp-resume to retry, (b) /cp-supersede to record
    the deviation as intentional, (c) abort"
  - `sigint` → "(a) resume from here, (b) abort"

The user's answer drives the next slash invocation. The agent stays in
the same session; nothing exits.

## File layout

| File                                | Type    | Notes                                              |
|-------------------------------------|---------|----------------------------------------------------|
| `bin/commands/autonomous.js`        | NEW     | CLI handler + arg parsing                          |
| `lib/autonomous.js`                 | NEW     | `runAutonomous(root, opts)` orchestrator           |
| `commands/cp/autonomous.md`         | NEW     | `/cp-autonomous` slash skill (single source)       |
| `test/unit-autonomous.js`           | NEW     | ~15 unit assertions                                |
| `bin/commands/index.js`             | MODIFY  | register `autonomous`                              |
| `bin/commands/_usage.js`            | MODIFY  | add usage row                                      |
| `package.json`                      | MODIFY  | append `test/unit-autonomous.js` to test chain     |
| `README.md`                         | MODIFY  | mention in decision matrix + skill list            |
| `CHANGELOG.md`                      | MODIFY  | `[Unreleased]` entry                               |
| `install/{copilot,claude,cursor,aider}.js` | (auto) | re-read `commands/cp/autonomous.md` on install |

## Testing strategy

`test/unit-autonomous.js` — pure unit, no live execution. Uses fixture
repos with synthetic STATE.md / ROADMAP.md / PLAN.md content.

Assertions (~15):

1. Scope parser: `phase` → 1 phase
2. Scope parser: `5` → next 5 phases
3. Scope parser: `3-7` → explicit range
4. Scope parser: `milestone` → all remaining
5. Scope parser: invalid input → throws with clear message
6. START auto-detect: in-progress phase from STATE.md
7. START auto-detect: next pending when idle
8. START from CLI arg overrides auto-detect
9. Milestone-cap: `--scope=3-50` clamps to milestone end
10. Smart gate: synthetic audit-HIGH → `stopped: true, reason: 'audit-high'`
11. Smart gate: synthetic test-failure → `stopped: true, reason: 'test-failure'`
12. `.continue-here.md` written with phase/plan id + reason
13. `--check` exits 0 with `dryRun: true`; no files written
14. `--json` output matches shape in §"JSON output shape"
15. Done plans (status=done in ROADMAP) are skipped, not re-executed

Integration testing: `docs/autonomous-smoke.md` documents a manual
smoke-test sequence against a fixture milestone (not part of CI).

## Milestone breakdown (v0.10 Autonomy)

Suggested phases:

| # | Phase                            | Goal                                                                              |
|---|----------------------------------|-----------------------------------------------------------------------------------|
| A | `cp autonomous` CLI + lib helper | Ship `lib/autonomous.js` + `bin/commands/autonomous.js` + unit tests              |
| B | `/cp-autonomous` slash skill     | Ship `commands/cp/autonomous.md`, ensure installer auto-pickup on next `cp install` |
| C | Docs + release                   | README + CHANGELOG entries; version bump 0.9.x → 0.10.0; npm publish + tag       |

## Alternatives considered

### Alternative 1 — Pure skill, no new code

Implementation lives entirely in `commands/cp/autonomous.md` as agent
instructions. Smart-gate logic lives in prose.

- Pro: Fastest to ship; no code surface.
- Pro: Fully observable in chat (every step is an agent action).
- Con: Smart-gate logic is not unit-testable; prose drift over versions.
- Con: No CLI surface for CI scripting.

Rejected: smart gates need test coverage to be trustworthy.

### Alternative 2 — Bolt onto `cp execute-phase`

Add `--autonomous` + `--scope` flags to existing `cp execute-phase`.

- Pro: Fewest moving parts; one command does both.
- Con: Conflates "single phase" vs "many phases" semantics — harder to
  teach and document.
- Con: Flag-set grows; hard to maintain back-compat as autonomous
  behavior evolves.

Rejected: separate command keeps single-responsibility intent clear.

## Open questions

None at spec-time. Design has user-locked answers for:

- Scope flag forms (including `N-M` range)
- Smart gates always on (no `--no-gates`)
- Stop behavior: write `.continue-here.md` + prompt inline (don't exit)
- START forms supported: bare / phase number / milestone name

## References

- v0.9 `cp update` design (template for skill + lib split):
  see `commands/cp/update.md` + `lib/update.js`
- GSD `/gsd-autonomous` skill (conceptual inspiration):
  `~/.copilot/skills/gsd-autonomous/SKILL.md`
- `/cp-resume` skill (consumer of `.continue-here.md`):
  `commands/cp/resume.md`
