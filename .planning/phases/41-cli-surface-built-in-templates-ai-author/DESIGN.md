---
phase: "41"
milestone: v1.0 Workflow Engine
status: proposed
created: 2026-05-25
updated: 2026-05-25
deciders: []
supersedes: []
superseded_by: null
---

# Design: Phase 41: CLI surface + built-in templates + AI authoring

## Status

Proposed.

## Context

Phase 40 shipped the three core library modules (`lib/workflow.js`, `lib/runtime.js`, `lib/custom.js`) — 200 + assertions across `unit-workflow.js` (75), `unit-custom.js` (58), and `integration-runtime.js` (67). All public interfaces are stable; the runtime works end-to-end for all three binding tiers (`milestone`, `phase`, `custom`).

What's missing for v1.0:
1. **End-user CLI surface.** No user-facing way to invoke the engine — `cp run`, `cp workflow ls/show/validate/...` don't exist yet.
2. **Built-in templates.** `lib/workflow.resolveTemplate()` looks for `templates/workflows/<name>.yaml` as a fallback after `.planning/workflows/<name>.yaml`. The directory and the three reference templates (`dev`, `debug`, `quick`) don't exist yet — every test today uses absolute paths to fixtures.
3. **AI authoring.** `cp workflow brainstorm` should delegate to the provider's brainstorm skill to design a new workflow interactively (fulfils the milestone's "by people or AI agent" requirement).

This phase is the user-visible v1.0 surface. Phase 42 is documentation + the actual npm publish.

## Decision

Add **two new `cp` sub-command families** to `bin/cp.js`, plus ship **three built-in templates** and one **provider-delegating sub-command**:

| Plan | Surface | Backed by |
|---|---|---|
| 41-01 | `cp run` family: `run`, `resume`, `retry`, `abandon`, `mark-complete`, `status` | `lib/runtime.js` + `lib/custom.js` |
| 41-02 | `cp workflow` static family: `ls`, `show`, `validate`, `diagram`, `init`, `new`, `import` + `templates/workflows/{dev,debug,quick}.yaml` | `lib/workflow.js` + new `templates/workflows/` dir |
| 41-03 | `cp workflow brainstorm` (provider delegation) + dryrun/integration tests for the full CLI + per-command help | `lib/provider.js` (existing) + new test files |

All sub-commands are **thin wrappers** over Phase 40's lib modules. The CLI layer's responsibilities are:
- argv parsing (existing `bin/cp.js` patterns)
- error → exit-code mapping
- stdout formatting (human-friendly + `--json` where it makes sense)
- delegating to lib functions for all I/O and state mutation

The CLI MUST NOT duplicate validation, state-shape knowledge, or instruction formatting — all of that lives in `lib/`.

## Consequences

### Positive
- v1.0 becomes invocable from a fresh project: `cp run quick "fix typos in README"` works out of the box (built-in `quick.yaml`).
- `cp workflow validate path/to/foo.yaml` is the smoke-test before merging a new template — fast feedback for users authoring custom workflows.
- `cp workflow brainstorm` makes the "AI-authorable" promise real — users describe a workflow conversationally, get a YAML template back.
- All three built-in templates double as **canonical examples** in the README/docs (Phase 42).

### Negative
- `bin/cp.js` already has many sub-commands; adding ~14 more grows the file. Mitigation: factor `cp run` and `cp workflow` into dedicated dispatcher functions in `bin/cp.js` (one block per family), kept under 80 lines each.
- Per-command help text is a non-trivial amount of static prose to maintain. Mitigation: centralize in one help map at top of each dispatcher.
- `cp workflow diagram` emits Mermaid syntax — we're betting on Mermaid as the de-facto diagram format. Acceptable risk; users without Mermaid renderers just see source text.

### Neutral
- `--plan-only` for `cp run` is just `dryRun: true` passed through to `runtime.startRun` — zero net new logic in this phase, just a flag.
- No changes to existing cp commands. This is purely additive.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  bin/cp.js (existing dispatcher)                                 │
│    ├── cp run <subcommand>          (NEW — plan 41-01)           │
│    │     ├── run <workflow> [name] [--plan-only]                 │
│    │     ├── resume <slug>                                       │
│    │     ├── retry <slug> <phase-id>                             │
│    │     ├── abandon <slug>                                      │
│    │     ├── mark-complete <slug> <phase-id> [< summary.md]      │
│    │     └── status [slug]                                       │
│    │           │                                                 │
│    │           └─▶ lib/runtime.js                                │
│    │                                                             │
│    ├── cp workflow <subcommand>     (NEW — plan 41-02 + 41-03)   │
│    │     ├── ls                                                  │
│    │     ├── show <name>                                         │
│    │     ├── validate <name-or-path>  [--strict]                 │
│    │     ├── diagram <name-or-path>                              │
│    │     ├── init                    (creates .planning/workflows/)│
│    │     ├── new <name>              (scaffold from template stub)│
│    │     ├── import <path>           (copy into .planning/workflows/)│
│    │     └── brainstorm              (NEW — plan 41-03)          │
│    │           │                                                 │
│    │           └─▶ lib/workflow.js + lib/provider.js             │
│    │                                                             │
│    └── (existing cp subcommands unchanged)                       │
│                                                                  │
│  templates/workflows/  (NEW — plan 41-02)                        │
│    ├── dev.yaml                                                  │
│    ├── debug.yaml                                                │
│    └── quick.yaml                                                │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### Plan 41-01: `cp run` family

