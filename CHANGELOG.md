# Changelog

All notable changes to **context-planning (`cp`)** are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-05-29 — Workflow contract hardening

Closes four classes of "the supervisor agent didn't do what the YAML
asked" failures observed in the wild after v1.5: skipped routed skills,
inconsistent fallback wording across docs, ambiguous skill annotations
in the wave-block output, and `cp run` workflows that never reached a
closed terminal state when the user simply stopped engaging.

### Added

- **`cp run-finalize <slug>`** — generic terminal-state CLI for any
  `cp run <workflow>` run. Flips STATE.yaml `status` to `complete`,
  clears `current_phase`, and writes a minimal `SUMMARY.md`. Pairs
  with the existing `cp quick-finalize` / `cp milestone-finalize`
  for binding-specific runs.
- **Auto-injected finalize phase (D1)** — any workflow template that
  does not declare an explicit terminal phase now gets one appended
  at runtime by `applyAutoInjectFinalize()`. The injected phase is a
  `kind: scaffold` step depending on the previous tail, with a
  binding-aware command (`cp milestone-finalize`, `cp quick-finalize`,
  or `cp run-finalize`). This guarantees every run lands in a closed
  state even if the supervisor stops mid-flow.
- **`cp workflow inspect` surfaces auto-injection** — auto-injected
  phases are tagged `[auto-injected]` in the human output and carry
  `"auto_injected": true` in `--json` output.
- **`cp run --verbose` / `cp run resume --verbose`** — opt-in flag
  that restores the legacy `skill: <name> (source: …)` annotation in
  the wave-block output for debugging routing decisions.
- **5 new `CONFIG_FALLBACKS` (D3)** for superpowers skills:
  `test`, `debug`, `verify`, `execute_plan`, `finish_branch`. Built-in
  templates and custom workflows can now reference these via
  `${config.provider.…_skill}` and get a sensible default with or
  without superpowers installed.

### Changed

- **Wave-block output uses an `invoke skill: <name>` directive (D2).**
  Previously the supervisor saw `skill: <name> (source: routing-key)`,
  which several real-world agents interpreted as informational and
  proceeded to do the work inline. The default format is now an
  imperative `invoke skill: <name>` directive preceded by a one-time
  contract legend explaining that "invoke" means call the skill tool
  with the named skill, and how to fall back if the skill is not
  available in the active provider. Unrouted phases render as
  `skill: (none)`. The old annotation moves behind `--verbose`.
- **Slash-command prompt scrub (D4).** Reworked the skill-invocation
  language in `cp-quick`, `cp-workflow-run`, `cp-new-project`, and
  `cp-execute-phase` so every doc gives the agent the same
  `invoke skill: <name>` directive and the same fallback rule. No
  more "the workflow suggests…" / "you may want to use…" phrasing
  that earlier versions used in different places.

### Fixed

- Built-in templates that previously ended on a non-scaffold phase
  (e.g. `dev` → `… → review`) now always finalize. Runtime callers
  apply `applyAutoInjectFinalize` after `loadTemplate` at all four
  hook sites: `startRun`, `resumeRun`, `markPhaseComplete`,
  `retryPhase`. Idempotent — re-loading on resume is a no-op when an
  explicit `finalize` phase already exists.

### Migration

- **For workflow authors:** No action required. If your template
  already ends on a phase named `finalize`, auto-injection is a
  no-op. If it ends on something else, you'll see a new `finalize`
  phase in `cp workflow inspect` output tagged `[auto-injected]` —
  add an explicit one to opt out.
- **For agents/supervisors:** Read the new contract legend printed
  at the top of `cp run` output once per run. The short version:
  when a wave-block says `invoke skill: <name>`, call the skill
  tool — don't inline the work. If the named skill is not available
  in the active provider, do the equivalent work yourself.
- **For consumers of `cp run --json` / `workflow inspect --json`:**
  Phase entries now carry an `auto_injected: boolean` field. Older
  consumers that read by key will see the field as falsy and behave
  identically.

## [1.5.0] - 2026-06 — Role/skill semantics + zero-config workflow defaults

Fixes a v1.4 regression where `/cp-quick` would jump straight into
implementation on a terse task description. The root cause turned out
to be three independent bugs in the workflow runtime and built-in
templates; v1.5 closes all of them and adds regression coverage.

### Fixed

- **`${config.provider.…}` tokens are now interpolated.** Top-level
  `params:` defaults containing `${config.…}` are resolved at template
  load time against the active config. Previously they were copied
  through verbatim and reached the supervisor as literal text, which
  meant a phase asking for `skill: ${config.provider.execute_skill}`
  got the literal string instead of the configured skill name.
- **Skill values now route through the provider.** A bare skill name
  on a phase (e.g. `skill: plan`) is resolved through
  `provider.resolveSkill(name)`, which checks the active provider's
  skills directory and falls back to `cp:manual/<name>` when no
  provider is installed. This is what makes the built-in templates
  work zero-config, with or without superpowers.
- **`quick.yaml` and `milestone.yaml` now declare `prompt:` blocks.**
  Both templates previously set only `description:`, but
  `formatInstruction` emits `prompt:` (not `description:`) to the
  supervisor. The design phase's STOP / wait-for-user-confirmation
  gate is now in the prompt where it is actually visible — this is
  the end-to-end fix for the original symptom.

### Added

- **Role/skill orthogonality** in the v1.2+ schema validator:
  - `role:` is treated as a persona (free-form, e.g. `developer`,
    `tech-writer`, `planner`).
  - `skill:` is either a routing key (resolved via the provider) or a
    pinned literal (e.g. `cp:manual/plan`).
  - Putting a routing key (`plan`, `execute`, `brainstorm`, …) in
    `role:` now produces a validator warning.
  - Setting BOTH `role:` and `skill:` to routing keys that disagree
    is a validator error.
- **Persona role params** on the built-in templates:
  - `quick.yaml`: `design_role` (default `tech-writer`),
    `execute_role` (default `developer`).
  - `milestone.yaml`: `brainstorm_role` (default `product-thinker`),
    `plan_role` (default `developer`).
- **`test/integration-v15-builtin-templates.js`** — 7 cases that load
  every shipped v1.5 template through
  `loadTemplate → computeWaves → formatInstruction` and assert no
  leaked `${config.…}` / unresolved `{{…}}` tokens on role/skill
  lines, and that the STOP gate reaches the supervisor instruction.

### Changed

- The built-in `quick` and `milestone` workflow YAMLs no longer carry
  `${config.provider.…_skill}` defaults. Their `skill:` params now
  default to literal routing keys (`plan`, `execute`, `brainstorm`),
  which providers can intercept; pin-overrides via `cp:manual/<name>`
  still work.

### Migration

For users who authored custom workflow YAMLs against v1.4:
- If you wrote `role: plan` (or any routing key) expecting that to be
  routed, change it to `skill: plan` and add a persona `role:` like
  `developer` or `tech-writer`. Routing-key roles will start warning
  in v1.5 and may become an error in a future release.
- If you wrote `skill: ${config.provider.execute_skill}` expecting
  that to be substituted, replace it with `skill: execute` (or
  whatever routing key you meant). The literal `${config.…}` form
  still works as a `default:` on a top-level `params:` entry.

## [1.4.0] - 2026-05-28 — Workflow-driven quick and milestone

The three workhorse slash commands (`/cp-quick`, `/cp-new-milestone`,
`/cp-complete-milestone`) are now thin wrappers over workflow YAMLs.
A new `supervised: true` flag indicates the harness LLM session is
the supervisor (Option A: no daemon, no embedded LLM). See
[`MIGRATION-v1.4.md`](MIGRATION-v1.4.md).

### Added

