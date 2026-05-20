# Testing

Canonical rules for `cp` tests as of v0.4.3.

## Test framework & runner
- Use plain Node scripts only: no Jest, Mocha, Vitest, or other test runner.
- Each test file tracks `passed` and `failed` counters and ends with `process.exit(1)` if any assertion fails.
- `npm test` is the only all-suite command; individual files run with `node test/<file>.js`.

## Test file layout
- Keep all tests in `test/` with no subdirectories.
- Use these names:
  - `unit-<topic>.js` for library/unit coverage.
  - `dryrun-<topic>.js` for CLI dry-run coverage.
  - `roundtrip-<scenario>.js` for end-to-end flows.

## Test naming & structure
- Prefer a flat script structure over framework-style `describe`/`it` blocks.
- Use small helpers such as `section(...)`, `ok(...)`, and `mktmp(...)`.
- Canonical shape:

```js
let passed=0, failed=0; const tracked=[];
function section(t) { console.log(`\n=== ${t} ===`); }
function ok(label, cond, extra) { if (cond) {passed++; console.log(`  ✓ ${label}`);} else {failed++; ...} }
function mktmp(prefix) { const d = fs.mkdtempSync(...); tracked.push(d); return d; }
// ... test code ...
for (const d of tracked) { try { fs.rmSync(d, {recursive:true, force:true}); } catch {} }
console.log(`\nPassed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
```

## Fixtures & mocks
- Tests that need a project must bootstrap a fresh git repo plus `cp init` in a `mkdtempSync` temp dir.
- Use a helper like `bootProject(prefix)` and always track temp dirs for cleanup.
- Clean up with `fs.rmSync(dir, {recursive: true, force: true})` in a final `for (const d of tracked)` loop.
- For CLI e2e, use `spawnSync(process.execPath, [CLI, ...args], {cwd, encoding: 'utf8'})` and assert on `.status`, `.stdout`, and `.stderr`.
- Pass explicit `Date` values for time-dependent code; do not rely on wall-clock time.

## What is covered vs not
- Coverage is currently 737 assertions across 14 suites as of v0.4.3.
- The suite set is intentionally hand-authored; there is no coverage tool (`istanbul`, `nyc`) in use.
- The current `npm test` chain is the source of truth for suite order and scope.

## How to run
```bash
# all tests
npm test

# single file
node test/<file>.js
```

`npm test` runs these suites in order:
`roundtrip-gsd.js`, `dryrun-progress.js`, `dryrun-complete-milestone.js`, `dryrun-gsd-import.js`, `dryrun-resume.js`, `unit-libs.js`, `unit-lifecycle.js`, `unit-codebase.js`, `unit-atomic.js`, `unit-gitcommit.js`, `unit-v034.js`, `unit-inbox.js`, `unit-statusline.js`, `unit-installers.js`, `unit-worktree.js`.