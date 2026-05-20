# Changelog

All notable changes to **context-planning (`cp`)** are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet — open an issue if you want something prioritised.

## [0.4.0] — 2026-05-20

Adds **`/cp-capture`** + the `cp capture` / `cp inbox` CLI surface — a
lightweight inbox-triage workflow for the half-formed ideas that always show
up mid-session and never make it into a phase. Pure state-layer addition;
no provider involvement required for capture/list/tick, harness-driven
routing for the triage step.

### Added — inbox capture & triage

- **`cp capture "<text>"`** — appends a free-form line to
  `.planning/INBOX.md` under the `## Open` section with an ISO-minute
  timestamp. Auto-commits unless `--no-commit`, scoped to just `INBOX.md`
  via `pathsFromActions` (won't sweep unrelated dirty files — v0.3.3
  invariant preserved).
- **`cp inbox [--json] [--all] [--tick <N> [--note <dest>]] [--no-commit]`** —
  shows the current inbox (`Open` only by default; `--all` adds `Triaged`;
  `--json` for harness consumption). `--tick <N>` moves open item N to
  Triaged with an optional `--note` destination tag (e.g. `quick:rename`,
  `phase:02-mvp`, `seed:routing-redesign`, `discard`). cp does NOT enforce
  a closed vocabulary — the slash command picks whatever's useful.
- **`/cp-capture`** slash command — harness-agnostic triage walker. Reads
  `cp inbox --json`, proposes a destination class per item (always confirmed
  with the user), performs the routing edit (quick task via the workflow
  provider, append to a phase PLAN.md, append to STATE.md, or discard), then
  marks the item triaged via `cp inbox --tick`.
- **`lib/inbox.js`** — pure file-IO module: `parseInbox`, `renderInbox`,
  `appendItem`, `markTriaged`, `listInbox`, `isoMinute`, `inboxPath`,
  `INBOX_FILENAME`. Returns the same `{actions, ...}` shape as
  `lib/lifecycle.js` so the CLI handlers route writes through
  `writeBatch` for free (atomic + transactional, per v0.3.2).
- **`templates/INBOX.md`** — bootstrap template with header + `## Open` /
  `## Triaged` sections and HTML-comment placeholders.

### Added — coverage

- **`test/unit-inbox.js`** — 45 new assertions covering parse/render
  round-trip, parser noise tolerance, `appendItem` happy path + dedup +
  empty-string error, `markTriaged` happy path + invalid-idx error +
  re-indexing, `listInbox` missing-file behaviour, null destination
  round-trip, plus an end-to-end CLI loop (`cp capture` → `cp inbox --json`
  → `cp inbox --tick --note` → `cp inbox --all`) including the v0.3.3
  commit-scoping invariant (dirty siblings stay out of the inbox commit).
- Test totals: **603 assertions** across 11 suites, all green.

### Notes

- `INBOX.md` lives at `.planning/INBOX.md`. It is committed (state-layer
  artifact) but considered ephemeral — `/cp-capture` rotates items out
  to phase PLANs / STATE.md / quick dirs as fast as practical.
- The slash command does NOT auto-create phases or milestones from inbox
  items — it surfaces them as `phase-seed:` / `milestone-seed:` tags and
  lets `/cp-new-milestone` or `/cp-plan-phase` pick them up later.

## [0.3.4] — 2026-05-20

Closes all three Mediums + the Low from the v0.3.3 dogfood `/cp-map-codebase`
re-run. No new public API; all three fixes harden existing surfaces.

### Fixed — `writeBatch` is now rollback-safe (CONCERNS Medium)

- `lib/lifecycle.js writeBatch()` previously had a destructive-last guarantee
  but no rollback for the rename phase itself. If `fs.renameSync` failed on
  the Nth file after the first N-1 had already landed, on-disk state was
  left half-replaced. Now:
  - Before renaming, snapshot each destination's pre-batch contents (regular
    files only; non-files snapshot as `unsnapshottable` and the rename will
    fail on them anyway).
  - If any rename throws, walk the completed renames in reverse and restore
    the snapshots via the temp+rename pattern (so readers never see a
    half-written rollback either).
  - For dests that did NOT exist before the batch, rollback unlinks them.
  - Any unrenamed temps are unlinked to avoid `.cp-tmp-*` orphans.
  - The thrown error wraps the original rename error and reports how many
    rollbacks succeeded / failed (`error.cause`, `error.rollbackErrors`).
