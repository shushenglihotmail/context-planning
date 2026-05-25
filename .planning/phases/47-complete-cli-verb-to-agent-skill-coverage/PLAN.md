---
phase: "47"
name: Complete CLI-verb-to-agent-skill coverage + cp workflow inspect
milestone: v1.1 Workflow Skills
status: in-progress
plan-status:
  47-01: complete
  47-02: complete
  47-03: in-progress
created: 2026-05-25
---

# Phase 47: Complete CLI-verb-to-agent-skill coverage + `cp workflow inspect`

**Milestone**: v1.1 Workflow Skills
**Created**: 2026-05-25

## Goal

Close the remaining gap from the v1.1 "every write-side workflow CLI verb
has a matching slash skill" promise. After phases 43+44, only 5 of the
11 `cp workflow` / wave-loop verbs had standalone agent skills. This
phase adds the remaining 6 (import, export, validate, show, diagram,
brainstorm) plus a brand-new `cp workflow inspect` CLI subcommand (with
its own slash skill) that combines `show` output with the deduced
wave-by-wave execution sequence — the topological grouping the runtime
computes internally but never exposes to users.

## Success Criteria

1. `cp workflow inspect <name>` prints the raw template YAML *plus* a
   "Deduced execution sequence" block showing each wave's phases, roles,
   and dependencies; `--json` emits a machine-readable form.
2. `commands/cp/` contains 12 `cp-workflow-*` skill files in total
   (5 from v1.1 phases 43+44 + 7 new in this phase).
3. Every `cp workflow <verb>` CLI subcommand has a matching
   `/cp-workflow-<verb>` agent skill (except `init`, which is a one-shot
   bootstrap that doesn't need an agent companion).
4. Installer auto-pickup works for all 12 new skills (verified via
   `test/unit-v034.js`).
5. Integration test `test/integration-workflow-skills.js` includes shape
   assertions for all 7 new skill files.
6. `npm test` is fully green.

## Plans

- [x] 47-01: `cp workflow inspect <name> [--json]` CLI — combines `show` YAML with `computeWaves` decomposition + dryrun-cli tests.
- [x] 47-02: 7 new agent skills (workflow-import, workflow-export, workflow-validate, workflow-show, workflow-diagram, workflow-brainstorm, workflow-inspect) + installer + integration test updates.
- [x] 47-03: Docs sync — README, MIGRATION-v1.1.md, CHANGELOG amended to reflect the expanded 12-skill surface and 2 new CLI verbs (export + inspect).

## Notes

- `lib/workflow.js#computeWaves(template)` already returns the wave
  groupings; `inspect` just needs to call it and pretty-print.
- Output format for the human-readable inspect (proposed):
  ```
  Wave 1 of N — M phase(s):
    - brainstorm (role: brainstormer)
  Wave 2 of N — M phase(s):
    - research-prior-art (role: researcher, depends on: brainstorm)
    - research-constraints (role: researcher, depends on: brainstorm)
  ```
- For the 7 new skills, follow the same shape as existing
  `cp-workflow-*` skills: frontmatter (name, description, argument-hint,
  requires), numbered Steps, sanitization rules, a "When to use this vs…"
  callout pointing at related skills.
- Skills that wrap pure read-side CLI verbs (show, diagram, validate,
  inspect) can be brief (~3-5 Steps). Brainstorm needs more orchestration
  (it delegates to the provider's brainstorm skill).
