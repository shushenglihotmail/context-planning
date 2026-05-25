---
subsystem: cli
tags:
  - cli
  - workflow
  - brainstorm
  - tests
  - ai-authoring
requires:
  - lib/provider.js
  - lib/workflow.js
provides:
  - cp workflow brainstorm
  - test/dryrun-run-cli.js
  - test/dryrun-workflow-cli.js
  - test/integration-run-cli.js
affects:
  - bin/commands/workflow.js
  - bin/commands/_usage.js
  - package.json
tech-stack:
  - node
  - js-yaml
key-files:
  created:
    - test/dryrun-run-cli.js
    - test/dryrun-workflow-cli.js
    - test/integration-run-cli.js
  modified:
    - bin/commands/workflow.js
    - bin/commands/_usage.js
    - package.json
key-decisions:
  - brainstorm sub-command delegates to provider.resolveSkill('brainstorm') and emits a structured 'Designing a new workflow' starter context block; it does NOT write any file (matching cp run's instruction-emit pattern).
  - Manual-fallback path prints provider.resolvePrompt('brainstorm') followed by context block; provider-installed path prefixes with 'Designing a new workflow. Please invoke the {name} brainstorm skill ...'.
  - Three new dryrun/integration test files exceed the assertion targets (31/53/20 vs ~20/25/10) for stronger coverage at zero extra runtime cost.
  - cp run resume on a completed run returns the last wave's instruction (exit 0) rather than erroring — documented in integration test.
patterns-established:
  - "CLI commands that delegate to AI skills emit instructions rather than executing inline (same model as cp run): stdout = the instruction/context, stderr = operational hints."
  - End-to-end CLI integration tests spawn bin/cp.js via spawnSync for full stdout/stderr/exit-code coverage (vs lib-only tests in integration-runtime.js).
requirements-completed:
  - v1.0/CLI/workflow-brainstorm
  - v1.0/tests/dryrun-run-cli
  - v1.0/tests/dryrun-workflow-cli
  - v1.0/tests/integration-run-cli
phase: 41
plan: 41-03
completed: 2026-05-25
end-commit: b283fb91ce4155f6b596c6e98d21f021110aab5a
---
# 41-03 — cp workflow brainstorm + CLI test suite

## What shipped

### `cp workflow brainstorm` sub-command
The AI-authoring entry point promised by the milestone vision. Resolves the configured workflow provider via `lib/provider.js#resolveSkill('brainstorm')` and emits a structured starter context block:

- **Provider installed** (e.g., superpowers detected): stdout begins with `Designing a new workflow. Please invoke the {provider} brainstorm skill with this context:` followed by a context block (target workflow name, output path, expected YAML structure). Stderr emits `skill: ... provider: ... out: ...`.
- **Manual fallback** (no provider detected): stdout prints `manual.prompts.brainstorm` text + the same context block. Stderr emits `next: write your YAML to <out>, then run "cp workflow validate <name>"`.

The command does NOT write any file — the harness or user materialises the YAML (same model as `cp run`).

Args: `--workflow <name>` (default `new-workflow`), `--out <path>` (default `.planning/workflows/<name>.yaml`).
Exit codes: 0 ok, 2 usage (e.g., `--out` pointing at a non-existent parent dir).

### CLI test suite (3 new files, 104 new assertions)
| File | Assertions | What it covers |
|---|---|---|
| `test/dryrun-run-cli.js` | 31 | All 6 `cp run` sub-commands: USAGE, template-not-found, duplicate-run guard, status table + `--json`, resume happy + error, mark-complete with stdin, abandon |
| `test/dryrun-workflow-cli.js` | 53 | All 8 `cp workflow` sub-commands including new brainstorm: ls/--json, show happy + error, validate happy + cycle + dangling-dep, diagram for chain + parallel, init idempotency, new conflict + --force, import valid + cycle-rejection, brainstorm manual fallback + parent-dir guard |
| `test/integration-run-cli.js` | 20 | End-to-end happy path: `cp run quick` → loop through `mark-complete` for all 3 phases → status `done` |

All three wired into `package.json` test chain, slotted near `unit-workflow.js` / `unit-custom.js` / `integration-runtime.js`.

## Discipline
- Brainstorm output respects the same stdout/stderr discipline as `cp run`: actionable instruction → stdout, operational metadata → stderr.

## Tests
- Each new file passes standalone (31 / 53 / 20).
- Full `npm test` now runs **34 test files**, all green, 0 failures.

## Deviations
- Assertion counts exceed targets (31/53/20 vs ~20/25/10) — wider coverage at zero runtime cost.
- `cp run resume` on a completed run returns the last wave's instruction with exit 0 (vs an error). Behaviour documented in integration test rather than changed in lib.

## Milestone impact
Plan 41-03 closes Phase 41 and the v1.0 Workflow Engine CLI surface: end-users can now `cp run`, `cp workflow ls/show/validate/diagram/init/new/import/brainstorm` against built-in or custom templates with full test coverage. Next milestone work is Phase 42 (docs + v1.0.0 release).