- **`supervised:` top-level flag** on workflow YAMLs. When true, a
  single harness LLM session drives every phase end-to-end. When
  false (or absent), the workflow is deterministic — each phase is a
  single `cp` CLI invocation.
- **Built-in `quick` workflow** (supervised, 4 phases: setup → design
  → execute → finalize) replacing the inline `/cp-quick` logic.
- **Built-in `milestone` workflow** (supervised, 6 phases: setup →
  brainstorm → propose-project-updates → apply-project-updates →
  propose-phases → finalize) replacing the inline `/cp-new-milestone`
  logic.
- **Built-in `complete-milestone` workflow** (deterministic, 2 phases:
  verify → complete) wrapping `cp complete-milestone`.
- **`cp abandon <slug> [--yes] [--reason <text>]`** — soft-abandon a
  workflow run (state only; never reverts code).
- **`cp list [--workflow <name>] [--status <status>] [--json]`** —
  list runs under `.planning/runs/`.
- **`cp status <run-id>`** — with a positional id, prints that run's
  state. Bare `cp status` is unchanged.
- **Internal verbs** used by the new workflow phases:
  `cp quick-setup`, `cp quick-finalize`, `cp milestone-setup`,
  `cp milestone-finalize`.

### Changed

- **`/cp-quick`, `/cp-new-milestone`, `/cp-complete-milestone`** are
  now ~30-line thin delegations to `cp run <workflow>`. They no
  longer contain inline orchestration logic.
- The built-in `quick` workflow's phase ids changed:
  `discuss` → `setup`, `verify` → `finalize` (breaking for anyone
  scripting against those ids).

### Migration

See [`MIGRATION-v1.4.md`](MIGRATION-v1.4.md). End users who only
consume cp through the slash commands need no action.

## [1.3.0] - 2026-05-27 — Reusable phase templates

Strictly additive release: every v1.2 workflow loads and runs unchanged.
See [`MIGRATION-v1.3.md`](MIGRATION-v1.3.md).

### Added

- **Phase templates** — parameterized phase bodies you can include from
  any workflow via `- phase: { id, template: { name, args } }`. Ship
  under `templates/phase-templates/` (built-in) and
  `.planning/phase-templates/` (project). Three built-in templates:
  `reviewer`, `feature-plan`, `feature-execute`. Chain depth capped at 3.
- **Workflow templates** — reusable multi-phase groups you can splice
  inline via `- template: { id, name, args }`. Inner phase ids are
  namespaced with the group handle (`<group-id>--<inner-id>`). Outside
  refs to the group handle are rewritten to depend on the group's exit
  phases. One built-in template: `review-and-address`. Chain depth
  capped at 3.
- **CLI command families** for both kinds:
  - `cp phase-template ls | show | new`
  - `cp workflow-template ls | show | new`
- **`cp workflow inspect`** now surfaces `templates_referenced` and
  `resolver_warnings` (both human and `--json` form).
- **Example workflow** `templates/workflows/_examples/dev-templated.yaml`
  reproduces `dev.yaml`'s fan-out using `feature-plan` and
  `feature-execute` phase-templates; integration test verifies
  field-for-field equivalence.

### Internal

- `lib/phase-template-loader.js` and `lib/phase-template-resolver.js`
  implement loading, param merging, `{{token}}` substitution, and the
  resolver pass.
- `lib/workflow-template-loader.js` and `lib/workflow-template-expand.js`
  implement workflow-template loading and the expansion engine
  (namespace prefixing, internal edge rewriting, recursive nested
  expansion).
- `lib/workflow.loadTemplate` runs a three-pass pipeline: phase-template
  resolution → workflow-template expansion → external `after:` group
  reference rewriting.

## [1.2.0] - 2026-05-26 — Unified phase model (DESIGN.md + STATE.md), fan-out, `/cp-quick` rewrite

### Added

- **Unified phase storage**: every phase (built-in `dev`, lightweight
  `quick`, custom workflows) now scaffolds `DESIGN.md` (intent /
  contract / persisted output) + `STATE.md` (current status / history)
  alongside the existing PLAN.md. Populated by `cp scaffoldTierFiles`
  on `cp run start`, `/cp-quick`, and fan-out child materialization.
- **Fan-out runtime** — first-class parent → N-children expansion.
  - New workflow keys: `parent:`, `after:`, `max_children:`.
  - Parent agent returns a structured object
    `{ optimizable: boolean, items: [ { name, depends_on } ] }`; runtime
    materializes one child per item. Bare items array still accepted as
    `optimizable: false` for back-compat.
  - **`optimizable:` flag (v1.2.0)** disambiguates agent confidence. When
    `true`, runtime computes a topological order over per-item
    `depends_on` and parallelizes safe waves; missing `depends_on` is
    treated as `[]`; cycles / self-refs / unknown ids hard-fail the
    parent. When `false` or missing, runtime runs items in strict array
    order and ignores any declared `depends_on` entirely.
  - `max_children:` safety cap fails parent phase before materializing
    a runaway expansion.
- **`persist:` primitive** — when set on a phase, the runtime folds that
  phase's agent output into the phase's DESIGN.md under a
  `## <phaseId>` heading. Re-runs are idempotent (section replaced
  in-place). Atomic via tmp + rename, so crashes never leave partial
  DESIGN.md.
- **`/cp-quick` rewrite** — scaffolds `quick-DESIGN.md` (goal /
  approach / done-when, ~30 lines) + `quick-STATE.md` instead of the
  heavyweight `quick-PLAN.md`. Step 4 collaborative DESIGN fill-in
  forces explicit contract before any work. `--full` retains v1.1
  heavyweight plan behavior.
- **`cp autonomous --workflow=<dev|quick>`** flag — pass a workflow
  choice through to per-phase delegation. Defaults to `dev`. Enables
  autonomous driving of quick (non-roadmapped) runs.
- **MIGRATION-v1.2.md** documenting every rename, deprecation, and
  the fan-out / `depends_on` contract. See file for diff blocks,
  deprecation table, and cheatsheet.

### Changed

- **`persist_output:` → `persist:`** in workflow YAML. Legacy key
  loads with a one-line deprecation warning; `persist:` wins when
  both are present.
- **`.planning/custom/` → `.planning/quick/`** as the canonical
  quick-tier run root. Legacy slugs remain readable transparently
  (one-time deprecation warning per process). Writes to a legacy
  slug stay in legacy (no surprise migration). New runs go to
  `.planning/quick/` only. `cp run list` aggregates both.
- **`binds_to: custom` → `binds_to: quick`** in workflow templates.
  Loaders silently normalize. `cp workflow validate` accepts both.
  Built-in `quick.yaml` and `debug.yaml` ship with the new value.

### Deprecated

The following remain functional in v1.2 but will be **removed in v1.3**:

- `persist_output:` workflow key (use `persist:`).
- `.planning/custom/` storage path (use `.planning/quick/`).
- `binds_to: custom` in templates (use `binds_to: quick`).
- `/cp-plan-phase` skill — now a stub that prints a deprecation
  notice and tells you to use `/cp-autonomous` (which delegates
  per-phase plan generation to the role skill).
- `quick-PLAN.md` template (use `quick-DESIGN.md` + `quick-STATE.md`).
- Legacy v0.10-shape pass-through in `/cp-autonomous` for projects
  scaffolded before v1.2.

### Internal

- `test/unit-autonomous.js` extended from 24 to 43 assertions: smart
  gate ordering (per-phase test + audit), runTests/runAuditGate
  direct unit calls, CLI argv parity for `cp autonomous`, `/cp-quick`
  skill+template contract, and lib/custom.js back-compat.
- New helpers in `lib/custom.js`: `_resolveRunDir`,
  `_freeSlugAcrossRoots`, `_resetDeprecationWarning`.
