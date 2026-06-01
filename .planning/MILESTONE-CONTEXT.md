# MILESTONE-CONTEXT

> Active milestone: **v1.9 Framework Bug Fixes from v1.8.1 Retro**
> Slug: `v1-9-framework-bug-fixes-from-v1-8-1-retro`
> Status: planning (post-brainstorm) — 2026-06-01

## One-paragraph framing

Six framework gaps surfaced by the WCCT-Copilot retro of cp v1.8.1 get
fixed in v1.9.0: ROADMAP scanner heading drift (A), write-summary
phantom-path scraping (B), complete-milestone stale STATE banner (C),
doctor dual-PLAN auto-fix (D), sham REVIEW-LOG audit rule (E), and
skill-load attestation (F). Each becomes one atomic phase with tests.

## Hard constraints (inherited)

- GSD round-trip compatibility (`cp gsd-import` must remain clean).
- No external services / no telemetry.
- Zero runtime deps in `bin/`/`lib/`; test deps OK.

## Locked decisions

| Topic | Decision |
|---|---|
| Scope | All six bugs A–F |
| Version bump | 1.9.0 (minor) |
| Bug A | Scanner-only: accept `#{2,6}`, no normalization |
| Bug E severity | Always-on, MEDIUM, allowlisted reviewer-bearing skills |
| Bug F severity | Always-on, MEDIUM, missing field = `<unrecorded>` (back-compat) |
| Sequencing | 1–4 sequential; 5 & 6 may be parallel wave |
| Release | Single `npm publish` after Phase 6 |

## See also

- `.planning/milestones/v1-9-framework-bug-fixes-from-v1-8-1-retro/DESIGN.md`
- `PROJECT.md`, `ROADMAP.md`, `STATE.md`