- The delete phase is still not rolled back — by design. If a delete fails
  after all writes succeeded, the new content is already on disk and the
  leftover file is logged in the error.

### Fixed — Installer collision protection (CONCERNS Medium)

- `cp install <copilot|claude>` used to silently overwrite every command /
  skill file on every re-run, including any local user customizations. Now:
  - **New `install/common.js writeFileSafe(dest, content, { force })`** —
    returns `{ status: 'written' | 'identical' | 'user-modified' }`. Skips
    writes when on-disk content already matches the source bytes (cheap
    idempotent re-installs), and refuses to overwrite differing content
    unless `force: true`.
  - Both `install/copilot.js` and `install/claude.js` use the new helper for
    every per-command write, print `+` / `=` / `!` markers per file, and end
    with a summary plus a warning listing locally-modified files that were
    NOT overwritten.
  - `cp install <harness> --force` opts into clobbering local edits.
  - When the install kept user-modified files (and `--force` wasn't passed),
    `cp install` now exits with code 3 so CI / shell scripts can detect it.
- The Claude `CLAUDE.md` cp block is still always rewritten — that path only
  touches text between `<!-- context-planning -->` markers, never user
  content elsewhere in the file.

### Fixed — `--key=value` argv form now works (CONCERNS Low)

- The hand-rolled per-subcommand argv loops only supported `--key value`
  (two-token form). `--key=value` silently became a bare unknown flag.
- **New `normalizeArgv(argv)`** in `bin/cp.js` runs as a pre-processor in
  `main()` and splits any `--key=value` token into `['--key', 'value']`
  before subcommand parsers see it. Empty `--key=` becomes `['--key', '']`.
  Bare flags, positional args, and `=` inside positional args are left
  untouched.
- `bin/cp.js` is now safe to `require()` from tests too — top-level
  `main(process.argv)` is gated behind `if (require.main === module)`.

### Added — coverage

- **`test/unit-v034.js`** — 39 new assertions covering: writeBatch happy
  path, writeBatch rollback when rename phase fails (with on-disk state
  fully restored, zero `.cp-tmp-*` orphans), writeBatch rollback for a
  not-previously-existing destination, `writeFileSafe` collision detection,
  end-to-end `cp install copilot` and `cp install claude` re-run idempotency
  and `--force` behaviour, `normalizeArgv` exhaustive cases, and a real-CLI
  end-to-end test of `cp scaffold-phase 1 --name=MVP --plans=2`.
- Test totals: **558 assertions** across 10 suites, all green.

### Changed

- `cp install <harness>` exit codes:
  - `0` — clean install (everything written or unchanged).
  - `2` — usage error (missing harness arg, unknown harness).
  - `3` — install kept user-modified files (re-run with `--force` to overwrite).

## [0.3.3] — 2026-05-19

Hotfix release that closes both **High** findings the live `/cp-map-codebase`
dry-fire against cp itself surfaced (the same dogfood run that produced the
v0.3.2 Critical). Same-day follow-up — no API churn beyond the deliberate
`gitCommit` signature widening.

### Fixed — `gitCommit` no longer sweeps the working tree (CONCERNS High)

- `lib/lifecycle.js gitCommit(root, message)` used `git add -A`, which would
  pull every dirty file in the working tree into a `cp:`-prefixed commit.
  Hit live during v0.3.2 work: `cp scaffold-codebase` swept in unrelated
  `README` / `CHANGELOG` / `bin/cp.js` edits under a misleading
  "scaffold-codebase" commit, requiring a soft-reset and re-commit.
- **New signature:** `gitCommit(root, message, options = {})` where
  `options.paths` is an explicit array of paths to stage. When omitted, the
  default is now `git add -- .planning/` (state-layer only) — NOT `add -A`.
  Set `options.planningOnly: false` to opt back into the legacy wide stage.
- **New helper `lib/lifecycle.pathsFromActions(actions)`** — extracts the
  unique path list from any lifecycle op's `actions[]` so callers can scope
  their commit to exactly what they touched.
- All 6 auto-commit call sites in `bin/cp.js` (`cmdTick`, `cmdWriteSummary`,
  `cmdScaffoldMilestone`, `cmdScaffoldPhase`, `cmdScaffoldCodebase`,
  `cmdCompleteMilestone`) now pass `{ paths: lifecycle.pathsFromActions(r.actions) }`.
  `completeMilestone` does the same internally.

### Fixed — `cp doctor` no longer warns about its own canonical layout (CONCERNS High)

- `lib/gsd-compat.js report()` unconditionally warned about short-form
  `PLAN.md` / `SUMMARY.md` as "incompatible with GSD" — but cp emits both by
  design (`scaffoldPhase` writes `PLAN.md`, `writeSummary` writes
  `{NN-MM}-SUMMARY.md`). The warning fired on every project cp scaffolded,
  including its own dogfood tree. Pure noise.
- New behaviour: warn ONLY when a phase dir contains BOTH a short-form AND a
  long-form sibling — the one case where the parser would actually have to
  guess. The warning text now also explains short-form is cp-canonical and
  long-form is GSD round-trip.
- `.planning/codebase` removed from `GSD_SENTINELS` — cp also writes it now
  (via `cp scaffold-codebase` / `/cp-map-codebase`, since v0.3.2). It is a
  shared dir, not a GSD-only one.

### Added — coverage

- **`test/unit-gitcommit.js`** — 26 new assertions: `pathsFromActions` shape,
  default-scope only stages `.planning/`, explicit paths scope correctly,
  relative paths accepted, empty staging returns null, `planningOnly: false`
  legacy mode preserved, end-to-end CLI runs (`scaffold-milestone`,
  `scaffold-phase`, `scaffold-codebase`) do NOT commit a dirty sibling file.
- **`test/unit-libs.js`** — short-form-PLAN cp-canonical (no warning) +
  short+long coexist (warning) assertions added to the gsd-compat section.
- Test totals: **519 assertions** across 9 suites, all green.

### Changed

- `lib/gsd-compat.js GSD_SENTINELS` no longer lists `.planning/codebase` —
  cp also writes it (since v0.3.2). Comment updated with the precedent list.

### Dogfood

- Run `/cp-map-codebase --force` after upgrading to verify both rows clear
  in the freshly regenerated `.planning/codebase/CONCERNS.md`.

## [0.3.2] — 2026-05-19

This release ships **`/cp-map-codebase`** (cp-native, no Superpowers required)
and the **atomic-write hotfix** for the data-integrity Critical that the
live `/cp-map-codebase` dry-fire against cp itself surfaced.

### Added — `/cp-map-codebase`
- **`/cp-map-codebase`** slash command — cp-native equivalent of GSD's
  `gsd-map-codebase`. Dispatches 4 parallel sub-agents (tech / arch / quality /
  concerns) via the host harness's native sub-agent primitive (Copilot CLI's
  `task` tool, Claude Code's Task tool, etc.) to produce 7 docs in
  `.planning/codebase/` (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE,
  CONVENTIONS, TESTING, CONCERNS). Filenames and layout match GSD exactly so
  `cp gsd-import` stays clean. Supports `--force` (overwrite) and `--fast`
  (single-agent scan with optional `--focus`). **No workflow provider involved.**
- **`cp scaffold-codebase [--force] [--no-commit] [--dry-run]`** CLI wrapper —
  creates `.planning/codebase/` and seeds 7 stub files from
  `templates/codebase/*.md`. Idempotent: refuses to overwrite existing files
  unless `--force`. Auto-commits unless `--no-commit`.
- **`cp codebase-status [--json]`** CLI wrapper — inventories
  `.planning/codebase/`: per-file existence, line count, byte size, and a
  "looks-stub" heuristic (≤ 40 lines OR contains the placeholder marker).
  Exits 1 if the dir is missing.
- **`lib/codebase-mapper.js`** — pure file-I/O module exposing
  `scaffoldCodebase`, `codebaseStatus`, `DOCS`, and `FOCUS_AREAS`
  (the 4-way split the slash command consumes to build agent prompts).
  Calls no LLM — fully unit-testable.
- **`templates/codebase/{7 files}.md`** — minimal stubs with section headers
  and HTML-comment guidance the mapper agents replace.
- **`test/unit-codebase.js`** — 39 assertions covering scaffold happy path,
  refuse-overwrite, `--force`, `--dry-run`, missing-`.planning/` error,
  `codebaseStatus` shape, stub-vs-filled heuristic.

### Fixed — atomic multi-file writes
- **Atomic single-file writes (CONCERNS Critical, closed).** `lib/lifecycle.js`
  `writeFile()` now writes to a sibling `.cp-tmp-{pid}-{rand}` file then
  `fs.renameSync`s it into place. The rename is atomic on POSIX and on NTFS
  via `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`. Readers will see either old or
  new content, never a half-written file. Temp files are cleaned up if the
  write step throws.
- **Multi-file transactional batch (`writeBatch`).** New helper exported from
  `lib/lifecycle.js`. Stages every `write` action to a temp file FIRST; only
  after every temp lands does it rename them into place; ONLY THEN does it
  apply `delete` actions. Used by `completeMilestone` so the destructive
  `delete .planning/MILESTONE-CONTEXT.md` step can never run before the
  replacement `MILESTONES.md` / collapsed `ROADMAP.md` / reset `STATE.md`
  are durably on disk. Closes the Critical surfaced by the live
  `/cp-map-codebase` dry-fire against cp itself.
- **`test/unit-atomic.js`** — 23 assertions: no-temp-leftover on success,
  atomic overwrite, temp cleanup on failure, `writeBatch` apply order,
  deletes-only-after-writes invariant, abort-on-staged-write-failure rollback
  (deletes never run), `skip` / unknown-kind action handling, end-to-end
  `completeMilestone` run with zero `.cp-tmp-*` orphans under `.planning/`.

### Changed
- README "Slash commands" table gains `/cp-map-codebase` row; "Node CLI" block
  adds `cp scaffold-codebase` + `cp codebase-status` entries; Roadmap gains a
  "v0.3.x — `/cp-map-codebase`" milestone entry.
- `package.json` `scripts.test` now includes `unit-codebase` and `unit-atomic`.
  `npm test` runs 9 suites totalling ~491 assertions (up from 429).
- `lib/lifecycle.js` exports `writeFile` and `writeBatch` publicly so future
  cp libs (and external callers) can opt into the same atomicity guarantees
  instead of reimplementing temp+rename.

### Design notes
- **Why map-codebase is cp-native, not provider-delegated.** This work is
  upfront context gathering that writes structured state — it has no analog
  in Superpowers' workflow-skill catalogue (brainstorm / plan / execute /
  review / debug / TDD / verify), and using a workflow-provider role here
  would only add latency and lose the 4-way parallelism. cp owns it directly,
  in the same way it owns `cp init` and `cp scaffold-*`. The provider
  abstraction is for *workflow* work only.