**New files:** none (handlers added to `bin/cp.js`).

**Modified files:** `bin/cp.js` (add `runCmd()` dispatcher + sub-handlers).

**Sub-command contracts:**

| Command | Args | Behavior | Exit codes |
|---|---|---|---|
| `cp run <workflow> [name]` | `--plan-only` flag | `runtime.startRun(workflow, {name, dryRun: planOnly})`; prints `firstInstruction` to stdout (or full wave plan if `--plan-only`). Prints `slug: <slug>` to stderr. | 0 on success; 2 on validation error; 3 on missing template |
| `cp run resume <slug>` | none | `runtime.resumeRun(slug)`; prints current-wave instruction | 0 success; 4 if `Run not found:` |
| `cp run retry <slug> <phase-id>` | none | `runtime.retryPhase(slug, phaseId)`; prints re-emitted wave instruction | 0 success; 4 not found; 5 phase not in run |
| `cp run abandon <slug>` | `--yes` to skip confirm | `runtime.abandonRun(slug)`; prints `Abandoned: <slug>` | 0 success; 4 not found; 1 user declined |
| `cp run mark-complete <slug> <phase-id>` | reads summary from stdin | `runtime.markPhaseComplete(slug, phaseId, stdin)`; if `nextInstruction` present, prints it to stdout; if `doneAfter`, prints `Run complete: <slug>` | 0 success; 4 not found; 5 phase not in current wave |
| `cp run status [slug]` | `--json` flag | If slug given: dump that run's state (binding, current_wave, completed, last_activity). If no slug: list all active runs across all three tiers. | 0 always |

**Stdout/stderr discipline:**
- **stdout** = instruction text or `--json` payload (machine-consumable).
- **stderr** = human-facing logging (`slug: ...`, `Wave 2 of 5 started`, confirmation prompts).
- Existing cp convention: `--json` flag where applicable; otherwise plain text.

### Plan 41-02: `cp workflow` family + built-in templates

**New files:**
- `templates/workflows/dev.yaml` — milestone-bound full feature cycle (5 phases: brainstorm → research-prior-art ∥ research-constraints → plan → execute → review).
- `templates/workflows/debug.yaml` — custom-bound investigation cycle (5 phases: collect-symptoms → repro → plan → fix → verify).
- `templates/workflows/quick.yaml` — custom-bound minimal (3 phases: discuss → execute → verify).
- `bin/cp.js` extensions (no new file; sub-handlers added).

**Modified files:** `bin/cp.js`.

**Sub-command contracts:**

| Command | Args | Behavior |
|---|---|---|
| `cp workflow ls` | `--json` | Lists templates from BOTH `.planning/workflows/` (project) and `templates/workflows/` (built-in), tagged with source. |
| `cp workflow show <name>` | none | Pretty-prints the resolved template (yaml round-trip + clear header showing source path). |
| `cp workflow validate <name-or-path>` | `--strict` to non-zero on warnings | `workflow.loadTemplate()` + `workflow.validate()`; prints errors and warnings; exits 2 on errors, 0 otherwise (or 2 in `--strict` if warnings present). |
| `cp workflow diagram <name-or-path>` | `--format mermaid` (default; only option for v1.0) | Emits Mermaid flowchart syntax to stdout: `flowchart TD\n  brainstorm --> research-a\n  ...`. |
| `cp workflow init` | none | Creates `.planning/workflows/` directory + `.gitkeep`. Idempotent. |
| `cp workflow new <name>` | `--from <built-in>` to copy a built-in as starter | Creates `.planning/workflows/<name>.yaml` from a stub (or copy of a built-in). Refuses to overwrite. |
| `cp workflow import <path>` | `--name <override>` | Copies an external template into `.planning/workflows/`; runs validate first. |

**Built-in template content notes:**
- `dev.yaml` MUST use `binds_to: milestone` and reference cp's existing roles where natural (e.g. `role: implementer`, `skill: subagent-driven-development`). It is the recommended starting point for the existing "develop feature in milestones" workflow we have today.
- `debug.yaml` MUST use `binds_to: custom` so debugging sessions don't pollute ROADMAP.
- `quick.yaml` MUST use `binds_to: custom`. Three phases only. The simplest possible runnable workflow.
- All three include a `principles:` block (at least 2 entries) demonstrating the new top-level discipline mechanism.
- All three include `defaults:` to show the override pattern.