- `commands/cp/plan-phase.md` rewritten as a deprecation stub with
  `deprecated: true` frontmatter.

## [1.1.0] - 2026-05-25 — Workflow agent skills + `cp workflow export` + `cp workflow inspect`

### Added

- **Twelve `cp-workflow-*` agent skills** closing the v1.0 agent-skill
  gap. Every `cp workflow` CLI verb except `init` now has a matching
  in-CLI slash skill, so agent users no longer have to drop to a
  terminal mid-session. See [MIGRATION-v1.1.md](MIGRATION-v1.1.md) for
  the full walkthrough.

  **Drive a run / discover templates:**
  - `/cp-workflow-list` — list templates (wraps `cp workflow ls`).
  - `/cp-workflow-run <workflow> [<name>] [--scope=…] [--check]` —
    drive any workflow wave-by-wave; dispatches each phase to the role
    skill resolved by `cp doctor`. Smart-gated on test fail / audit
    HIGH / executor deviation. Wraps `cp run` + the mark-complete wave
    loop.
  - `/cp-workflow-resume <slug>` — re-emit the current wave's
    instruction (wraps `cp run resume`).

  **Author + customize templates:**
  - `/cp-workflow-new <name> [--from <built-in>] [--force]` — author
    a new template from blank or clone. Refuses built-in name reuse
    outright; project-name collision needs `--force`. Wraps
    `cp workflow new`.
  - `/cp-workflow-customize <built-in> [<new-name>] [--out <path>] [--force]`
    — round-trip customize a built-in: export → edit → validate →
    import as new name. Wraps the new `cp workflow export` +
    `cp workflow import`.
  - `/cp-workflow-brainstorm [--workflow <name>] [--out <path>]` —
    design a new workflow conversationally via the provider's
    brainstorm skill (wraps `cp workflow brainstorm`).

  **Inspect + validate templates:**
  - `/cp-workflow-show <name>` — pretty-print YAML (wraps
    `cp workflow show`).
  - `/cp-workflow-diagram <name-or-path>` — Mermaid flowchart of the
    phase DAG (wraps `cp workflow diagram`).
  - `/cp-workflow-inspect <name-or-path> [--json]` — show YAML plus
    deduced wave order (wraps the new `cp workflow inspect`).
  - `/cp-workflow-validate <name-or-path> [--strict]` — schema + DAG
    validation; `--strict` for CI (wraps `cp workflow validate`).
  - `/cp-workflow-import <path> [--name <override>] [--force]` —
    validate + copy external template (wraps `cp workflow import`).
  - `/cp-workflow-export <name> [--out <path>] [--as <new-name>] [--force]`
    — export built-in to file (wraps the new `cp workflow export`).
- **`cp workflow export <name> [--out <path>] [--as <new-name>] [--force]`**
  — new CLI subcommand. Exports a built-in template to a file with the
  `# template:` header stripped and the `workflow:` key optionally
  renamed via a line-precise regex (preserves formatting; no YAML
  reserialization). Validates before write. Default destination:
  `./<as-or-name>.yaml`. Exit codes match the rest of `cp workflow`
  (2 = usage, 3 = template not found, 6 = file exists).
- **`cp workflow inspect <name-or-path> [--json]`** — new CLI
  subcommand. Combines `cp workflow show` output (raw YAML) with the
  deduced wave-by-wave execution sequence computed by
  `lib/workflow.js#computeWaves` — the topological grouping the
  runtime uses internally but never previously exposed. Useful for
  understanding which phases run in parallel before launching `cp run`.
  Human-readable by default; `--json` emits structured form for tooling.
- **~150 new test assertions** spread across:
  - `test/integration-workflow-skills.js` — 39 → 93 (+54 for shape
    assertions covering the 9 newly added skill files).
  - `test/dryrun-workflow-cli.js` — 75 → 103 (+28 for `cp workflow
    inspect` + 1 for help-mention assertion).
  - `test/unit-v034.js` — 64 → 92 (+28 for installer auto-pickup of
    the 7 new skills).

### Changed

- `package.json` version bumped from `1.0.0` → `1.1.0`.
- `cp workflow show <name>` documented as the YAML-to-stdout export
  pattern (unchanged behavior; back-compat critical —
  `cp workflow show foo > foo.yaml` still works exactly as in v1.0).

### Deferred to v1.2

- `cp-quick` and `cp-autonomous` shim refactor over `/cp-workflow-run`.
  A design review showed the two orchestrators use fundamentally
  different state layouts (`.planning/quick/<dir>/` vs
  `.planning/runs/<slug>/`; milestone-phase machine vs workflow-wave
  machine) and a clean shim would require either back-compat breaks or
  near duplication. Deferring for a proper state-layout migration in
  v1.2. v1.1 ships the new agent surface without modifying the legacy
  skills.
- `/cp-workflow-init` — the one CLI verb without a slash companion.
  `cp workflow init` is a one-shot bootstrap (creates an empty
  `.planning/workflows/` directory) that doesn't benefit from agent
  orchestration. Will reconsider if user demand emerges.

## [1.0.0] - 2026-05-24 — Workflow Engine

### Added

- **Workflow Engine** — reusable YAML workflow format with phase DAGs,
  parallel waves, top-level `principles:`, and three state tiers
  (`milestone` / `phase` / `custom`). See [MIGRATION-v1.0.md](MIGRATION-v1.0.md)
  for the full template format reference and FAQ.
- **`cp run` CLI family** — `cp run <workflow> [name] [--plan-only]` starts a
  new workflow run; `cp run resume <slug>` re-emits the current wave;
  `cp run retry <slug> <phase-id>` rolls back a phase; `cp run abandon <slug>`
  marks a run abandoned; `cp run mark-complete <slug> <phase-id>` advances the
  run (summary read from stdin); `cp run status [slug] [--json]` lists runs or
  shows one's state.
- **`cp workflow` CLI family** — `cp workflow ls / show / validate / diagram /
  init / new / import / brainstorm`. Validate templates before running;
  `--strict` makes warnings fail for CI usage; `diagram` emits a Mermaid
  `flowchart TD` of the phase DAG.
- **Three built-in templates** at `templates/workflows/`:
  - `dev.yaml` — 6-phase milestone-bound dev workflow with a parallel research
    wave (brainstorm → research-prior-art ∥ research-constraints → plan →
    execute → review).
  - `debug.yaml` — 5-phase custom-bound scientific-method debug cycle
    (collect-symptoms → repro → plan → fix → verify).
  - `quick.yaml` — 3-phase custom-bound minimal workflow (discuss → execute →
    verify).
- **AI authoring** — `cp workflow brainstorm [--workflow <name>]` delegates to
  your configured provider's brainstorm skill (Superpowers by default) for
  conversational YAML workflow design. Falls back to a printed manual prompt
  when no provider is installed.