- **Brownfield bootstrap order:** `cp scaffold-codebase` → `/cp-map-codebase`
  → `cp init`. Running `/cp-map-codebase` first gives `cp init` real context
  to ground PROJECT.md against, matching the GSD recommendation for existing
  codebases.
- **Eating our own dogfood.** The atomic-write Critical was found in <10 min
  by running `/cp-map-codebase` against cp's own source. The hotfix shipped
  in the same release. This is the value loop the whole project is built
  around.

## [0.3.0] — 2026-05-19

### Added
- **`cp scaffold-milestone <name>`** wrapper — appends `### 🚧 <name> (In Progress)`
  (or `### 📋 <name> (Planned)` with `--planned`) inside ROADMAP's `## Phases`
  section. Refuses duplicates via case-insensitive substring match against
  `findMilestoneInRoadmap`. Auto-commits unless `--no-commit`.
- **`cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>]`**
  wrapper — inserts `### Phase N: <name>` under the active (or named)
  milestone in ROADMAP and creates `.planning/phases/{NN-slug}/PLAN.md` from
  the new `templates/phase-PLAN.md`. Pre-fills `- [ ] NN-MM: TBD` checkboxes
  for the requested plan count. Supports decimal phase numbers (e.g. `2.1`).
- **`templates/phase-PLAN.md`** — per-phase PLAN template with frontmatter
  (phase, name, milestone, status, created) and Goal/Success Criteria/Plans
  /Notes sections.
