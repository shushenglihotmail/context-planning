# Known Concerns

As of v0.4.3. The hardening waves v0.3.2–v0.4.3 already fixed: atomic
multi-file writes, `gitCommit` scoping, writeBatch rollback, installer
collision protection, and `--key=value` argv parsing — none of those should
appear below.

## Critical

(none open as of v0.4.3)

## High

(none open as of v0.4.4 — both v0.4.3 HIGHs fixed in v0.4.4: aider YAML
parser + worktree shell-out extraction)

## Medium

- `bin/cp.js` is 1104 LOC across 21 `cmd*` handlers, each with hand-rolled
  argv parsing (`for (let i=0; i<args.length; i++)`). Real risk of subtle
  inconsistencies between handlers (e.g. one accepts `--force`, another
  `-f`, a third only `--force=true`). Fix: extract a tiny `parseFlags(args,
  spec)` helper into `lib/argv.js` and migrate handlers one at a time.
- `lib/lifecycle.js` is 808 LOC and bundles unrelated lifecycle ops
  (`tickPlan`, `writeSummary`, `completeMilestone`, atomic writes, git
  commits). The atomic-write + git layer is reusable infrastructure; the
  lifecycle verbs are domain logic. Fix: split into `lib/atomic.js` +
  `lib/git.js` + `lib/lifecycle.js` (verbs only).
- `install/aider.js:116` — when `existing === ''` (empty conf file),
  `existing + sep + '\n' + block` emits a leading `\n`. Cosmetic but the
  output of `cp install aider` on a fresh `.aider.conf.yml` always starts
  with a blank line. Fix: branch `if (!existing.length)` before the sep
  calculation.
- `install/cursor.js:44` — `description: ${JSON.stringify(description)}`
  wraps in JSON-style double quotes. YAML accepts this, but if the source
  command's frontmatter description contains a literal `\n` or `\t` (rare),
  the escape sequence is preserved through `JSON.stringify` and interpreted
  by YAML. Fix: prefer YAML single-quoted form, escaping only `'` → `''`.
- `lib/codebase-mapper.js:135` — the "looks-stub" heuristic flags any doc
  `<= 40 lines OR containing the placeholder marker`. Dense, well-written
  docs (e.g. this run's STACK/CONVENTIONS at 36/39 lines) are flagged as
  stubs even though they're substantive. Fix: relax to `<= 20 lines OR
  contains marker`, OR check for the literal HTML-comment placeholders
  rather than line count.

## Low

- No CI configured. `npm test` only runs locally on the developer's
  machine, so regressions can land via PR without external validation.
  Fix: add a minimal `.github/workflows/test.yml` running `npm test` on
  Node 18 + 20 across ubuntu/windows.
- No coverage tool. 737 assertions is healthy, but there's no measurement
  of which lib branches are exercised. Fix: optional — `c8 npm test` would
  add coverage reporting with zero source change.
- `bin/cp.js` has no `--help` per-subcommand. `cp tick --help` prints the
  global usage, not tick-specific help. Fix: each `cmd*` handler checks
  for `--help` early and prints its own usage block.

## Workarounds & gotchas

- **If you change `lib/lifecycle.js writeBatch` signature, also update**
  `lib/inbox.js`, `lib/worktree.js`, `lib/milestone.js`, every `cmd*` in
  `bin/cp.js` that calls `writeBatch`, and the rollback test in
  `test/unit-v034.js`.
- **If you add a new harness installer, the new handler is auto-picked**
  by `bin/cp.js cmdInstall` ONLY if the file is `install/<name>.js` AND
  exports `install({pluginRoot, repoRoot, force})`. The `usage()` text and
  the help error message in `cmdInstall` are still hand-maintained — keep
  them in sync.
- **If you bump the test count, update the README badge AND the
  `Tests: NNN` line in `CHANGELOG.md` for the release.** No script enforces
  this.
- **`.planning/` is gitignored in cp's own repo.** Running `cp init` inside
  this repo creates local state that is never committed; this is
  intentional (cp dogfoods cp without polluting source).
- **`process.exit(3)` from `cp install`** means "installer kept
  user-modified files; re-run with `--force` to overwrite". Tests that
  shell out must treat exit 3 distinctly from exit 1.

## Areas that look safe to touch

- `lib/inbox.js` (v0.4.0) — fully covered by `test/unit-inbox.js` (45
  assertions). Action-list shape; pure file IO; small surface.
- `lib/worktree.js` (v0.4.3) — fully covered by `test/unit-worktree.js`
  (56 assertions). Pure helpers; no shell-out lives here.
- `install/cursor.js` / `install/aider.js` (v0.4.2) — covered by
  `test/unit-installers.js` (50 assertions) including collision-protection,
  re-run idempotence, and `--force` semantics.
- The atomic-write + commit-scoping core in `lib/lifecycle.js` — backed by
  `test/unit-atomic.js`, `test/unit-gitcommit.js`, `test/unit-v034.js`.
  Battle-tested across the v0.3.x hardening wave.