- **Top-level `principles:` field** — global directives applied across every
  phase of a workflow (e.g. "Don't commit until confirmed with user", "Run
  autonomously until hitting a blocking issue"). cp prepends them to every
  wave instruction emitted. Configurable per template.
- **104 new CLI test assertions** across `test/dryrun-run-cli.js` (31),
  `test/dryrun-workflow-cli.js` (53), and `test/integration-run-cli.js` (20).
  Lib-tier coverage from Phase 40: 75 assertions in `test/unit-workflow.js`,
  58 assertions in `test/unit-custom.js`, 67 assertions in
  `test/integration-runtime.js`.

### Changed

- `package.json` version bumped from `0.10.3` → `1.0.0`.

## [0.10.3] - 2026-05-22 — Collapse-aware audit + status renderer (hotfix)

### Fixed

- **`cp audit` reported false-positive `phase-no-roadmap` MEDIUM findings
  for every phase dir whose milestone had been collapsed into
  `<details><summary>✅ <name> (Phases X-Y) — SHIPPED ...</summary>`.**
  The check now treats integer phase numbers covered by a collapsed
  milestone's range as present in ROADMAP, even when the inner
  `### Phase N:` headings have been flattened away by Superpowers
  `writing-plans`. New helper `roadmap.listCollapsedPhaseNums()` exposes
  this set for any caller.
- **`cp status` suggested `cp complete-milestone` even when the
  milestone was already shipped.** The renderer now:
  - prints `Milestone "<name>" is shipped. Start the next one:` +
    `cp new-milestone "<name>"` when `milestoneStatus === 'shipped'`
  - prints a `No milestone in progress` hint when there is no milestone
    at all (no more silently empty output)
- **`findMilestoneInRoadmap` collapse-path returned only the endpoints
  of `Phases X-Y`** (e.g. "Phases 14-16" → `["14", "16"]`, dropping
  phase 15). Now expands integer ranges fully → `["14", "15", "16"]`.
  Non-integer ranges (`1.5-1.7`) still fall back to endpoints; ranges
  larger than 100 phases also fall back as a sanity guard.

## [0.10.2] - 2026-05-22 — Defensive verify + `--force` (hotfix)

### Fixed

- **`cp complete-milestone` crashed with `TypeError: Cannot read
  properties of undefined (reading 'join')`** when a phase declared in
  the milestone range was missing from ROADMAP.md (e.g. the Superpowers
  `writing-plans` skill collapsed the milestone but the inner
  `### Phase N` blocks were folded together or removed).
  `lib/milestone.js:verifyMilestoneComplete` now always populates
  `summariesMissing: []` and the numeric `plansDone`/`plansTotal` fields
  on missing-phase reports. `bin/commands/complete-milestone.js`
  defensively coalesces every report field before rendering the
  diagnostic so the user sees a clean error instead of a stack trace.
- **`cp complete-milestone` blocked on already-shipped milestones with
  no inner `### Phase` blocks.** When `found.status === 'shipped'`
  (collapsed in ROADMAP), the verify gate is now skipped entirely —
  the collapsed state IS the source of truth, and re-verifying would
  block on phases the external tool intentionally folded together. The
  digest append + STATE reset + cleanup still run.

### Added

- **`cp complete-milestone --force`** bypasses the verify gate for
  manual close-out (e.g. when summaries live outside cp's expected
  location). Audit gate still runs (use `--no-audit` to skip that too).
  Both override flags emit a clear `cp: --force override` stderr line.

## [0.10.1] - 2026-05-22 — Collapse-aware milestone close (hotfix)

### Fixed

- **`cp complete-milestone` returned `milestone-not-found` when ROADMAP.md
  was already collapsed** into `<details><summary>✅ <name> ... SHIPPED
  <date></summary>...</details>`. This pattern is produced by the
  Superpowers `writing-plans` skill on the final phase's C2 commit, by
  hand-collapses, and by prior `cp complete-milestone` runs.
  `lib/milestone.js:findMilestoneInRoadmap` now also walks `<summary>`
  lines and returns `status: 'shipped'` with the correct phases array.
- **`cp status` blind to collapsed milestones.** `statusReport` now
  falls back to STATE.md's `milestone:` frontmatter field when no
  `### (In Progress)` heading exists. Placeholder values (`-`, `Idle`,
  `None`) are still ignored.
- **`cp complete-milestone` is now idempotent.** When invoked against a
  milestone that's already shipped (collapsed in ROADMAP + digest in
  MILESTONES.md), it returns `{ok: true, alreadyShipped: true}` as a
  clean no-op instead of failing. When the milestone is collapsed but
  the digest hasn't been appended yet (e.g. external pre-close), it
  finishes the remaining bookkeeping — appends the digest, resets
  STATE.md, deletes MILESTONE-CONTEXT.md, commits.

### Added

- 9 regression assertions in `test/unit-collapse-aware.js` covering the
  collapsed-`<summary>` detector, em-dash variants, multi-phase
  ranges, STATE.md fallback, and `alreadyShipped` idempotency.

### Upgrade

```
npx -y --package=context-planning@latest -- cp update
```

No breaking changes; safe to upgrade in-place.

## [0.10.0] - 2026-05-21 — Autonomy

### Added

- **`cp autonomous` CLI verb.** New driver that walks pending phases of
  the active milestone with smart-gate stops. Flags: optional
  positional `START` (phase number, milestone name, or auto-detect from
  STATE.md), `--scope=phase|N|N-M|milestone` (defaults to milestone;
  count + range forms clamp to milestone end), `--check` (preview;
  exits 1 if anything would run), `--json`, `--quiet`. Exit codes:
  0 success / 1 stopped or check-found / 2 hard error. The lib stays
  pure — `planPhase` / `executePhase` callbacks are supplied by the
  slash skill, which keeps unit tests fast and avoids recursive npm
  test invocation.
- **`/cp-autonomous` slash skill.** Outer orchestrator that pre-flights
  with `cp autonomous --check --json`, then walks each in-scope phase:
  if PLAN.md is a scaffold stub it delegates to `/cp-plan-phase`,
  otherwise it loops `/cp-execute-phase` (one plan per call) with
  per-plan smart gates. On a stop trigger it writes
  `.planning/.continue-here.md`, prints a stop block, and prompts the
  user inline via `ask_user` with reason-tailored choices — the
  session is never exited. Auto-installed by all four harness
  installers on next `cp install`.
- **Smart-gate triggers.** The autonomous loop halts on four conditions:
  `test-failure` (configured `cp.behavior.test_command` non-zero exit),
  `audit-high` (`cp audit --json` reports `summary.high > 0`),
  `deviation` (`/cp-execute-phase` returns failure), and `plan-failed`
  (`/cp-plan-phase` did not fill the stub). Each writes a
  reason-specific `.continue-here.md` block.
- **Milestone hard-cap.** Even with `--scope=milestone` or
  `--scope=50`, the driver stops at the active milestone's last phase.
  Cross-milestone drives are intentionally out of scope — milestone
  closure has its own UAT gate.
- **README + CHANGELOG documentation** for the new verb + skill, plus a
  CLI table entry showing the `--scope` value taxonomy.
- **22 new unit assertions** in `test/unit-autonomous.js` covering the
  scope parser, START resolution, milestone-cap clamping, dry-run,
  real loop with stubbed callbacks, deviation gate, and
  `.continue-here.md` writer.

### Design

- Design spec: `docs/superpowers/specs/2026-05-21-v0-10-cp-autonomous-design.md`
- Milestone DESIGN: `.planning/milestones/v0-10-autonomy/DESIGN.md`

## [0.9.0] - 2026-05-21 — Onboarding

### Added

- **Onboarding decision matrix in README.** New "Choose your starting
  path" section maps the 4 install scenarios (greenfield / existing code /
  existing GSD state / existing cp upgrade) to a single one-line command
  each. Surfaces the right entry point without users having to scan
  the full install + getting-started flow.
- **`cp update` — case-4 onboarding helper.** New CLI subcommand that
  refreshes per-repo cp state in one shot: detects installed harness(es),
  re-runs `cp install <harness> --force` for each, merges new config
  defaults via `cp config refresh`, and auto-cleans low/medium drift via
  `cp audit --fix`. Flags: `--dry-run`, `--check` (CI gate), `--quiet`,
  `--json`. Documented user-facing invocation (mirrors `/gsd-update`):
  ```
  npx -y --package=context-planning@latest -- cp update
  ```
  That fetches the latest cp via npx (per-user cache, no sudo,
  package-manager-neutral) and runs `cp update` against the current repo
  in one command. The subcommand also works standalone (`cp update`) if
  the binary is already current.
