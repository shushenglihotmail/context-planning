---
phase: "60"
name: Engine + supervisor + broker + checkpoint
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: da421a9ada8253ceb3454594469fd6b83e36c231
expected_files:
  - bin/commands/checkpoint.js
  - bin/commands/classify.js
  - bin/commands/index.js
  - bin/commands/run.js
  - commands/cp/classify.md
  - commands/cp/run-supervised.md
  - lib/checkpoint.js
  - lib/classify.js
  - lib/supervisor.js
  - lib/workflow.js
  - package.json
  - test/integration-supervisor-flow.js
  - test/unit-checkpoint.js
  - test/unit-classify.js
  - test/unit-supervisor-state.js
  - test/unit-workflow-schema-v14.js
---

# Phase 60: Engine + supervisor + broker + checkpoint

**Milestone**: v1.4 Workflow-driven quick and milestone
**Created**: 2026-05-28

## Goal

Implement the v1.4 supervised-workflow runtime in the `cp` engine:
schema, state, broker, checkpoint primitives. Output is a set of
helpers + skill prompts the harness LLM uses to drive supervised
workflows. No daemon, no embedded LLM (Option A — DESIGN.md Decision #6).

## Success Criteria

<!-- Observable from the user's perspective. -->
1. Workflow YAML accepts `kind: skill|scaffold` and validates per-Decision #1/#3 (60-01 ✅).
2. A supervisor skill exists and is loadable; cp engine exposes state.json read/write + path-scoped output helpers (60-02).
3. Message classifier rubric (L1/L2/L3) is documented and a `cp classify` helper exists (60-03).
4. `cp checkpoint snapshot|commit|revert <run-id> <phase-id>` works end to end with `restart_phase` semantics (60-04).
5. An integration test drives a small supervised workflow through resume + commit + revert successfully (60-05).

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 60-01: kind=scaffold + materialize unification + defaults
- [x] 60-02: Supervisor skill + state.json helpers + sub-agent contract
- [x] 60-03: Message broker + L1/L2/L3 classifier rubric + `cp classify`
- [x] 60-04: Checkpoint protocol — snapshot/commit/revert + restart_phase
- [x] 60-05: Integration tests across the unified supervised runtime

## Notes

<!-- Free-form during phase execution. -->

- Option A locked 2026-05-27: supervisor IS the harness LLM session. See DESIGN.md Status clarification.