### Plan 41-03: `cp workflow brainstorm` + tests + docs

**New files:**
- `test/dryrun-workflow-cli.js` — exercises all `cp workflow` sub-commands' exit codes + stdout shape (no actual mutation beyond temp dirs). ~25 assertions.
- `test/dryrun-run-cli.js` — exercises all `cp run` sub-commands. ~20 assertions.
- `test/integration-run-cli.js` — end-to-end: `cp run quick foo` → state created → `cp run mark-complete foo discuss < summary.md` → loop to completion. ~10 assertions.

**Modified files:** `bin/cp.js` (brainstorm handler), `package.json` (wire all 3 new tests into npm test chain).

**`cp workflow brainstorm` contract:**

- Args: `--workflow <name>` (optional; sets the workflow name in the YAML), `--out <path>` (default: prompt or `.planning/workflows/<name>.yaml`).
- Behavior:
  1. Read the provider config via `lib/provider.js` (existing). Resolve the `brainstorm` role to a skill name.
  2. If the resolved skill is `manual`: print a guided template (a YAML skeleton with comments asking the user to fill in each phase) and exit 0. Suggest the user edit the file and re-run `cp workflow validate`.
  3. Otherwise: emit a structured prompt to stdout — `Designing a new workflow. Please invoke the {provider} brainstorm skill with this context: <context>` and EXIT (do not loop). The harness picks it up, runs the skill, and either writes the YAML or hands it to the user. The CLI's job here is to provide the right starting context, not to drive an interactive session inside the cp process.
- This matches `cp`'s existing pattern of emitting instructions for the harness to consume (same model as `cp run` itself).

**Tests:**

- **`dryrun-workflow-cli.js`** — covers `ls`, `show`, `validate` (happy + error), `diagram` (smoke + cycle rejection), `init`, `new`, `import` (happy + duplicate-name error). ~25 assertions. Each `cp workflow X` invocation goes through `spawnSync('node', ['bin/cp.js', 'workflow', ...])` in a temp project (same pattern as existing `test/dryrun-scaffold-phase.js`).
- **`dryrun-run-cli.js`** — covers `run` (custom + dry-run), `status`, `resume`, `retry`, `abandon`, `mark-complete`. ~20 assertions. Uses the new built-in `quick.yaml` template as test subject.
- **`integration-run-cli.js`** — single end-to-end happy path: temp project → `cp run quick foo` → `cp run mark-complete <slug> discuss` ×N → `cp run status` shows `done`. ~10 assertions.

## Data Flow

### `cp run quick "fix typo"`

1. User: `cp run quick "fix typo"`.
2. `bin/cp.js` parses argv, dispatches to `cmdRunRun()`.
3. Handler: `runtime.startRun('quick', {name: 'fix typo'})` (calls `lib/runtime.js`).
4. `lib/runtime.js`: `workflow.loadTemplate('quick')` → `workflow.resolveTemplate('quick')` finds `templates/workflows/quick.yaml` (built-in).
5. Runtime computes waves, calls `custom.createRun('quick', 'fix typo')` → slug `2026-05-25-fix-typo`.
6. Runtime returns `{slug, binding: 'custom', firstInstruction, ...}`.
7. CLI prints `slug: 2026-05-25-fix-typo` to stderr, `firstInstruction` to stdout.
8. Agent reads the instruction, does the discuss phase, writes summary.
9. User/agent: `cp run mark-complete 2026-05-25-fix-typo discuss < summary.md`.
10. `cmdRunMarkComplete()` reads stdin, calls `runtime.markPhaseComplete(...)`. Loop continues until `doneAfter: true`.

### `cp workflow validate dev`

1. `bin/cp.js` → `cmdWorkflowValidate('dev')`.
2. `workflow.loadTemplate('dev')` → resolves built-in.
3. `workflow.validate(template)` → `{ok, warnings, errors}`.
4. Print errors prefixed with `error:`, warnings with `warning:`. Exit 0 if `ok` (and no warnings in `--strict` mode), 2 otherwise.

### `cp workflow brainstorm --workflow my-flow`

1. `bin/cp.js` → `cmdWorkflowBrainstorm({workflow: 'my-flow'})`.
2. `provider.resolveSkill('brainstorm')` → e.g. `'brainstorming'` (Superpowers default).
3. Print to stdout the structured "brainstorm context" — workflow purpose, suggested questions, output target path. Print to stderr `Invoke skill: brainstorming with the context above. Write the result to .planning/workflows/my-flow.yaml.`
4. Exit 0. Harness takes over.