- **`/cp-update` slash-command skill** mirroring `/gsd-update`'s structure;
  installed by all four harness installers on next `cp install`.
- **`/cp-map-codebase` auto-init.** When invoked in a repo without
  `.planning/`, the skill now runs `cp init` first with a mandatory
  user-visible notice, then proceeds with mapping. Case-2 onboarding
  (existing code, no planning yet) becomes a single command.
- **Milestone digest surfaces phase DESIGN.md + REVIEW-LOG.md.**
  `renderDigest` now emits two new sections after "Phase summaries:":
  **Phase designs:** (one link per phase whose DESIGN.md is non-stub) and
  **Reviews:** (total entry count across the milestone + per-phase
  REVIEW-LOG.md links). Closes the v0.7 inbox #1 gap where
  `aggregateSummaries` collected the refs but the renderer dropped them.
  Stub designs (untouched templates) are filtered out so MILESTONES.md
  stays free of noisy scaffold links. Sections are omitted entirely
  when their data is empty.

### Changed

- README "Updating an existing install" section restructured around the
  `npx` one-liner as the primary path; manual / per-verb invocations
  documented as alternatives.

### Fixed

- **`cp scaffold-milestone` now appends new milestone headings to the
  END of the `## Phases` section** (was prepending at the top, which
  caused `cp complete-milestone` to scoop ALL prior loose phase headings
  into the new milestone and emit `Phases: 1-N` digests instead of just
  the milestone's own range). New unit assertion in
  `test/unit-lifecycle.js` covers tail-insert positioning.

## [0.8.1] - 2026-05-21 — README polish (npm-page facing)

- README: `cp --version` example now prints `0.8.x` (was stale `0.7.x`).
- README: test-suite count refreshed to `~1400 assertions` (was stale `328`).
- README "Updating an existing install" section expanded with:
  - Explicit explanation of `--force` semantics (collision-safe-by-default
    vs. version-bump intent).
  - v0.8 upgrade note: `--force` is REQUIRED to inject the new
    drift-defense literacy block into the harness's ambient instruction
    file (`.github/context-planning.md` / `.claude/CLAUDE.md` / etc.).
  - How to verify the block landed (`grep cp:drift-defense v1`).
- No code changes — patch release purely for the npm package page README.

## [0.8.0] - 2026-05-21 — Consistency milestone

The "drift defense" release. Plan/state docs and the codebase drift
apart over time; v0.8 ships a complete **prevent → detect → repair**
stack so they stay in sync.

See [`docs/drift-playbook.md`](docs/drift-playbook.md) for the full
walkthrough including a migration guide for pre-v0.8 projects.

### Added (v0.8 — Consistency milestone)

- **Agent literacy injection** (Phase 30): `templates/agent-instructions.md`
  ships a drift-defense literacy block (verb list + finding-id → verb
  table) automatically injected into the ambient instruction file of
  every harness installer (Copilot CLI, Claude Code, Cursor, Aider).
  Idempotent via `<!-- cp:drift-defense v1 -->` sentinels. New
  `install/common.js` helpers `buildDriftDefenseBlock(pluginRoot)` and
  `stripDriftBlock(text)` are exported for advanced installer authors.
- **CI template + bulk reconcile** (Phase 29):
  - `cp install --ci` writes `.github/workflows/cp-audit.yml` from
    `templates/ci/cp-audit.yml.example` (sentinel `# cp:ci v1`,
    `fetch-depth: 0`, runs `cp audit --severity high` on every PR).
  - `cp reconcile --all` / `cp reconcile --phase <range>` for bulk
    SHA backfill. Range accepts 5 shapes (`5`, `5-8`, `5..8`, `5,7,9`,
    `5,7-9`). Composable with `--infer-shas`, `--accept`, `--dry-run`,
    `--no-commit`.
- **Post-commit tick-auto** (Phase 28): opt-in `cp.behavior.post_commit
  = "tick-auto"` — after each commit whose subject matches
  `cp(NN-MM[-slug]): ...` AND that touched ALL of the plan's
  `expected-key-files`, the post-commit hook auto-ticks the plan with
  a trailing `cp: tick plan NN-MM` commit. Off by default — it subtly
  mutates history. `lib/lifecycle.tryAutoTick()` is the pure decision
  helper.
- **Pre-commit hook smart shim** (Phase 27): new `bin/cp-hook.js` shim
  + `lib/hooks.js` installer. `cp install --hooks` / `--uninstall-hooks`.
  Smart-shim walks for `.planning/STATE.md` markers so monorepos with
  multiple cp projects work. Per-project dispatch via
  `cp.behavior.pre_commit` (`off` / `audit-high` (default) /
  `audit-any`). Sentinel `# cp:hook v1` for safe ownership detection.
  Handles both regular `.git` dirs AND `gitdir:` file format (worktrees).
- **Repair commands** (Phase 26): four new verbs to fix drift detected
  by `cp audit`:
  - **`cp reconcile <N>`** — `--infer-shas` fills missing `base-commit`
    / `end-commit` in PLAN/SUMMARY by inferring from `cp(NN-MM):` commit
    log; `--accept` rewrites a plan's `expected-key-files` from actual
    SUMMARY `key-files` (destructive — overwrites the plan to match
    code). Atomic commit per change.
  - **`cp supersede <planId> --by <newPlanId>`** — replaces plan
    checkbox with `[~]` and appends a "Superseded by" note to PLAN.md.
  - **`cp deviate <N> --summary "<text>"`** — appends a dated
    `## Deviation YYYY-MM-DD` block to phase PLAN.md.
  - **`cp scaffold-phase --continue`** — bypasses prior-summary gate
    (distinct from `--force`) and stamps a "Continues from phase N-1"
    note in the new PLAN.md.
  - `lib/audit-fix.js` FIXERS registry extended with reconcile-backed
    entries for `missing-base-commit` and `missing-end-commit` so
    `cp audit --fix` auto-applies them.
- **`cp audit --fix`** (Phase 25): classify findings into auto/manual/skip,
  apply auto-fixers with one atomic commit per fix. Flags `--max N`
  (default 5), `--severity high|medium|all`, `--dry-run`. Exit codes
  0 (clean) / 1 (any failed) / 2 (manual findings remain). Pluggable
  `FIXERS` registry — phase 26 appends reconcile-backed entries.
- **`complete-milestone` audit gate** (Phase 23): runs `cp audit` as
  a refuse-on-HIGH/MEDIUM gate before milestone close-out. `--audit-warn`
  downgrades MEDIUM to warning; `--no-audit` bypasses entirely (with
  mandatory stderr override notice). Fail-closed on audit error.
- **`cp audit`** (Phase 24): read-only consistency checker for `.planning/`.
  Nine built-in checks covering ticked-without-summary, summary-without-tick,
  base-commit/end-commit completeness, expected-vs-actual key-files drift,
  STATE.md staleness, and roadmap ↔ phase-dir alignment. Severity tiers
  (HIGH/MEDIUM/LOW), exit codes 0/1/2, flags `--json --strict --milestone
  <name> --phase <N> --quiet`. Read-only — `--fix` arrives in Phase 25.
- **`scaffold-phase` prior-summary gate** (Phase 22): refuses if the
  immediately preceding phase has ticked plans without SUMMARYs. `--force`
  override prints a mandatory stderr notice for audit transparency.
- **`write-summary` expected-key-files check** (Phase 21): warns when the
  files touched between base/end commits don't match what PLAN.md declared.
  `--strict-expected` upgrades to refusal, `--no-expected-check` opts out.
- **Derived STATE.md** (Phase 20): STATE.md current-position block is now
  regenerated from ROADMAP + git, with `cp state regen` to refresh.
- **SHA pinning** (Phase 17): every PLAN.md gets `base-commit` at scaffold;
  every SUMMARY.md gets `end-commit` at write. Foundation for drift
  detection.

### Docs

- New **`docs/drift-playbook.md`** — the canonical walkthrough of the
  prevent/detect/repair stack, including 5-step migration recipe for
  pre-v0.8 projects and a finding-id → repair-verb lookup table.
- README: new **"Drift defense (v0.8)"** section with 4-layer overview
  table linking to the playbook.

## v0.7.1 — Published to npm

- **Published to npm registry** for the first time. Install with
  `npm install -g context-planning` instead of cloning + `npm link`.
- README install section restructured: npm-first, source-as-secondary.
- Added npm version badge.
- New `docs/architecture.md` section: **Interaction with workflow providers**
  — documents the cp ↔ provider return-path contract (DESIGN.md,
  REVIEW-LOG.md, `key-decisions`, milestone roll-up) and the worked
  `/cp-new-milestone` example.
- `.planning/` is now tracked in git (cp dogfoods its own state layer so
  contributors can audit milestone/phase artifacts).

No code or behaviour changes.

## v0.7.0 — Design Capture (persistent design, review log, key-decisions hard-block)

**Milestone goal:** Close three persistence gaps surfaced after the v0.6
release retrospective: (1) architectural rationale was transient
(`MILESTONE-CONTEXT.md` deleted at close), (2) SP `subagent-driven-development`
review chains lived only in the orchestrator transcript, and (3) `key-decisions`
in plan SUMMARYs was silently optional, so empty arrays slipped through and
erased decision history.

**One milestone, one phase, three plans, one tag.**

### Highlights

- **Milestone DESIGN.md** — `cp scaffold-milestone` now creates
  `.planning/milestones/<slug>/DESIGN.md` from `templates/DESIGN.md` (a union
  ADR + SP-brainstorm template). Persistent home for architectural rationale.
- **Phase DESIGN.md** — `cp scaffold-phase` now emits a phase-tier `DESIGN.md`
  alongside `PLAN.md`. The `cp-plan-phase` skill gained a new **Step 3.5**
  that delegates to SP `brainstorming` (with a `path:` override) to populate
  it before planning starts.
- **MILESTONE-CONTEXT.md promote-on-close** — `cp complete-milestone` now
  promotes the transient brainstorm transcript into the milestone DESIGN.md
  as a "Brainstorm transcript" appendix, then deletes the transient file
  atomically.
- **REVIEW-LOG.md** — `cp scaffold-phase` now emits an append-only
  `REVIEW-LOG.md` (4th action). The `cp-execute-phase` skill gained a new
  **Step 4.5** that instructs the orchestrator to append one block per SP
  review cycle (verdict, findings, resolution). The cp aggregator counts
  entries via `reviewLogRefs[]` and `reviewCount`.
- **key-decisions hard-block** — `cp write-summary` now exits code **2**
  with the exact message:

  ```
  Error: 'key-decisions' is required and must have ≥1 entry. See spec at
  docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md
  ```

  if the input is missing `key-decisions` or has an empty array. Existing
  v0.6 SUMMARYs were backfilled (33 files) to satisfy the new constraint.
- **Aggregator extensions** — `aggregateSummaries(...)` now returns
  `phaseDesignRefs[]` (deduped per phase) and `reviewLogRefs[]` +
  `reviewCount` (entry tally) alongside existing fields.
- **No upstream SP changes** — All capture logic lives in cp templates, cp
  lib, and cp skill docs. SP `brainstorming` is invoked with a `path:`
  override; SP `subagent-driven-development` is unchanged (the review-log
  append is a skill-level orchestrator instruction).

### Internal

- New `lib/paths` helpers: `designFile`, `milestoneSlug`, `milestoneDir`,
  `milestoneDesignFile`, `reviewLogFile`.
- New `lib/milestone.promoteMilestoneContext(root, milestoneName, options)`
  helper (returns `{ action, path, after, contextPath }` or null).
- New `lib/milestone.ValidationError` (name + `code: 'EVALIDATION'`)
  thrown by `writeSummary` on invalid input.
- New `test/unit-design.js` (59 assertions across 8 sections).
- New `templates/DESIGN.md` and `templates/REVIEW-LOG.md`.
- New `scripts/backfill-v07-design.js` — mid-flight migration helper for
  milestones/phases scaffolded before v0.7 code existed.
- Coverage thresholds held: 89.37% lines / 77.63% branches.

### Migration

For existing cp projects upgrading to v0.7:

1. `npm install -g context-planning@0.7.0`
2. Existing milestones / phases do NOT get DESIGN.md retroactively. Use
   `scripts/backfill-v07-design.js` as a template (copy to your project and
   adapt the milestone slug + phase number) to backfill any in-flight work.
3. SUMMARY files with empty `key-decisions: []` will be rejected by the
   next `cp write-summary` call. Backfill them once: open each
   `.planning/phases/**/NN-MM-SUMMARY.md`, replace the empty array with at
   least one entry. Trivial mechanical plans can use:
   `key-decisions: ['mechanical edits only — no design decisions']`.
4. The default `cp doctor` continues to find SP via Copilot CLI marketplace
   (added in v0.4.5) and Claude Code (legacy) installs.

### Spec

`docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md` — full
ADR with Alternatives Considered (A-E) and Open Questions deferred to v0.8.

## v0.6.0 — Quality Wave (CI, dual-binary, command decomposition, coverage)

**Milestone goal:** Production-hardening pass — break up the
monolithic `bin/cp.js`, expose a `cplan` alias to dodge PowerShell's
built-in `cp`, ship multi-OS CI, and gate on coverage.

### Added

- **`cplan` binary alias.** `npm install -g context-planning` now creates
  both `cp` and `cplan` shims. PowerShell users hit by the built-in `cp →
  Copy-Item` alias should invoke `cplan` instead. Documented in README
  with a callout. Help text, `cp doctor` banner, and CLI usage all note
  the dual name.

- **`bin/commands/<name>.js` module layout.** Every command is now a
  standalone module exporting `{ name, run(args) }`. New registry
  (`bin/commands/index.js`) is the single source of truth for command
  lookup — 18 entries. `bin/cp.js` is now a 47-LOC thin dispatcher
  (down from 1218 LOC). Shared helpers extracted to
  `bin/commands/_helpers.js`. Test back-compat preserved
  (`module.exports = { normalizeArgv, main, registry }`).

- **GitHub Actions CI.** Matrix `{ ubuntu-latest, windows-latest } ×
  { node 20, node 22 }`. README gets a ci badge. `.github/skills/`,
  `.github/agents/`, and `.github/context-planning.md` gitignored
  (self-install dogfood artifacts) while `.github/workflows/` is
  committed.

- **`c8` coverage with threshold gate.** New `npm run coverage`
  (HTML+text, local) and `npm run coverage:ci` (lcov + json-summary +
  `--check-coverage --lines 85 --branches 75`). Coverage runs as a
  dedicated CI job after the matrix, uploads a `coverage-report`
  artifact (14-day retention). Current actual: 88.7% lines /
  78.2% branches. v0.7 should ratchet the gate.

### Fixed

- **Windows CI worktree-path comparison.** `cp worktree list` compared
  registry path against `git worktree list --porcelain` output via
  `path.resolve()`. Windows GitHub Actions runners expose temp paths
  via 8.3 short names (`RUNNER~1`) so the registry stored the short
  form while git returned the long form, and the lookup always missed.
  New `canonical()` wraps `fs.realpathSync.native` (which
  GetFinalPathNameByHandle-resolves on Windows) and `samePath()`
  lowercases on win32. Surfaces only on GitHub runners.

- **Cross-platform `unit-statusline.js`.** Dropped a `shell: 'cmd.exe'
  + 2>NUL` invocation that ENOENT'd on Ubuntu.

### Notes for users

- `cp install` re-runs are idempotent; if you have a globally installed
  `cp < v0.6.0`, run `npm install -g context-planning@latest` then
  `cp install copilot` (or your harness) again to get the `cplan` shim
  and updated skill stubs.
- No breaking changes; all 19 test suites (753 assertions) pass on
  Ubuntu+Windows × Node 20+22.

## v0.5.0 — Generic provider / harness detection

**Milestone goal:** Restructure provider detection from hardcoded literal
sentinel matching to a data-driven harnesses × providers cross-product, so
adding a new harness or provider is a config-only edit — no code changes.

### Added

- **Harnesses block** in `templates/config.json` — 4 harnesses (copilot,
  claude, cursor, aider) with `plugin_roots` using trailing-`*` glob specs.
  Each harness declares where its plugins live on disk.

- **`plugin_shape`** on each provider — `dir_name` + `required_subdirs`.
  Detection scans every harness's expanded plugin roots for a child dir
  matching the shape, verifying required subdirs exist.

- **`lib/detect.js`** (~250 LOC) — new detection engine:
  - `expandRoot()`: tilde expansion + trailing-`*` segment glob via
    `fs.readdirSync` (zero external deps).
  - `detectProviderAtAnyHarness()`: harnesses × plugin_shape cross-product
    with fallback to legacy `detect.any_of` literal sentinels.
  - `detectAllInstalled()`: full scan returning harness + provider reports.

- **`lib/merge.js`** (~150 LOC) — additive config merge engine:
  - `mergeCpDefaults()`: unions arrays (detect.any_of, plugin_roots),
    deep-merges objects with user-wins precedence, bumps schema version.
  - Never deletes user data.

- **Auto-heal merge** in `loadConfig()`: first v0.5 invocation in a
  brownfield project silently merges new upstream defaults (sentinels,
  harnesses, providers, schema bump) and writes back, with a stderr notice.

- **`cp config refresh [--dry-run]`** command: explicit re-sync of local
  config with upstream defaults. `--dry-run` reports planned changes
  without writing.

- **`cp doctor` rewrite**: sectioned output showing harnesses → providers →
  configured → roles → GSD compat. New flags: `--json` (machine-parsable),
  `--quiet` (minimal).

- **`echo-provider`** schema-test stub: proves the detection schema works
  with more than Superpowers. Install with `cp install echo-provider`,
  switch with `cp config set workflow_provider echo-provider`.

- **Schema version 2**: `cp.version` bumped from 1 to 2. Informational
  marker for future migrations.

### Changed

- `lib/provider.js` slimmed — detection logic moved to `lib/detect.js`.
  Back-compat exports (`detectProvider`, `existsAnywhere`) preserved as
  wrappers.

- `templates/config.json` Claude Code harness `plugin_roots` fixed: was
  `~/.claude/plugins/*/` (wrong — no marketplace wrapper); now
  `~/.claude/plugins/` (flat plugin dir).

### Fixed

- Brownfield projects init'd against v0.4.x no longer silently miss new
  upstream sentinels. The auto-heal merge adds them on first load.

### Tests

- 4 new test files: `unit-detect.js` (47), `unit-merge.js` (42),
  `dryrun-doctor.js` (29), `dryrun-config-refresh.js` (16).
- Total: **~760 assertions** across 19 test files (up from 592 in v0.4.5).
- All tests use `os.homedir()` monkey-patching for host isolation.

## v0.4.5 — Copilot CLI marketplace Superpowers detection

**Fix:** `cp doctor` now correctly detects Superpowers installed via the
Copilot CLI marketplace (`~/.copilot/installed-plugins/superpowers-marketplace/`).
Previously the default sentinel list only matched Claude Code install
layouts (`.claude/plugins/...` and `.github/skills/...`), so Copilot CLI
users silently fell through to the manual provider for every workflow
role.

The fix is purely additive — three new sentinels in
`templates/config.json` `cp.providers.superpowers.detect.any_of` cover
the upstream marketplace install path with broad-then-specific
granularity matching the existing Claude detection pattern. No changes
to detection logic in `lib/provider.js`; `existsAnywhere()` already
searched under `~/.copilot/`.

Users with existing `.planning/config.json` files retain their values
(the cp-block-merge in `loadConfig` is non-destructive); they should
remove any local `installed-plugins/...` sentinel override they added
manually to keep the config aligned with upstream defaults.

## [0.4.4] — 2026-05-20

Hotfix wave surfaced by the `/cp-map-codebase --force` dogfood against
v0.4.3. Closes two HIGH concerns recorded in `.planning/codebase/CONCERNS.md`.

### Fixed — `install/aider.js` no longer clobbers user `read:` entries

- **Bug**: v0.4.2 / v0.4.3 edited `.aider.conf.yml` with a regex-fenced
  block (`# >>> context-planning (cp) ...`). If the user already had a
  top-level `read:` list **outside** the fence, both lists survived and
  Aider's YAML parse used the later one — cp's block silently overrode the
  user's other `read:` entries.
- **Fix**: `patchAiderConfig` now parses `.aider.conf.yml` with the `yaml`
  module (already a direct dependency), appends `.aider/CP-CONTEXT.md` to
  the existing `read:` list (deduped), and re-emits valid YAML. User keys
  and `read:` entries are preserved.
- **Migration**: a legacy fenced block from v0.4.2 / v0.4.3 is auto-stripped
  on first run after upgrade; the entry is re-added to the proper `read:`
  list. Status returned is `migrated`.
- **Known limitation**: comments inside `.aider.conf.yml` are not preserved
  through `YAML.parse` → `YAML.stringify`. Keys and values survive; inline
  comments do not.

### Fixed — `lib/worktree.js` now owns the git shell-outs

- **Pattern violation**: in v0.4.3, `bin/cp.js cmdWorktreeCreate`,
  `cmdWorktreeList`, and `cmdWorktreeRemove` shelled out to `git worktree`
  directly with `spawnSync`/`execSync`. Every other shell-out in cp lives
  in a `lib/*` module so the CLI handler stays a thin dispatcher.
- **Fix**: extracted `runGitWorktreeAdd`, `runGitWorktreeRemove`, and
  `listGitWorktrees` into `lib/worktree.js`. The CLI handlers now call
  through the lib and keep responsibility only for printing and exit codes.

### Added — coverage

- `test/unit-installers.js` — +8 assertions across two new sections:
  user `read:` preservation (proves the v0.4.4 fix) and legacy fenced
  block migration (proves backward compatibility).
- `test/unit-worktree.js` — +6 assertions for the new shell-out helpers
  including `listGitWorktrees` against a real `git init`'d repo.

### Tests

- 751 assertions across 14 suites — `npm test` (was 737).

## [0.4.3] — 2026-05-20

Adds **`cp worktree {create,list,remove}`** — git-worktree management with
optional Superpowers provider hand-off. Closes the v0.4 roadmap item
"optional Superpowers worktree integration".

### Added — `cp worktree`

- **`cp worktree create <name> [--branch <b>] [--from <base>] [--path <dir>] [--phase <N>] [--no-create] [--use-provider]`** —
  runs `git worktree add <path> -b cp/<slug>` with sensible defaults (sibling
  directory `<repo>-<slug>`, branch `cp/<slug>`) and records the entry in
  `.planning/WORKTREES.md`. Auto-commits scoped to `WORKTREES.md` only (v0.3.3
  invariant preserved).
- **`cp worktree list [--json]`** — shows registered worktrees,
  cross-referenced against `git worktree list --porcelain` so you can see at
  a glance which entries still have their directory on disk.
- **`cp worktree remove <slug> [--force] [--no-commit]`** — runs
  `git worktree remove <path>` and drops the registry entry. Refuses (exit 1)
  if git refuses (e.g. dirty worktree) unless `--force` is passed.
- **`--use-provider` opt-in delegation.** When set, cp resolves the
  configured workflow provider's `worktree` role (Superpowers maps it to
  `using-git-worktrees`) and emits a hand-off line instead of running git
  itself. The harness picks up the skill name and the prepared
  `git worktree add` invocation. The cp-native path remains the default —
  this is an opt-in for users who want their provider's worktree skill in
  charge.

