---
phase: "43"
name: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume
milestone: v1.1 Workflow Skills
status: in-progress
created: 2026-05-25
base-commit: f1e6a24a3d5b4b8b95d9709c063c09332af11012
plan-status:
  43-01: complete
  43-02: complete
  43-03: in-progress
plan-started:
  43-01: 2026-05-25T20:25:00.000Z
  43-02: 2026-05-25T20:35:00.000Z
  43-03: 2026-05-25T20:45:00.000Z
plan-completed:
  43-01: 2026-05-25T20:32:00.000Z
  43-02: 2026-05-25T20:43:00.000Z
expected-key-files:
  43-01:
    - commands/cp/workflow-run.md
  43-02:
    - commands/cp/workflow-list.md
  43-03:
    - commands/cp/workflow-resume.md
  43-04:
    - test/unit-installers.js
    - test/integration-workflow-skills.js
    - package.json
---

# Phase 43: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume

**Milestone**: v1.1 Workflow Skills
**Created**: 2026-05-25

## Goal

Ship the three consumer-side `cp-workflow-*` agent skills that let users start, list, and resume workflows from inside Copilot CLI / Claude Code — without leaving the agent session for the terminal. Skills are pure consumers of the v1.0 `cp run` / `cp workflow` CLI surface; zero changes to `bin/` or `lib/`. The three skills land in `commands/cp/` where both installers auto-pick them up.

## Success Criteria

<!-- Observable from the user's perspective. -->

1. After running `cplan install copilot` (or `cplan update`) in a fresh repo: `cp-workflow-run`, `cp-workflow-list`, and `cp-workflow-resume` all appear as installed skills, each with a SKILL.md whose frontmatter `name:` matches the file name.
2. `cp-workflow-list` invoked with no args lists the 3 built-in templates (`dev`, `debug`, `quick`) with their binding type; invoked with a name (e.g. `cp-workflow-list quick`) prints that template's YAML body.
3. `cp-workflow-run quick "smoke"` end-to-end (real LLM session): scaffolds the run, drives all 3 phases (discuss → execute → verify) through the resolved provider skill, writes one SUMMARY.md per phase, exits with `cp run status smoke --json` reporting `status: complete`.
4. `cp-workflow-resume` with no args lists active runs; with a slug, picks up the wave loop from the current STATE; with `--retry <phase-id>`, rolls back that phase and re-enters the loop; with `--abandon`, flips status to `abandoned`.
5. `test/unit-installers.js` has 6 new assertions (3 skills × 2 installers) passing; `test/integration-workflow-skills.js` exists with ≥15 assertions all passing; full `npm test` suite green; no regressions to v1.0's 50+ test files.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [x] 43-01: **`commands/cp/workflow-run.md`** — Author the generic workflow driver skill (~150–200 lines). Follow the `commands/cp/autonomous.md` body structure: numbered Step 1–6 sections covering argv parse → `cp workflow validate --strict` → `cp doctor` role resolution → `cp run <wf> <name>` → wave-loop (parse stdout, dispatch to role skill, generate summary, `cp run mark-complete`, repeat) → final report. Reuse cp-autonomous's smart-gate semantics verbatim (stop on test failure, audit HIGH, deviation sentinel; write `.planning/.continue-here.md`). Argv contract: `<workflow> [<name>] [--plan-only] [--scope=...] [--check]` parsed identically to `cp-autonomous` so the phase-45 shim becomes trivial. Frontmatter exactly as specified in DESIGN.md "Plan 43-01" section.

- [x] 43-02: **`commands/cp/workflow-list.md`** — Author the discoverability skill (~40–60 lines). Two modes: list (no arg → `cp workflow ls --json`, render as table with columns name | source | binds_to | description) and show (name arg → `cp workflow show <name>`, print YAML verbatim). Each mode ends with a "next action" suggestion pointing at `/cp-workflow-run` or `/cp-workflow-new`. Frontmatter exactly as specified in DESIGN.md "Plan 43-02" section. No role resolution needed (no LLM dispatch); pure CLI passthrough.

- [x] 43-03: **`commands/cp/workflow-resume.md`** — Author the resume/retry/abandon skill (~80–100 lines). Three modes selected by argv: enumeration (no slug → `cp run status --json` table of active runs), resume (slug → `cp run resume <slug>` then delegate to "follow the wave loop documented in cp-workflow-run from Step 5 onward"), retry (slug + `--retry <phase-id>` → `cp run retry <slug> <phase-id>` then same wave-loop delegation), abandon (slug + `--abandon` → `cp run abandon <slug> --yes`). Explicitly reference `cp-workflow-run`'s wave-loop section to avoid duplication. Frontmatter exactly as specified in DESIGN.md "Plan 43-03" section.

- [ ] 43-04: **Tests** — Add 6 new assertions to `test/unit-installers.js` (3 skill names × 2 installers; mirror the existing `cp-quick`/`cp-autonomous` assertion pattern in that file). Create new `test/integration-workflow-skills.js` (~15 assertions): scaffold a temp cp project; spawn `cp run quick "smoke-test"`; pipe synthetic summary text to `cp run mark-complete` for each of the 3 quick-template phases (discuss/execute/verify); assert STATE transitions and final `status: complete`; assert `cp run status --json` lists the run; do a second flow with `cp run abandon` and assert `status: abandoned`. Wire into `package.json` `"test"` script after `integration-run-cli.js`. The integration test exercises the CLI surface the skills depend on but does not spawn an LLM (out of scope for cp's test suite).

## Notes

- Phase architecture and per-plan contracts are fully specified in `.planning/phases/43-consumer-skills-cp-workflow-run-cp-workf/DESIGN.md`. Implementers should treat that DESIGN.md's "Components > Plan 43-NN" sub-sections as the per-plan spec.
- All 3 skill files are independent — no shared state, no shared imports (markdown only). Plans 43-01 / 43-02 / 43-03 can execute in parallel if the executor supports it; 43-04 depends on all three.
- Installer wiring is automatic (`install/common.js#listCommandFiles` iterates `commands/cp/*.md`). Do NOT add explicit registrations in `install/copilot.js` or `install/claude.js`; the only installer-related work is the unit-test assertion update in 43-04.
- `cp-workflow-list` and `cp-workflow-resume` (43-02, 43-03) intentionally do not duplicate the wave-loop logic. `cp-workflow-resume` references the wave-loop section of `cp-workflow-run` by name; if you find yourself copying wave-loop text, stop and add a cross-reference instead.
- The smart-gate stop semantics in 43-01 must match `cp-autonomous` exactly — same sentinels, same `.planning/.continue-here.md` format. Phase 45 will collapse cp-autonomous to a shim over `cp-workflow-run dev`, so any divergence now becomes a regression then.
- No `lib/` or `bin/` changes in this phase. If a skill needs a CLI capability that doesn't exist yet, stop and surface to the user rather than working around it — the v1.0 CLI is supposed to be sufficient.
- After 43-04 lands, do a manual smoke test in an actual Copilot CLI session before moving to phase 44 (`/cp-workflow-list` then `/cp-workflow-run quick "test"`). Capture findings in `REVIEW-LOG.md`.
