---
milestone_slug: "v0-10-autonomy"
status: Accepted
date: 2026-05-21
---

# v0.10 Autonomy — milestone DESIGN

## Status

Accepted on 2026-05-21.

## Context

Every milestone shipped to date (v0.4 through v0.9) was driven phase-by-phase, plan-by-plan by hand. Each transition (`cp tick`, `cp write-summary`, `cp state regen`, `cp complete-milestone`) is mechanical; forgetting any one of them produces drift the v0.8 audit stack catches but a human still has to repair. GSD ships `/gsd-autonomous` which loops `discuss → plan → execute` until the milestone is done; cp has no equivalent.

This milestone adds `/cp-autonomous` and the supporting `cp autonomous` CLI. It is bounded at a single milestone, smart-gated on test/audit/deviation failures, and stops cleanly via `.planning/.continue-here.md` so `/cp-resume` can pick up.

## Decision

Ship `/cp-autonomous` as Approach 2 — skill + lib helper, mirroring the `cp update` v0.9 shape:

1. `lib/autonomous.js` — pure orchestrator. Exports `runAutonomous(root, opts)` returning a structured result.
2. `bin/commands/autonomous.js` — thin CLI handler. Flags `--scope`, `--check`, `--json`, `--quiet`.
3. `commands/cp/autonomous.md` — `/cp-autonomous` slash skill, installed by all four harness installers via the existing re-read-on-install pattern.
4. `test/unit-autonomous.js` — ~15 unit assertions.

Full spec: `docs/superpowers/specs/2026-05-21-v0-10-cp-autonomous-design.md`.

## Consequences

### Positive

- One command (or one slash invocation) drives a whole milestone.
- Smart gates surface failures inline instead of silently skipping.
- `.continue-here.md` integrates with the existing `/cp-resume` flow.
- Lib helper is unit-testable; skill prose stays focused on UX.
- CLI surface enables CI scripting (`cp autonomous --check` as a gate).

### Negative / risks

- 4 new files of surface area to maintain.
- AI-agent token cost per phase is moderate; long milestones consume context.
- A poorly-defined PLAN.md can still cause executor deviations mid-loop — smart gates catch this but the user must intervene.

## Architecture

User → `/cp-autonomous` slash skill → `cp autonomous --json` → `lib/autonomous.runAutonomous` → loops phases → delegates per-phase work to `/cp-plan-phase` and `/cp-execute-phase` → smart-gate checks (tests + audit) after each plan commit → on gate trip, writes `.continue-here.md` and returns `{stopped: true, reason}` → skill interprets, prompts user inline (no session exit).

## Components

- `lib/autonomous.js` — scope parser, START resolver, milestone-cap clamp, loop body, smart-gate detection, `.continue-here.md` writer.
- `bin/commands/autonomous.js` — argv parsing, dispatch to lib, JSON or human output, exit codes (0 success, 1 stopped/check-found-changes, 2 hard error).
- `commands/cp/autonomous.md` — pre-flight checks, dispatch to CLI, interpret JSON, prompt user inline on stop with reason-tailored choices.
- `test/unit-autonomous.js` — fixture-repo unit tests.

## Data flow

CLI accepts START + `--scope`. Resolves START via STATE.md if omitted, via roadmap lookup if milestone name, or directly if phase number. Resolves scope to a phase list, clamps to milestone end. For each phase: ensures PLAN.md is non-stub (delegates `/cp-plan-phase` if not), then walks each pending plan, delegating `/cp-execute-phase` scoped to that plan, then running `cp write-summary`, `cp tick`, `cp state regen` as CLI helpers. After each plan commit: runs test command (if configured) and `cp audit` quick check. On any failure → writes `.continue-here.md` capturing reason + position, returns stopped result. On scope end with `--scope=milestone`: runs `/cp-complete-milestone`.

## Error handling

| Condition         | Behavior                                                                      |
|-------------------|-------------------------------------------------------------------------------|
| Bad START arg     | Exit 2 with `{ok: false, reason: 'invalid-start'}` + clear message          |
| No active milestone | Exit 2 with `{ok: false, reason: 'no-active-milestone'}`                  |
| Scope out of range | Clamp silently, return `phasesProcessed` reflecting actual run             |
| Test failure      | Write `.continue-here.md`, return `{stopped: true, reason: 'test-failure'}` |
| Audit HIGH        | Same shape, reason: `'audit-high'`                                          |
| Executor deviation | Same shape, reason: `'deviation'`                                          |
| SIGINT            | Same shape, reason: `'sigint'`                                              |

## Testing strategy

- Unit: `test/unit-autonomous.js` covers scope parser, START resolver, milestone-cap, smart-gate trip, `.continue-here.md` write, `--check`, `--json` shape, done-plan skip (~15 assertions). Fixture repos only, no live cp execution.
- Integration: documented manual smoke test (`docs/autonomous-smoke.md`) — not in CI.
- Regression: full `npm test` chain after each phase.

## Alternatives considered

1. **Pure skill (no new code)** — fastest, but smart-gate logic in prose is not unit-testable. Rejected.
2. **Bolt onto `cp execute-phase` with `--autonomous` flag** — fewer files, but conflates single-phase vs many-phase semantics. Rejected for teachability.

## Open questions

None at milestone-start.

## References

- Full design: `docs/superpowers/specs/2026-05-21-v0-10-cp-autonomous-design.md`
- v0.9 `cp update` (template for skill + lib split): `commands/cp/update.md` + `lib/update.js`
- GSD `/gsd-autonomous` (conceptual inspiration): `~/.copilot/skills/gsd-autonomous/SKILL.md`
- `/cp-resume` (consumer of `.continue-here.md`): `commands/cp/resume.md`