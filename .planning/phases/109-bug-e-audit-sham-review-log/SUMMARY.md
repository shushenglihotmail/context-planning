Bug E complete via SDD.

Commit: d99a7ef feat(audit): add sham-review-log MEDIUM rule (Bug E)

Change: new MEDIUM audit rule sham-review-log. Fires when REVIEW-LOG.md contains 'approved on first pass' AND no real reviewer record is parseable from headings after the <!-- REVIEW-LOG-ENTRIES-BELOW --> marker. Allowlist-gated: only runs when project execute skill is in REVIEWER_BEARING_SKILLS (subagent-driven-development, executing-plans, requesting-code-review, both short and superpowers/ prefixed forms). Never blocks; severity MEDIUM.

Files: lib/audit.js (rule, helpers, registration ~line 466, REVIEWER_BEARING_SKILLS const), test/unit-audit.js (+14 tests covering positive, real-reviewer-present, no-log, allowlist-skip, self-reviewer, empty-log).

Tests: 64 unit-audit (+25), all green. Full npm test green.

Reviews: Spec+quality (Haiku) APPROVED. Flagged heading-parse heuristic as FRAGILE-BUT-OK for v1 (forgeable but acceptable for suspicious-pattern detection; real assurance lives in Bug F's write-time attestation). Allowlist scope correctly project-level given current config.json structure (no per-phase override exists yet). No fixes required.
