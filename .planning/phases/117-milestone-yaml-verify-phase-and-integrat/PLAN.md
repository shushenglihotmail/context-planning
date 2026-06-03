---
phase_id: 117
title: milestone-yaml-verify-phase-and-integration-tests
milestone: v1-10-skill-routing-verify-gate
status: in-progress
created: 2026-06-02
expected_files:
  - templates/workflows/milestone.yaml
  - test/integration-milestone-verify-gate.js
base-commit: cb9d02ed345cedd4d9eace436cfe7dfb122f5877
---

# PLAN — Phase 117: milestone.yaml verify phase + integration tests

## Goal

Wire the bottom half of the v1.10 verify gate: insert a `verify` scaffold
phase into `templates/workflows/milestone.yaml` between the per-child
fanout (`propose-phases` → `child-plan` → `child-execute`) and `review`.
Change `review.depends_on` to `[verify]` so review is blocked when tests
fail. Also fix the `review_skill` default — currently `"code-review"`
(a literal that exists in no routing map nor any SP catalog) — to
`"review"` (the established routing key that resolves to
`requesting-code-review` via the superpowers provider config).

This closes the second v4.7 retro bug ("runtime TypeError shipped to main
because review wave is prose-only"): the verify phase is `kind: scaffold`
calling `cp run-verify {{milestone_slug}}`, which executes real tests
and fails the wave on non-zero exit — no LLM in the loop, no fake
attestation possible.

## Tasks

1. **milestone.yaml edits**:
   - Append two params: `verify_command` (default `""`), `verify_skip`
     (default `""`).
   - Insert `verify` phase (`kind: scaffold`,
     `command: "cp run-verify {{milestone_slug}} {{verify_skip}}"`,
     `depends_on: [propose-phases]`) after `child-execute`, before `review`.
   - Change `review.depends_on` from `[propose-phases]` to `[verify]`.
   - Change `review_skill` default `"code-review"` → `"review"`.

2. **New `test/integration-milestone-verify-gate.js`**:
   - Load template via `workflow.loadTemplate`.
   - Assert verify phase exists with `kind: scaffold` and command
     references `cp run-verify`.
   - Assert `review.depends_on` contains `verify`.
   - Assert `review_skill` default param is `"review"`.
   - Validate via `workflow.validate` (no errors).
   - Compute waves; assert verify appears in a strictly earlier wave
     than review.

3. **Wire test into `package.json#scripts.test`.**

## Verification

- `node test/integration-milestone-verify-gate.js`
- `node test/unit-workflow.js` (regression)
- `node test/integration-runtime.js` (regression)
- `node test/integration-fanout-milestone-v18.js` (milestone-specific regression)

All must pass before mark-complete.

## Scope

Strictly: template + one integration test. NO changes to lib/, NO config
refresh changes (users opt into `behavior.test_command` explicitly).

## Attestation

Will end SUMMARY with `invoked_skill: (inline-fallback)`.
