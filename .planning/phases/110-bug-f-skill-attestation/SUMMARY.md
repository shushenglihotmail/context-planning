Bug F complete via SDD.

Commit: 011c695 feat(audit): skill attestation contract + audit rule (Bug F)

3-in-1 change:
(a) lib/runtime.js formatInstruction() appends [attestation] contract when invoke skill: <name> emitted; absent when skill: (none).
(b) lib/runtime.js markPhaseComplete() parses 'invoked_skill:' from summary stdin and writes to .planning/.run-state/<slug>/<phaseId>.json (NEW dedicated audit-state dir, intentionally separate from .planning/runs/ supervisor state).
(c) lib/audit.js new rule skill-resolved-but-not-loaded: MEDIUM when invoked_skill missing or mismatched against resolved skill (with superpowers/ prefix normalization), LOW for (inline-fallback) deliberate bypass. Allowlist-gated via Bug E's REVIEWER_BEARING_SKILLS const. Never blocks.

Implementer judgment calls (reviewer approved):
- Attestation write in runtime.js (not bin/commands/run.js) so phase/milestone/quick bindings all share one path.
- .planning/.run-state/ as new dir for audit-specific state; reviewer confirmed clean separation from .planning/runs/ supervisor state.
- inline-fallback = LOW severity (deliberate-bypass surface worth surfacing softly).

Files: lib/runtime.js (+54/-1), lib/audit.js (+134/-1), package.json (+1/-1), 3 new integration test files.

Tests: 30 new assertions across integration-skill-attestation-prompt.js (4), integration-mark-complete-invoked-skill.js (12), integration-audit-skill-resolved-but-not-loaded.js (14). Full npm test green.

Reviews: Spec+quality (Haiku) APPROVED on first pass. All 3 sub-pieces verified, run-state path verdict KEEP (good design), path-traversal risk acceptable (slug/phaseId programmatically generated), error handling robust (never throws), back-compat clean (v1.8.x runs with no .run-state/ yield no findings).
