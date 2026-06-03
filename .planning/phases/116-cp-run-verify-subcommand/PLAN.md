---
phase_id: 116
title: cp-run-verify-subcommand
milestone: v1-10-skill-routing-verify-gate
status: in-progress
created: 2026-06-02
base_commit: 4626d55a26c434a930f38900bc8a361baeb07625
expected_files:
  - lib/verify.js
  - bin/commands/run-verify.js
  - bin/commands/index.js
  - bin/commands/_usage.js
  - test/unit-verify.js
  - test/dryrun-run-verify.js
---

# PLAN — Phase 116: cp run-verify subcommand + lib/verify.js

## Goal

Ship `cp run-verify <slug>` — a non-LLM scaffold subcommand the milestone
workflow can call to actually run the project's test command and propagate
its exit code. This is the bottom half of the v1.10 verify gate: phase 117
inserts a `verify` phase in `templates/workflows/milestone.yaml` that calls
this subcommand.

The subcommand:

1. Resolves `behavior.test_command` from `.planning/config.json` (top-priority).
2. If absent, auto-detects via priority chain: `npm test` (if `package.json`
   with a `test` script) → `pytest` (if `pytest.ini` / `pyproject.toml` /
   `setup.cfg` declares pytest) → `cargo test` (if `Cargo.toml`) →
   `go test ./...` (if `go.mod`). First hit wins.
3. If still nothing detected: emit `cp: run-verify: no test command detected;
   set behavior.test_command or pass --command "<cmd>"` and **exit 0**
   (warn-only opt-out per DESIGN error-handling table).
4. Otherwise spawn the command synchronously, stream stdout/stderr verbatim
   to the user, and propagate the exit code 1:1.

Flags:

- `--command "<cmd>"` — explicit override; skips detection.
- `--skip` — explicit no-op (exit 0); used by `--skip-verify` upstream.
- `--json` — emit machine-readable result instead of streaming.
- `--cwd <path>` — override project dir for tests.

## Scope

In-scope:
- New `lib/verify.js` (pure functions, no CLI imports).
- New `bin/commands/run-verify.js` (CLI glue; mirrors `run-finalize.js` shape).
- Register in `bin/commands/index.js`.
- Add a one-line entry to `bin/commands/_usage.js`.
- Two test files: `test/unit-verify.js` (auto-detect + opt-out + override
  logic, all sync/pure), `test/dryrun-run-verify.js` (CLI flag parsing +
  exit-code propagation via spawn).
- Wire both into `package.json#scripts.test`.

Out-of-scope (phase 117):
- Insert `verify` phase into `templates/workflows/milestone.yaml`.
- `depends_on: [verify]` on the review phase.
- Integration test for full milestone DAG with verify gate.

Out-of-scope (deferred to v1.11):
- Per-language verbose test arg autoresolution (jest --silent etc).
- Parallel multi-suite verify (npm test + pytest in same project).

## Tasks

### Task 1 — `lib/verify.js`

Pure module exporting:

```
detectTestCommand(projectDir) → string | null
loadConfiguredCommand(projectDir) → string | null
resolveCommand(projectDir, opts) → { command, source }
   // source ∈ {"override","config","auto-detect","none"}
runVerify(slug, opts) → { ok, exitCode, source, command, ... }
```

`runVerify` uses `child_process.spawnSync` (Windows-safe via `shell: true`).
Inherits stdio by default; switches to `pipe` when `opts.captureOutput` is
set (test mode).

### Task 2 — `bin/commands/run-verify.js`

CLI entry mirroring `run-finalize.js`:
- Parse positional `<slug>` + `--command`, `--skip`, `--json`, `--cwd` flags.
- Delegate to `verify.runVerify`.
- `--json` → print JSON, exit with `r.exitCode || 0`.
- Default → already streamed verbatim, just `process.exit(r.exitCode)`.

### Task 3 — register

- Add `'run-verify': require('./run-verify'),` to `bin/commands/index.js`.
- Add the one-line entry to `bin/commands/_usage.js` under the run-* group.

### Task 4 — tests

`test/unit-verify.js` (sync, pure):
- `detectTestCommand`: each of npm/pytest/cargo/go fixtures in tmpdir; first-hit priority; none → null.
- `loadConfiguredCommand`: reads `.planning/config.json#cp.behavior.test_command`.
- `resolveCommand` priority: override > config > auto-detect > none.
- `runVerify --skip` → `{ ok: true, exitCode: 0, source: 'skip' }`.
- `runVerify` with `--command "node -e \"process.exit(0)\""` (smoke).
- `runVerify` with failing command → `exitCode: 1`.

`test/dryrun-run-verify.js`:
- Spawn `node bin/cp.js run-verify <slug> --command "node -e 'process.exit(0)'"` in tmpdir → exits 0.
- Same with `process.exit(7)` → exits 7.
- `--json` emits parseable JSON with `command`, `exitCode`, `source`.

### Task 5 — wire into `package.json#scripts.test`.

## Verification

```
node test/unit-verify.js
node test/dryrun-run-verify.js
node test/integration-runtime.js     # regression
```

All four must pass before mark-complete.

## Non-goals (explicit)

- Do NOT modify `templates/workflows/milestone.yaml` (phase 117).
- Do NOT add `behavior.test_command` defaults to config refresh (phase 117).
- Do NOT touch `lib/runtime.js` or `lib/provider.js`.

## Attestation contract

Will end SUMMARY with `invoked_skill: (inline-fallback)` — writing-plans
skill not routed for this kind of scaffold work.
