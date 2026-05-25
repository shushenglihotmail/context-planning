---
phase: "41"
name: CLI surface + built-in templates + AI authoring
milestone: v1.0 Workflow Engine
status: in-progress
plan-status:
  41-01: in-progress
  41-02: pending
  41-03: pending
plan-started:
  41-01: 2026-05-25T19:00:00.000Z
created: 2026-05-25
base-commit: 3086c54225a83d5c35491c5a22272526a691fef6
expected-key-files:
  41-01:
    - bin/commands/run.js
    - bin/commands/index.js
  41-02:
    - bin/commands/workflow.js
    - bin/commands/index.js
    - templates/workflows/dev.yaml
    - templates/workflows/debug.yaml
    - templates/workflows/quick.yaml
  41-03:
    - bin/commands/workflow.js
    - test/dryrun-run-cli.js
    - test/dryrun-workflow-cli.js
    - test/integration-run-cli.js
    - package.json
---

# Phase 41: CLI surface + built-in templates + AI authoring

**Milestone**: v1.0 Workflow Engine
**Created**: 2026-05-25

## Goal

Ship the user-facing v1.0 surface: add two new `cp` sub-command families (`cp run` and `cp workflow`) as thin wrappers over Phase 40's lib modules; ship three reference templates (`dev`, `debug`, `quick`) in `templates/workflows/`; and add `cp workflow brainstorm` for provider-delegated AI authoring of new workflows. Lib code stays untouched — the CLI MUST NOT duplicate validation, state mutation, or instruction formatting.

## Success Criteria

1. `cp run quick "fix typo"` in a fresh cp-initialized project: scaffolds a custom-tier run from the shipped built-in template, prints `slug` to stderr and the first wave's instruction to stdout, exit 0.
2. `cp workflow ls` lists at least 3 built-in templates (`dev`, `debug`, `quick`); `cp workflow show <name>` round-trips each cleanly; `cp workflow validate <name>` exits 0 for every built-in template and 2 with clear errors for malformed input.
3. `cp run resume <slug>`, `cp run retry <slug> <phase>`, `cp run abandon <slug>`, `cp run mark-complete <slug> <phase>` all work end-to-end; `cp run status` lists all active runs across all 3 binding tiers.
4. `cp workflow brainstorm --workflow <name>` resolves the provider's brainstorm skill and emits structured context for the harness to invoke (matches `cp`'s emit-and-trust pattern; no LLM SDK loaded inside cp).
5. ≥3 new test files added (`dryrun-run-cli.js`, `dryrun-workflow-cli.js`, `integration-run-cli.js`); ≥55 net new assertions; full `npm test` suite green on Ubuntu + Windows; no regressions to Phase 40's 200+ assertions.

## Plans

- [ ] **41-01: `cp run` CLI family** — Add `runCmd()` dispatcher to `bin/cp.js` covering: `run <workflow> [name] [--plan-only]`, `resume <slug>`, `retry <slug> <phase-id>`, `abandon <slug> [--yes]`, `mark-complete <slug> <phase-id>` (reads summary from stdin), `status [slug] [--json]`. Each sub-handler is a thin wrapper that calls one `lib/runtime.js` function, maps lib errors to exit codes (2/3/4/5/6 per the error-handling table in DESIGN.md), and prints instructions to stdout / human logging to stderr. NO lib changes. Per-command `--help` text centralized in a help map at top of the dispatcher.

- [ ] **41-02: `cp workflow` static family + built-in templates** — Add `workflowCmd()` dispatcher to `bin/cp.js` covering: `ls [--json]`, `show <name>`, `validate <name-or-path> [--strict]`, `diagram <name-or-path>` (Mermaid output), `init` (creates `.planning/workflows/`), `new <name> [--from <built-in>]`, `import <path> [--name <override>] [--force]`. Create `templates/workflows/` directory and ship three reference templates: `dev.yaml` (5-phase milestone-bound, with parallel research wave), `debug.yaml` (5-phase custom-bound investigation cycle), `quick.yaml` (3-phase custom-bound minimal). Each built-in MUST include `principles:` (≥2 entries) and `defaults:` to demonstrate the new schema features. Each MUST `workflow.validate()` ok=true.

- [ ] **41-03: `cp workflow brainstorm` + tests + per-command help** — Add `brainstorm` sub-handler to `workflowCmd()`: resolves provider's brainstorm skill via `lib/provider.js`, emits a structured context block to stdout and a "now invoke skill X" instruction to stderr, exits 0 (no in-process LLM interaction; harness owns the rest). Create three test files: `test/dryrun-workflow-cli.js` (~25 assertions, all `cp workflow` sub-commands exercised in temp projects via `spawnSync`), `test/dryrun-run-cli.js` (~20 assertions, all `cp run` sub-commands), `test/integration-run-cli.js` (~10 assertions, end-to-end happy path through `quick.yaml` to completion). Wire all three into `package.json` test chain. Finalize per-command `--help` text for both dispatcher families.

## Notes

- Phase architecture is fully specified in `.planning/phases/41-cli-surface-built-in-templates-ai-author/DESIGN.md`. Implementers should treat that DESIGN.md's "Components > Plan 4N-NM" sub-sections as the per-plan contract.
- All three plans modify `bin/cp.js`. Execute SERIALLY (no parallel dispatch across them) to avoid merge conflicts in that single file. Within each plan, work is straightforward (one dispatcher + N sub-handlers).
- Stdout/stderr discipline (per DESIGN.md): stdout = instructions or `--json` payloads; stderr = human-facing logging, slug echoes, confirmation prompts. Tests assert this split.
- Built-in template content (41-02): `dev.yaml` should reference cp's existing skills/roles where natural so the dev workflow is the canonical "run the existing cp dev cycle as a workflow" demonstration.
- `cp run mark-complete` reads summary from stdin. On Windows, the `dryrun-write-summary.js` test pattern shows the cross-platform way to pipe stdin into `spawnSync`.
- Open questions in DESIGN.md (mermaid-only diagrams, no auto-detect of phase-id, templates location) should be resolved during execution and recorded in `REVIEW-LOG.md`.
- No lib changes in this phase. If a CLI need surfaces a lib gap, escalate by updating `lib/runtime.js` (or sibling) and the milestone DESIGN.md FIRST, then continue.