## Error Handling

Mirrors the milestone DESIGN.md "Error Handling" table. CLI layer adds:

| Failure mode | CLI behavior |
|---|---|
| Lib throws `Run not found: <slug>` | Print `error: run "<slug>" not found. Available runs:` + `cp run status` output, exit 4 |
| Lib throws `Template not found: <name>` | Print `error: template "<name>" not found. Searched: <paths>` + `cp workflow ls` suggestion, exit 3 |
| Lib throws validation errors from `runtime.startRun` | Print all errors + `cp workflow validate <name>` suggestion, exit 2 |
| `cp run abandon` without `--yes` | Prompt `Abandon run <slug>? [y/N]:`; exit 1 if user declines |
| `cp workflow new <name>` with existing file | Print `error: <path> already exists. Use --force to overwrite.`, exit 6 |
| Stdin-required command (`mark-complete`) with empty stdin in interactive TTY | Print `error: summary required on stdin. Pipe a file: cp run mark-complete <slug> <phase> < summary.md`, exit 5 |

All destructive ops (`abandon`, `import --overwrite`, future `prune`) honor cp's existing `safety.always_confirm_destructive` config.

## Testing Strategy

| Test file | Plan | Approx assertions |
|---|---|---|
| `test/dryrun-run-cli.js` | 41-01 (created in 41-03) | ~20 |
| `test/dryrun-workflow-cli.js` | 41-02 (created in 41-03) | ~25 |
| `test/integration-run-cli.js` | 41-03 | ~10 |
| Built-in template smoke (within 41-02): every shipped template must `validate` ok=true | 41-02 | ~3 per template |

**Coverage target:** ≥80% per new file (matches cp's c8 threshold).
**Cross-platform:** Ubuntu + Windows via existing CI matrix. Stdin-piping tests need a small Windows-compatible helper (read `test/dryrun-write-summary.js` for the pattern).

## Alternatives Considered

### Option A — Single `cp workflow` umbrella command (no separate `cp run`)

**Pros:** Smaller surface (one verb).
**Cons:** Conflates two distinct conceptual domains — *template management* (ls/show/validate/diagram/init/new/import/brainstorm) and *run execution* (run/resume/retry/abandon/mark-complete/status). `cp workflow run` would feel awkward versus `cp run`. **Verdict:** rejected; separate verbs for separate domains.

### Option B — Ship templates as fetched-from-registry at install time

**Pros:** No npm package bloat; central template repository.
**Cons:** Breaks offline install; requires a registry to maintain. **Verdict:** rejected for v1.0; revisit at v1.1 (per milestone DESIGN.md Open Question).

### Option C — Interactive `cp workflow brainstorm` REPL inside cp

**Pros:** No harness dependency for AI authoring.
**Cons:** Requires cp to load and invoke LLM SDKs — explicit non-goal (cp delegates all model interaction to the harness). **Verdict:** rejected; emit-and-trust matches every other cp command.

### Option D — Use JSON Schema as the validation source-of-truth

**Pros:** Standard tooling, auto-generated docs, editor IntelliSense.
**Cons:** Adds a runtime dep (`ajv` or similar); current bespoke validate() is already comprehensive and tested. **Verdict:** defer; can add JSON Schema in v1.1 as a publication artifact without changing the runtime.

## Open Questions

- [ ] Should `cp workflow diagram` accept a `--format dot` (Graphviz) option in addition to mermaid? **Lean:** v1.0 ships mermaid only; add formats on demand.
- [ ] Should `cp run mark-complete` auto-detect the phase id from the agent's working state (e.g. cwd matches a phase's expected path) when omitted? **Lean:** no — explicit phase-id required for v1.0; auto-detect is a v1.1 ergonomic improvement.
- [ ] Should built-in templates ship in `templates/workflows/` (matching `templates/*.md` placement) or in a sibling `workflows/` at package root? **Lean:** `templates/workflows/` for consistency with existing planning templates and zero changes to `package.json files`.

## References

- `.planning/milestones/v1-0-workflow-engine/DESIGN.md` — milestone-tier source of truth (CLI surface specified in "Components > bin/cp.js" section).
- `.planning/phases/40-core-engine-custom-tier/40-01-SUMMARY.md` / `40-02-SUMMARY.md` / `40-03-SUMMARY.md` — lib interfaces this phase wraps.
- `bin/cp.js` — existing CLI dispatcher; the patterns to follow for argv parsing + sub-command dispatch are all here.
- `lib/provider.js` — existing role→skill resolver; reused for the `brainstorm` sub-command.
- `test/dryrun-scaffold-phase.js` — existing pattern for testing CLI sub-commands via `spawnSync` in a temp project.
- `test/dryrun-write-summary.js` — existing pattern for stdin-piping tests.
