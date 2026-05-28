---
phase: 60-engine-supervisor-broker-checkpoint
plan: 60-05
outcome: "Integration tests proved the v1.4 supervised runtime works end-to-end: initRun → snapshot → recordClassification → commit → restart → re-commit, with scope enforcement and audit-trail preservation across rollback. All 4 new test files wired into npm test; full suite green. Phase 60 complete."
completed: 2026-05-28
end-commit: fabbfd0
key-decisions:
  - decision: Integration tests instantiate real throwaway git repos and call the lib API directly.
    rationale: The supervisor in Option A IS the harness LLM — there is no in-process orchestrator to drive. Calling supervisor/classify/checkpoint directly mirrors what the skill prompts tell the LLM to do, and keeps tests deterministic without spawning child cp processes.
  - decision: restart() merges into the existing phase object instead of replacing it.
    rationale: "Replacing dropped classifier_history and sub_agent_calls — invisible until integration testing exposed it. The fix: merge phaseAfter with the lifecycle-field overrides so audit trail survives rollback. This is exactly the kind of bug unit tests miss but integration tests catch."
  - decision: Wire unit-supervisor-state, unit-classify, unit-checkpoint, and integration-supervisor-flow into npm test in one shot.
    rationale: All four landed in the same milestone; wiring them together at the close of Phase 60 keeps `npm test` as the single audit gate for the v1.4 supervised runtime.
key-files:
  created:
    - bin/commands/checkpoint.js
    - bin/commands/classify.js
    - commands/cp/classify.md
    - commands/cp/run-supervised.md
    - lib/checkpoint.js
    - lib/classify.js
    - lib/supervisor.js
    - test/integration-supervisor-flow.js
    - test/unit-checkpoint.js
    - test/unit-classify.js
    - test/unit-supervisor-state.js
  modified:
    - bin/commands/index.js
    - bin/commands/run.js
    - lib/workflow.js
    - package.json
    - test/unit-workflow-schema-v14.js
---
# Summary 60-05

Plan 60-05 completed.