### Added — `lib/worktree.js`

- Pure helpers: `slugify`, `defaultWorktreePath`, `defaultBranchName`,
  `parseGitWorktreeList`, `renderWorktreesDoc`, `parseWorktreesDoc`,
  `addRegistryEntry`, `removeRegistryEntry`, `listRegistry`, `isoDay`.
- Returns the same `{actions, ...}` shape as `lib/inbox.js` and the rest of
  the lifecycle ops so the CLI routes writes through `writeBatch` for free
  (atomic + transactional, per v0.3.2).

### Added — coverage

- **`test/unit-worktree.js`** — 56 new assertions: slugify edge cases,
  default path / branch helpers, `git worktree list --porcelain` parser
  with detached + bare entries, registry doc round-trip, parse-tolerates-noise,
  add/remove/dedupe behaviour, end-to-end CLI (`create` → `list` →
  `list --json` → `remove`), `--no-create` skip path, all usage error paths
  (no subcommand, bad subcommand, missing name/slug).
- Test totals: **737 assertions** across 14 suites, all green.

### Notes

- The cp-native path uses `git worktree add` with `-b cp/<slug>`. If your
  workflow needs a different branch convention, pass `--branch <name>`.
- `cp worktree list --json` shape: `{ registered: [...], git: [...] }` —
  `registered` is what `.planning/WORKTREES.md` knows about, `git` is what
  `git worktree list --porcelain` reports. The two should agree; when they
  drift, run `cp worktree list` to see the `on disk` / `missing` markers.