- 35 new assertions in `test/unit-lifecycle.js` (total: 66 → 101 in this file,
  ~429 across the full suite).
- README "v0.3 (shipped)" entry under Roadmap + new wrappers in CLI Surface.
- Migration leadership in `commands/cp/new-milestone.md` and `plan-phase.md`
  — both slash-commands now lead with the new wrappers and keep the original
  flow as the manual-provider fallback.

### Changed
- **`templates/ROADMAP.md` (breaking shape)** — removed `## Milestones` H2 bullet
  section and the placeholder `### Phase 1: {Name}` block. Fresh `cp init`
  now produces an empty `## Phases` section with usage hints; users run
  `cp scaffold-milestone` and `cp scaffold-phase` to populate. This fixes the
  template-vs-parser mismatch where `findMilestoneInRoadmap` returned `null`
  on a fresh `cp init` ROADMAP, AND eliminates the duplicate-`### Phase 1:`
  problem when `scaffold-phase 1` ran on a placeholder.
- `bin/cp.js`: `usage()` enumerates the new subcommands; `main()` switch
  dispatches them. Preserves the existing manual flag-parser pattern.

### Fixed
- `cmdCompleteMilestone` arg-parser block was accidentally dropped during a
  refactor in this version's working tree; caught by the v0.3 smoke test and
  restored before commit (no released version was affected).

