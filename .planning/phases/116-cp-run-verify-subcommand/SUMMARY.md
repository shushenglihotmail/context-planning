---
phase_id: 116
title: cp-run-verify-subcommand
status: complete
milestone: v1-10-skill-routing-verify-gate
invoked_skill: (inline-fallback)
---

# SUMMARY — Phase 116: cp run-verify subcommand + lib/verify.js

## What shipped

**`lib/verify.js`** (new, ~180 LOC, zero deps beyond stdlib) — non-LLM
verify gate library exporting:

- `detectTestCommand(projectDir) → string | null` — priority chain
  `npm test` (package.json#scripts.test) → `pytest` (pytest.ini /
  pyproject.toml [tool.pytest] / setup.cfg [tool:pytest]) → `cargo test`
  (Cargo.toml) → `go test ./...` (go.mod) → null.
- `loadConfiguredCommand(projectDir) → string | null` — reads
  `.planning/config.json:cp.behavior.test_command`.
- `resolveCommand(projectDir, {override}) → {command, source}` where
  source ∈ {override, config, auto-detect, none}. Override > config >
  auto-detect.
- `runVerify(slug, opts) → {ok, exitCode, source, command, slug, ...}` —
  `--skip` short-circuits to exit 0, no-command warns then exits 0
  (warn-only opt-out per DESIGN), otherwise `spawnSync(cmd, {shell:true,
  stdio:'inherit'})` propagating exit code 1:1.

**`bin/commands/run-verify.js`** (new) — CLI entry mirroring `run-finalize.js`:

```
cp run-verify <slug> [--command "<cmd>"] [--skip] [--cwd <path>] [--json]
```

Default mode streams tests to user stdio + emits one ✓/✗ summary line.
`--json` emits the full result object for machine consumption. Exit code
propagated 1:1.

**Registry / usage**:
- `bin/commands/index.js` — registered `'run-verify'`.
- `bin/commands/_usage.js` — one-line entry under the `cp run` group.

**Tests**:
- `test/unit-verify.js` — **21 / 21 pass**. Covers all four detector
  branches, pyproject/setup.cfg variants, package.json edge cases
  (empty scripts.test, missing scripts), config-source priority,
  runVerify skip/success/failure/no-command paths.
- `test/dryrun-run-verify.js` — **6 / 6 pass**. Spawns real `node bin/cp.js
  run-verify ...`: --skip path, --command success, exit-code propagation
  (process.exit(7) → exit 7), --json shape, missing-slug usage (exit 2),
  no-command warn-to-stderr path.
- Both wired into `package.json#scripts.test`.

Total new coverage: **27 assertions**.

## Verification (manual smoke)

```
$ node bin/cp.js run-verify smoke --command "node -e 'process.exit(0)'"
✓ cp run-verify: tests passed via override (node -e 'process.exit(0)')

$ node bin/cp.js run-verify smoke --command "node -e 'process.exit(3)'"
✗ cp run-verify: tests FAILED via override (...) — exit 3
$ echo $LASTEXITCODE
3
```

## Scope adherence

Strictly limited to what the PLAN promised. Did NOT modify:
- `templates/workflows/milestone.yaml` (phase 117 will insert verify phase)
- `lib/runtime.js`, `lib/provider.js` (no v1.10 chain regressions possible)
- config refresh (no new defaults; user opts in explicitly)

## Files touched

- `lib/verify.js` (new)
- `bin/commands/run-verify.js` (new)
- `bin/commands/index.js` (+1 line registration)
- `bin/commands/_usage.js` (+5 lines)
- `test/unit-verify.js` (new)
- `test/dryrun-run-verify.js` (new)
- `package.json` (+2 test entries)

## Next: phase 117 — insert verify phase into milestone.yaml with
`depends_on: [verify]` on review.