## [0.4.2] — 2026-05-20

Adds **`cp install cursor`** and **`cp install aider`** — two new harness
installers that bring the cp slash-command surface into Cursor IDE and
Aider, respectively. No changes to existing copilot / claude installers.

### Added — Cursor installer (`cp install cursor`)

- Installs each `commands/cp/<name>.md` as a `.cursor/rules/cp-<name>.mdc`
  rule file. Each rule has `alwaysApply: false` so it shows up in Cursor's
  rule picker / `@-attach` autocomplete without bloating every chat
  context. The source command's `description:` is hoisted into the Cursor
  frontmatter so the rule picker shows it inline.
- Installs an ambient `.cursor/rules/context-planning.mdc` (`alwaysApply:
  true`) mirroring the routing instructions we install for Copilot CLI's
  context file. This tells Cursor what cp is and how to route `/cp-*` /
  `cp-*` user invocations to the matching rule.
- Supports `CP_INSTALL_SCOPE=user` for `~/.cursor/rules/` install.
- Inherits the v0.3.4 collision protection: `--force` to clobber local
  edits, exit code 3 when local files are kept.

### Added — Aider installer (`cp install aider`)

- Aider has NO per-project slash-command or rule extension mechanism — its
  slash commands are hard-coded Python. So cp installs a read-only context
  briefing the user can pull into chat instead:
  - **`.aider/CP-CONTEXT.md`** — generated overview of the cp slash
    commands + a CLI cheat-sheet, with rules for when to invoke `cp`.
  - **`.aider/cp-commands/<name>.md`** — full per-command body, attachable
    via Aider's `/read .aider/cp-commands/<name>.md` chat command.
  - **`.aider.conf.yml`** — patched (or created) to include
    `read: - .aider/CP-CONTEXT.md` via a fenced
    `# >>> context-planning (cp)` block. Idempotent re-runs are detected.
    Hand-written keys in `.aider.conf.yml` (other YAML) are preserved.
