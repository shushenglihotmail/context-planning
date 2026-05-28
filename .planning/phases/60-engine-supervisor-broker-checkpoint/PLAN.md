---
phase: "60"
name: Engine + supervisor + broker + checkpoint
milestone: v1.4 Workflow-driven quick and milestone
status: in-progress
created: 2026-05-28
base-commit: da421a9ada8253ceb3454594469fd6b83e36c231
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
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
- [ ] 60-02: Supervisor skill + state.json helpers + sub-agent contract
- [ ] 60-03: Message broker + L1/L2/L3 classifier rubric + `cp classify`
- [ ] 60-04: Checkpoint protocol — snapshot/commit/revert + restart_phase
- [ ] 60-05: Integration tests across the unified supervised runtime

## Notes

<!-- Free-form during phase execution. -->

- Option A locked 2026-05-27: supervisor IS the harness LLM session. See DESIGN.md Status clarification.
