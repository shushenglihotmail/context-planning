---
phase: "44"
name: Creator skills: cp-workflow-new, cp-workflow-customize (+ cp workflow export)
milestone: v1.1 Workflow Skills
status: in-progress
created: 2026-05-25
base-commit: a7d80bd
plan-status:
  44-01: in-progress
  44-02: pending
  44-03: pending
  44-04: pending
plan-started:
  44-01: 2026-05-25T21:20:00.000Z
expected-key-files:
  44-01:
    - bin/commands/workflow.js
    - lib/workflows.js
    - test/unit-workflow.js
    - test/dryrun-workflow-cli.js
  44-02:
    - commands/cp/workflow-new.md
  44-03:
    - commands/cp/workflow-customize.md
  44-04:
    - test/unit-v034.js
    - test/integration-workflow-skills.js
---

# Phase 44: Creator skills: cp-workflow-new, cp-workflow-customize (+ cp workflow export)

**Milestone**: v1.1 Workflow Skills
**Created**: 2026-05-25

## Goal

Close the workflow-customization round-trip by (a) adding the missing `cp workflow export` CLI command that pairs with the existing `cp workflow import`, and (b) shipping two creator-side agent skills (`cp-workflow-new` for blank scaffolding, `cp-workflow-customize` for the export → edit → import round-trip) so users can customize built-in workflows from inside the agent CLI without ever leaving for the terminal.

## Success Criteria

<!-- Observable from the user's perspective. -->

1. `cp workflow export dev` writes `./dev.yaml` containing clean YAML (no `# template: ...` source comment header) that round-trips through `cp workflow import dev.yaml --force` without modification.
2. `cp workflow export dev --as my-dev --out my-dev.yaml` writes a file whose `workflow:` key reads `my-dev`, and `cp workflow import my-dev.yaml` succeeds with `name: my-dev` listed in `cp workflow ls`.
3. After running `cplan update` in a fresh repo: `cp-workflow-new` and `cp-workflow-customize` both appear as installed skills with frontmatter `name:` matching file names.
4. `cp-workflow-customize` invoked in a live agent session walks the user through picking a built-in, calling `cp workflow export <pick> --as <newname>`, opening the file for edit, then calling `cp workflow import <file>` — ending with the new template visible in `cp workflow ls`.
5. `cp-workflow-new` invoked walks the user through `cp workflow new <newname> [--from <built-in>]` then opens the scaffolded file for editing (vs. `cp-workflow-customize` which starts from a built-in's actual content).
6. `test/unit-v034.js` has 4 new installer-pickup assertions (2 skills × 2 installers); `test/integration-workflow-skills.js` has new assertions covering the export CLI (round-trip, `--as` rename, `--out` placement) and ≥3 assertions for the full export → import round-trip via real CLI; `npm test` stays green.

## Plans

<!-- Each plan is a 1-3 hour atomic unit. Toggle with `cp tick {NN-MM}`. -->

- [ ] 44-01: **`cp workflow export <name> [--out <path>] [--as <new-name>] [--force]` CLI command** — Add a new subcommand to `bin/commands/workflow.js` that wraps `lib/workflows.js#readTemplate` (or analogous). Strip the `# template: <name> (source: ...)` comment header that `show` emits, optionally rewrite the top-level `workflow:` YAML key to `<new-name>` when `--as` is passed, write to `--out <path>` (default: `./<name>.yaml` or `./<new-name>.yaml` when `--as` given), refuse to overwrite without `--force`. Validate the result via the same path `cp workflow import` uses so we don't export a broken file. Update `cp workflow --help` and the existing dryrun-workflow-cli.js / unit-workflow.js with coverage. Frontmatter exactly as specified in DESIGN.md "Plan 44-01" section.

- [ ] 44-02: **`commands/cp/workflow-new.md`** — Author the blank-template creator skill (~60–80 lines). Driven by argv `<new-name> [--from <built-in>]`: validate name against existing templates (refuse collision unless `--force`), call `cp workflow new <new-name> [--from <built-in>] [--force]`, print path of the scaffolded `.planning/workflows/<new-name>.yaml`, prompt user to edit, then on confirmation call `cp workflow validate <new-name> --strict` and report. No LLM dispatch — pure CLI passthrough + UX. Frontmatter exactly as specified in DESIGN.md "Plan 44-02" section.

- [ ] 44-03: **`commands/cp/workflow-customize.md`** — Author the round-trip customize skill (~100–120 lines). Driven by argv `<built-in> [<new-name>] [--out <path>] [--force]`: when no built-in given, call `cp workflow ls --json` and prompt; when no new-name given, prompt; call `cp workflow export <built-in> --as <new-name> [--out <path>] [--force]`; print the destination path with an edit hint; on user confirmation that edits are done, call `cp workflow validate <new-name> --strict`; on validation success, call `cp workflow import <out-path>` to register it. Report final state with `cp workflow ls`. This replaces the previously-planned `cp-workflow-import` skill (cleaner UX: customize is the actual user task; import is an implementation detail). Frontmatter exactly as specified in DESIGN.md "Plan 44-03" section.

- [ ] 44-04: **Tests** — Add 4 new assertions to `test/unit-v034.js` (2 skill names × 2 installers; mirror the existing `cp-workflow-*` assertion section added in plan 43-04). Append to `test/integration-workflow-skills.js` a new section: spawn `cp workflow export dev` → assert file exists at `./dev.yaml`, no `# template:` header, round-trips through `cp workflow import dev.yaml --force` cleanly; spawn `cp workflow export dev --as my-dev --out tmp.yaml` → assert file has `workflow: my-dev` and import-then-`workflow ls` lists `my-dev`. ≥8 assertions total in this plan.

## Notes

- Phase architecture and per-plan contracts are fully specified in `.planning/phases/44-creator-skills-cp-workflow-new-cp-workfc/DESIGN.md`. Implementers should treat that DESIGN.md's "Components > Plan 44-NN" sub-sections as the per-plan spec.
- The `cp workflow export` CLI (44-01) is the **only** plan in this phase that touches `bin/` or `lib/`. Plans 44-02 / 44-03 are pure markdown additions. 44-04 is test-only.
- 44-01 must land first — 44-03's skill body references `cp workflow export` semantics in its Step instructions, and 44-04's integration assertions require the export command to exist.
- 44-02 and 44-03 are independent of each other and can be authored in either order (or parallel) once 44-01 is in.
- Skill naming decision: chose `cp-workflow-customize` over `cp-workflow-import` because the user-facing task is "customize a built-in", with import being one mechanical step inside that. A pure `cp-workflow-import` skill would have been a thin wrapper around the existing CLI with no LLM value-add. This was an explicit user decision (2026-05-25, mid-phase-43 conversation).
- Installer wiring is automatic (`install/common.js#listCommandFiles` iterates `commands/cp/*.md`). No installer code changes required.
- After 44-04 lands, do a manual smoke test in an actual Copilot CLI session: `/cp-workflow-customize dev` end-to-end. Capture in `REVIEW-LOG.md`.