### Verified
- End-to-end smoke at `%TEMP%\cp-v03-final`: `cp init` →
  `cp scaffold-milestone` → `cp scaffold-phase` → 2× (`cp write-summary` +
  `cp tick`) → `cp complete-milestone` produces a fully-shipped milestone
  with collapsed ROADMAP block, rich MILESTONES digest, reset STATE, and
  6 atomic commits **without ever editing a markdown file by hand**.

## [0.2.0] — 2026-05-19

### Added
- **`lib/lifecycle.js`** (~400 LOC, 5 public functions) — the public,
  user-friendly API that hides the GSD lib-contract details that bit us
  during the v0.1 linkmark walkthrough.
- **`cp status [--json]`** — "you are here" report: current milestone,
  per-phase plan completion, next pending plan, next action.
- **`cp tick <plan-id> [--undo] [--no-commit] [--dry-run]`** — toggles a
  plan's checkbox in BOTH ROADMAP.md and the phase's `PLAN.md` (the
  `setPlanDone`-on-both gotcha). Idempotent. Auto-commits.
- **`cp write-summary <plan-id> --from <json> [--body <md>] [--overwrite] [--dry-run]`**
  — writes `{NN-MM}-SUMMARY.md` (no slug between!) with validated frontmatter.
  Normalises snake_case aliases (`subsystems` → `subsystem`, `files_created`
  → `key-files.created`, `requirements_completed` → `requirements-completed`,
  etc.) to the kebab-case names `aggregateSummaries` actually reads.
- **`cp complete-milestone [<name>] [--dry-run] [--no-commit] [--json]`** —
  full atomic close-out: verify all phases done → aggregate SUMMARYs → render
  digest → append to MILESTONES.md → collapse milestone in ROADMAP → clear
  MILESTONE-CONTEXT.md → reset STATE → commit.
- `test/unit-lifecycle.js` — 66 assertions across 6 sections.
- README rewrite (95 → 253 lines) — TL;DR flow diagram, comparison table,
  install steps, linkmark walkthrough, full CLI reference, provider
  abstraction with 11 roles, troubleshooting, roadmap.
- 3 slash-command rewrites (`complete-milestone.md`, `execute-phase.md`,
  `progress.md`) to lead with the new wrappers; original lib-level steps
  preserved as the manual-provider fallback.

### Notes
- Total tests: 328 → 394 across 7 files.
- End-to-end smoke at `%TEMP%\cp-cli-only-demo` proved CLI-only operation
  works without any direct lib call.

## [0.1.0] — 2026-05-19

### Added
- Initial plugin: 8 slash commands (`new-project`, `new-milestone`,
  `plan-phase`, `execute-phase`, `quick`, `progress`, `resume`,
  `complete-milestone`).
- GSD-compatible state layer (`PROJECT.md`, `ROADMAP.md`, `STATE.md`,
  `MILESTONES.md`, phase + quick dirs) with shared `.planning/config.json`
  and a top-level `cp:` block for cp-specific keys.
- `cp init` scaffolds a fresh `.planning/`.
- `cp install copilot` / `cp install claude` installers (read-from-source,
  so re-running picks up the latest slash commands).
- `cp gsd-import` read-only audit of any planning project (cp or GSD).
- `cp doctor` shows resolved config, provider status, GSD compat report.
- `cp config get/set` for the `cp.*` block.
- Workflow-provider abstraction with `superpowers` and `manual` providers
  and 11 mappable roles (brainstorm, plan, execute, review, finish,
  worktree, tdd, debug, verify, …).
- 328 assertions across 6 test files (parser, gsd-import, complete-
  milestone, resume, round-trip, unit-lib).

[Unreleased]: https://github.com/shushenglihotmail/context-planning/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.0
[0.3.4]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.4
[0.3.3]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.3
[0.3.2]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.2
[0.3.0]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.0
[0.2.0]: https://github.com/shushenglihotmail/context-planning/compare/fb25af1...3607082
[0.1.0]: https://github.com/shushenglihotmail/context-planning/commit/fb25af1
