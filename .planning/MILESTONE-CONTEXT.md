# MILESTONE-CONTEXT

> Active milestone: **v1.10 Skill Routing & Verify Gate**
> Slug: `v1-10-skill-routing-verify-gate`
> Status: planning (post-brainstorm) — 2026-06-02

## One-paragraph framing

Two real framework bugs surfaced by a downstream consumer's v4.7
retrospective get fixed in v1.10.0: silent skill-routing failures
(`lib/provider.js#resolveSkill` checks provider install but not
per-skill `SKILL.md` existence) and prose-only verification gates
(`milestone.yaml` review phase reads code but never runs it). Fix
adds per-skill availability check + parens-sigil opt-in fuzzy
matching + five-step resolution chain, plus a new `cp run-verify`
scaffold phase inserted before review with `depends_on` wiring.
Three other retro items already fixed in v1.9 or were non-bugs.

## Hard constraints (inherited)

- GSD round-trip compatibility (`cp gsd-import` must remain clean).
- No external services / no telemetry.
- Zero runtime deps in `bin/`/`lib/`; test deps OK.

## Locked decisions

| Topic | Decision |
|---|---|
| Scope | 2 real bugs (skill probe + verify gate) + PowerShell docs blurb |
| Version bump | 1.10.0 (minor) |
| Sigil syntax | `(skill-name)` — parens-wrap, YAML-safe at any position |
| Sigil policy | Strict by default; fuzzy ONLY when SP has no exact match |
| Fuzzy algorithm | role-filter → tokenize on `-`/`_` → token-overlap with substring → threshold ≥ 0.5 → tiebreak score>shortest>alpha |
| Resolution chain | sigil-fuzzy → exact → manual prompt inline → subagent-dispatch directive → bare phase prompt |
| Diagnostic | ONE consolidated block at workflow start (✓/ℹ/⚠), no per-wave noise |
| Verify gate | `kind: scaffold` real CLI exec; opt-out via `behavior.verify: false` / `--skip-verify` |
| Autonomy | Never prompts user mid-workflow; never auto-installs or auto-rewrites config |
| Sequencing | 5 phases: P1 provider → P2 runtime → P3 verify-cmd → P4 milestone.yaml → P5 docs+release |
| Release | Single `npm publish` after Phase 5 |

## Verified non-bugs (no work)

- STATE.md auto-rollover — already fixed v1.9.0 Bug C (commit `92d14a9`).
- Empty `finalize` prompt — by-design (`kind: scaffold` runs `cp milestone-finalize`).
- Auto-staging `.planning/` — per-project policy.

## See also

- `.planning/milestones/v1-10-skill-routing-verify-gate/DESIGN.md`
- `docs/superpowers/specs/2026-06-02-v1.10-skill-routing-verify-gate-design.md`
- Inbox seeds (superseded): `.planning/INBOX.md` entries #4 → #5 → #6 → #7 → #8
- `PROJECT.md`, `ROADMAP.md`, `STATE.md`