- User asks Aider in chat (e.g. "use cp to make a new milestone called
  'foo'"); Aider sees the briefing and invokes `cp scaffold-milestone foo`
  via shell.

### Added — coverage

- **`test/unit-installers.js`** — 50 new assertions: `cursor.buildRule`
  frontmatter synthesis (with + without source frontmatter), e2e cursor
  install + re-run + hand-edit-refuse + `--force` clobber,
  `aider.buildContextBriefing` shape, `aider.patchAiderConfig`
  create/idempotent/preserve-user-edits, e2e aider install, `cp install
  pyramid` unknown-harness error path lists all four harnesses.
- Test totals: **681 assertions** across 13 suites, all green.

### Notes

- Both installers use the same `install/common.js writeFileSafe` helper
  shipped in v0.3.4, so they get collision protection + identical-detect
  for free.
- This closes the v0.4 README roadmap items "Cursor and Aider installers".

## [0.4.1] — 2026-05-20

Adds **`cp statusline`** — a one-line prompt-friendly status indicator for
shell PS1, Starship, tmux, etc. Same-day point release on the v0.4.0
inbox-triage line; no breaking changes.

### Added — `cp statusline`

- **`cp statusline [--format <fmt>] [--json] [--no-color]`** — prints a
  compact status line resolved from `.planning/ROADMAP.md` +
  `lifecycle.statusReport`. Default output looks like
  `cp ▸ v0.5 ▸ 01-mvp 1/3 ▸ 01-02` (current milestone → active phase
  slug → done/total → next plan id). Renders ANSI colors when stdout is a
  TTY; suppresses them under `--no-color` or `NO_COLOR=1`.
- **Silent outside a cp project.** When called outside any git repo, or
  inside a git repo with no `.planning/ROADMAP.md`, statusline exits 0 with
  no output / no stderr — safe to drop into a shell prompt that runs every
  keystroke.
- **`--format <fmt>` custom template.** Tokens: `%M` (milestone), `%P`
  (phase slug, e.g. `01-mvp`), `%D` (done/total, e.g. `1/3`), `%N` (next
  plan id, e.g. `01-02`), `%B` (current git branch). Use for Starship /
  tmux / Powerline integrations.
- **`--json` for harness consumption.** Returns a stable shape with
  `milestone`, `milestoneStatus`, `phase: { num, name, label, done, total }`,
  `nextPlan: { phaseNum, phaseName, planId, desc }`, `branch`.

### Added — coverage

- **`test/unit-statusline.js`** — 28 new assertions: silent-outside-project
  invariants, milestone+phase rendering, `--json` shape, `--format` token
  substitution, `--no-color` ANSI suppression, `NO_COLOR` env var support,
  `%B` branch resolution, empty-milestone fallback.
- Test totals: **631 assertions** across 12 suites, all green.

### Notes

- Example PS1 integration (bash): ``PS1='$(cp statusline 2>/dev/null) \w \$ '``
- Example Starship config (`~/.config/starship.toml`):
  ```toml
  [custom.cp]
  command = "cp statusline --no-color"
  when = "test -f .planning/ROADMAP.md"
  format = "[$output]($style) "
  ```

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

[Unreleased]: https://github.com/shushenglihotmail/context-planning/compare/v0.4.4...HEAD
[0.4.4]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.4
[0.4.3]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.3
[0.4.2]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.2
[0.4.1]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.1
[0.4.0]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.4.0
[0.3.4]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.4
[0.3.3]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.3
[0.3.2]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.2
[0.3.0]: https://github.com/shushenglihotmail/context-planning/releases/tag/v0.3.0
[0.2.0]: https://github.com/shushenglihotmail/context-planning/compare/fb25af1...3607082
[0.1.0]: https://github.com/shushenglihotmail/context-planning/commit/fb25af1
