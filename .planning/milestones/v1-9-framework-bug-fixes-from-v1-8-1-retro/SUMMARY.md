---
milestone: v1.9 Framework Bug Fixes from v1.8.1 Retro
status: complete
shipped_in: v1.9.0
phases: 6
commits: 9
---

# v1.9 Milestone Summary

Six framework bugs surfaced by the WCCT-Copilot retro of v1.8.1 (also informing the v1.8.2 Bug G fan-out fix). Closed via the milestone workflow itself — full dogfood of v1.8.2's structured fan-out parent + array-mode sequencing.

## Bugs fixed

| # | Phase | Bug | Commits |
|---|-------|-----|---------|
| A | 105 | `cp status` blind to `#### Phase` headings — `lib/roadmap.js` regexes widened `^### ` → `^#{3,4}` | `6863637` |
| B | 106 | `writeSummary()` scraped phantom paths from PLAN body — now reads `expected_files:` from PLAN frontmatter (legacy back-compat preserved; `--no-file-check` deprecation warning; DEBUG log when frontmatter absent) | `19bb703`, `1a4195e` |
| C | 107 | `cp complete-milestone` left stale STATE.md banner — try/catch warning around `state.regenerate(root)` (exit 0 preserved on regen failure) | `92d14a9` |
| D | 108 | `cp doctor` warned dual-plan with no autofix — `--fix-dual-plan` flag archives losers under `.planning/.archive/` (size/mtime rule; safer than draft "delete short-form" heuristic — reconciled in `5d9b19c`) | `1e2dbc9`, `5d9b19c` |
| E | 109 | Sham `REVIEW-LOG.md` ("approved on first pass" with no real reviewer) — new MEDIUM audit rule `sham-review-log`, allowlist-gated to reviewer-bearing skills | `d99a7ef` |
| F | 110 | Orchestrators silently bypassed routed skills — `[attestation] invoked_skill:` contract in per-phase prompt, parsed at mark-complete, persisted to `.planning/.run-state/<slug>/<phaseId>.json`, audited by new MEDIUM rule `skill-resolved-but-not-loaded` (LOW for explicit `(inline-fallback)`) | `011c695` |

## Cross-cutting fix (final review)

`f2ca64a` fix(audit,milestone): false-positive attestation + misleading deprecation warning

- Bug F audit rule was firing MEDIUM findings for every `kind: scaffold` phase (`setup`, `finalize`) because the rule gated on the **project's** execute skill rather than the **phase's** resolved skill. Fixed by persisting `resolved_skill` alongside `invoked_skill` and having the rule skip records where `resolved_skill = '(absent)'`. Future-proof contract.
- Bug B follow-up deprecation message reworded — old text falsely implied a never-used legacy key.

## Process

- Dogfooded v1.8.2's Bug G fan-out: ran `cp run milestone` from scratch, fed structured-list JSON to the propose-phases wave, watched wave count jump 7 → 19 with 12 child waves auto-injected. **Bug G confirmed working in production.**
- All 6 PLAN.md files written in parallel (6 Haiku planner subagents simultaneously) before the execute loop began — each plan wave became a near-instant mark-complete.
- Each bug's child-execute wave used **subagent-driven-development**: implementer subagent (Sonnet) → combined spec+quality reviewer (Haiku) → mark complete. Bug B required a follow-up commit; Bug D required a doc-only reconciliation; A/C/E/F approved first pass.
- Cross-cutting final review (code-review agent) caught a real blocker missed by per-bug reviewers — fixed before ship.

## Tests

Full `npm test` green throughout. New assertions across the milestone:
- `test/unit-libs.js`: +25 (Bug A: h4 phase regex) and +27 (Bug B: `_extractExpectedKeyFiles`)
- `test/dryrun-write-summary.js`: +4 sections (Bug B e2e)
- `test/unit-lifecycle.js`: +36 (Bug C: STATE regen success + failure paths)
- `test/dryrun-doctor.js`: +5 sections, +27 assertions (Bug D: dual-plan autofix)
- `test/unit-audit.js`: +25 (Bug E: sham-review-log rule + parser)
- `test/integration-skill-attestation-prompt.js`: new, 4 (Bug F: contract emission)
- `test/integration-mark-complete-invoked-skill.js`: new, 14 (Bug F: parse + persist; +2 from final fix)
- `test/integration-audit-skill-resolved-but-not-loaded.js`: new, 15 (Bug F: audit rule; +1 from final fix)

## Files touched

`lib/roadmap.js`, `lib/milestone.js`, `lib/lifecycle.js`, `lib/audit.js`, `lib/audit-fix.js`, `lib/runtime.js`, `bin/commands/doctor.js`, `bin/commands/write-summary.js`, `package.json`, plus tests.

## Validated by

Self-attestation: this milestone's review wave was completed with `invoked_skill: (inline-fallback)` because the `code-review` routing key is not registered as a provider skill (warning emitted by runtime). Bug F's new audit rule will flag this as a LOW finding on the next `cp audit` — by design.

## Workflow phase: finalize

SUMMARY.md written for v1.9 milestone. See .planning/milestones/v1-9-framework-bug-fixes-from-v1-8-1-retro/SUMMARY.md

