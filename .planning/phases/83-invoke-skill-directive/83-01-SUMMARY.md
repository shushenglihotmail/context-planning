---
outcome: delivered
key_files:
  - lib/runtime.js
  - bin/commands/run.js
  - test/integration-format-instruction-skills.js
  - test/integration-runtime.js
key-decisions:
  - "Default mode now emits 'invoke skill: <name>' as a per-phase directive and 'skill: (none)' for absent skills, with the contract legend printed once per wave above the phase blocks. The verb 'invoke' on the per-phase line carries the imperative."
  - "Provenance ((source: routing-key|pinned|pass-through) and the legacy (absent) literal) is preserved behind a new 'cp run --verbose' flag (also applies to 'cp run resume --verbose'), used for routing debugging only."
  - verbose is passed through opts on runtime.startRun/resumeRun/formatInstruction. mark-complete/retry callsites use the default (new) format — verbose is not persisted in run state, matching its role as a debugging convenience.
notes: All 27/27 run-lifecycle suites + 3/3 integration-format-instruction-skills checks pass. Audit summary.high=0.
phase: 83
plan: 83-01
completed: 2026-05-29
key-files:
  created: []
  modified:
    - lib/workflow-template-expand.js
    - test/unit-workflow-template-expand.js
end-commit: acb02829868aa940546609142a3174154e06a8e2
---
# Summary 83-01

Plan 83-01 completed.
