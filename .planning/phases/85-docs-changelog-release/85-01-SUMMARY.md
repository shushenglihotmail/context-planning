---
key-decisions:
  - v1.6.0 ships as a single release covering all four design items (D1 auto-inject finalize, D2 invoke-skill directive, D3 expanded CONFIG_FALLBACKS, D4 prompt scrub).
  - Migration notes target workflow authors (no action needed for explicit finalize) and supervisor agents (read the one-time contract legend).
  - README gets a dedicated 'Skill invocation (v1.6)' subsection rather than scattering the contract across existing sections.
phase: 85
plan: 85-01
completed: 2026-05-29
key-files:
  created:
    - bin/commands/run-finalize.js
    - test/unit-workflow-auto-inject-finalize.js
  modified:
    - bin/commands/index.js
    - bin/commands/run.js
    - bin/commands/workflow.js
    - lib/runtime.js
    - lib/workflow-template-expand.js
    - lib/workflow.js
    - test/dryrun-workflow-cli.js
    - test/fixtures/workflows/dev-mini.yaml
    - test/fixtures/workflows/quick-mini.yaml
    - test/integration-format-instruction-skills.js
    - test/integration-runtime.js
    - test/unit-run-lifecycle.js
    - test/unit-workflow-template-expand.js
end-commit: 9c5970639be4a7d68dd321a63a7949e21c729aee
---
# Summary 85-01

Plan 85-01 completed.
