# review wave summary

Inline code review of the v1.10 changeset (10 commits, cdcdad7..c53f5f9).

## Scope reviewed
- lib/provider.js (+~148 LOC: parens-sigil parser + fuzzy matcher + skill probes)
- lib/runtime.js (resolvePhaseSkill v1.10 chain + formatInstruction [resolution] line + manual-prompt inline)
- lib/verify.js (new, ~180 LOC, pure stdlib)
- bin/commands/run-verify.js (new)
- templates/workflows/milestone.yaml (verify phase + review.depends_on rewired)
- 5 new test files (76 assertions)
- CHANGELOG.md + package.json (1.10.0 bump)
- DESIGN.md deviation note

## Findings

NO BLOCKERS. Two non-blocking observations recorded as v1.11 inbox seeds:

1. (informational) The chain-fallback emits source: subagent-dispatch with role=null when no phaseRole is set. The resulting [resolution] line reads ... dispatch a subagent with role "(none)" ... which is slightly awkward but accurate. A cleaner directive (e.g. "execute inline; no role hint available") could replace it.

2. (informational) cp run-verify warn-on-no-command always emits to stderr in non-JSON mode. For users with no test infrastructure who never want this output, a behavior.test_command: "(none)" sentinel could explicitly silence it. Not urgent.

## Verification

The verify wave already executed the test suite (239 assertions green via the curated v1.10 subset + key regressions). No additional code or test changes recommended.

## Decision

APPROVE for finalize.

invoked_skill: (inline-fallback)
