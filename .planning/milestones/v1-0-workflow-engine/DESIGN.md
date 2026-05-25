---
milestone_slug: "v1-0-workflow-engine"
milestone: v1.0 Workflow Engine
status: proposed
created: 2026-05-24
updated: 2026-05-24
deciders: []
supersedes: []
superseded_by: null
---

# Design: v1.0 Workflow Engine

## Status

Proposed (awaiting user spec-review and phase breakdown).

## Context

Today, cp drives all work through a single fixed lifecycle: `cp scaffold-milestone` → `cp scaffold-phase` → provider's brainstorm/plan/execute/review skills (configured globally as `workflow_provider` in `.planning/config.json`). The 11-role mapping is project-wide; every milestone runs through the same skill sequence.

This model is excellent for feature development but rigid for other work shapes:

- **Debugging** wants `collect-symptoms → repro → plan → fix → verify`, not the dev cycle.
- **Quick tasks** want `discuss → execute → verify` without a full milestone.
- **Investigations / spikes / audits** want ad-hoc state that doesn't pollute the roadmap.
- **Specialist phases** want a different agent persona ("act as a business planner") or model tier than the rest of the cycle.

Forces driving v1.0:

1. **Reusability** — workflow shapes (dev, debug, quick) should be defined once, named, and invoked anywhere.
2. **Customizability** — users (or AI) should be able to author project-specific workflows without forking cp.
3. **Portability** — workflow templates should travel between projects/harnesses as single files.
4. **Separation of concerns** — templates declare intent; cp orchestrates state; harnesses execute mechanism.
5. **No regression** — existing milestone/phase users keep working unchanged; this is additive.
6. **"Simple and concise"** — minimum viable schema; defer power features to later milestones.

## Decision

Introduce **YAML workflow templates** as a new top-level abstraction. A template describes a **directed acyclic graph (DAG)** of phases; cp's runtime walks the DAG, emits per-wave instructions to the running agent, and tracks state in one of three first-class state tiers (`milestone | phase | custom`). The harness owns process structure, parallelism mechanism, and model resolution.

Three reference templates ship with cp: `dev`, `debug`, `quick`. A 14-command CLI surface covers running, inspecting, authoring, and importing templates.

## Consequences

### Positive

- **Reusable workflow shapes** — `dev` / `debug` / `quick` invocable from any project.
- **Customizable per-project** — local `.planning/workflows/*.yaml` overrides built-ins.
- **AI-authorable** — `cp workflow brainstorm` designs new workflows via the provider's brainstorm skill (fulfils original "by people or AI agent" requirement).
- **No state-shape forcing** — `custom` tier accommodates work that isn't milestone-shaped (debug sessions, investigations).
- **Portable templates** — no harness/model coupling in templates; one file runs under Copilot, Claude, Aider, etc.
- **Backward compatible** — existing `cp scaffold-milestone`/`cp scaffold-phase` unchanged; users opt into workflows.
- **Discoverability via convention** — directory IS the registry (`.planning/workflows/`, `.planning/custom/`); no separate index file to maintain.

### Negative

- **Three state tiers to learn** — slightly more conceptual surface than today's single milestone tier.
- **DAG readability** — `depends_on:` graph isn't visually obvious; mitigated by tooling (`cp workflow show / diagram`) but adds a tool to learn.
- **YAML foot-guns** — indentation errors, Norway problem; mitigated by `cp workflow validate` + future JSON Schema.
- **Trust-based dispatch** — cp emits instructions but can't *force* the harness to honor `model:` or parallelism hints; same trust model as today's skill-loading.

### Neutral

- **`model:` field is advisory today** — Copilot/Claude don't support per-call dynamic model selection yet; field is a placeholder until harnesses expose APIs.
- **CLI surface grows by ~14 commands** — substantial but each is thin (state read/write + instruction emission).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Template (.planning/workflows/dev.yaml or built-in)             │
│  ─ YAML, DAG via depends_on, per-phase: role/model/skill/...     │
└──────────────────────────────────────────────────────────────────┘
                              │ parsed by
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  lib/workflow.js                                                 │
│  ─ load / validate / topological-sort / compute wave plan        │
└──────────────────────────────────────────────────────────────────┘
                              │ consumed by
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  lib/runtime.js  (the wave-walker)                               │
│  ─ for each wave, emit instruction to running agent              │
│  ─ track completion in the binding's state file                  │
└──────────────────────────────────────────────────────────────────┘
            │                    │                     │
            ▼                    ▼                     ▼
┌─────────────────┐  ┌───────────────────┐  ┌─────────────────────┐
│ milestone tier  │  │  phase tier       │  │  custom tier        │
│ ROADMAP.md +    │  │  appends to       │  │  .planning/custom/  │
│ STATE.md +      │  │  active phase's   │  │  <slug>/STATE.yaml  │
│ phases/NN/      │  │  PLAN/SUMMARY     │  │  + NN-<id>.md       │
└─────────────────┘  └───────────────────┘  └─────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Running agent (Copilot / Claude / …)                            │
│  ─ honors role, model-level, parallelism hints                   │
│  ─ uses harness-native Task tool for subagents                   │
│  ─ writes phase output to cp-determined path                     │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### `lib/workflow.js` — Template loader, validator, wave planner

- **Purpose:** parse YAML template, validate schema + DAG (no cycles, no dangling deps, topo-order warning), compute execution waves (BFS over the DAG).
- **Public interface:**
  - `loadTemplate(nameOrPath) → {meta, phases, defaults}`
  - `validate(template) → {ok, warnings[], errors[]}`
  - `computeWaves(template) → [[phase, phase], [phase], …]`
  - `resolveTemplate(name) → path` (project-local first, then built-in)
- **Dependencies:** `yaml` (existing dep), `lib/paths.js`.

### `lib/runtime.js` — Wave-walker and instruction emitter

- **Purpose:** drive a workflow run end-to-end. For each wave, emit an instruction string to stdout (consumed by the running agent). Track state in the binding tier's state file.
- **Public interface:**
  - `startRun(template, opts) → {slug, binding, firstWaveInstruction}`
  - `resumeRun(slug) → {currentWave, instruction}`
  - `markPhaseComplete(slug, phaseId, summaryText)`
  - `retryPhase(slug, phaseId)`
  - `abandonRun(slug)`
- **Dependencies:** `lib/workflow.js`, `lib/lifecycle.js` (for milestone tier), `lib/custom.js`.

### `lib/custom.js` — Custom-tier state management

- **Purpose:** lifecycle of `.planning/custom/<slug>/` directories: create, list, read STATE.yaml, append phase summary file, update status.
- **Public interface:**
  - `createRun(workflow, name) → slug`
  - `listRuns() → [{slug, workflow, status, started, lastActivity}]`
  - `readState(slug) → STATE.yaml object`
  - `writeState(slug, patch)`
  - `writePhaseSummary(slug, phaseId, content)`
  - `pruneAbandoned(daysOld)`
- **Dependencies:** `lib/paths.js`, `yaml`.

### `bin/cp.js` — CLI handlers (new sub-commands)

Sub-commands added (thin wrappers over the lib functions):

- `cp run <workflow> [name]` — start run
- `cp run --plan-only <workflow>` — dry-run, prints wave plan
- `cp run resume <slug>` / `status [slug]` / `retry <slug>` / `abandon <slug>`
- `cp workflow ls / show / validate / diagram / init / new / import`
- `cp workflow brainstorm` — delegates to provider's brainstorm skill

### `templates/workflows/` — Reference templates

Three built-in templates shipped in the npm package:

- `dev.yaml` — full feature cycle, `binds_to: milestone`
- `debug.yaml` — investigation cycle, `binds_to: custom`
- `quick.yaml` — minimal three-phase cycle, `binds_to: custom`

## Data Flow

### `cp run dev "v1.5 Search"` (milestone-bound)

1. CLI parses args, calls `runtime.startRun('dev', {name: 'v1.5 Search'})`.
2. `workflow.loadTemplate('dev')` resolves project-local first, then built-in.
3. `workflow.validate()` checks schema + DAG; aborts on error, warns on topo-order.
4. `workflow.computeWaves()` returns `[[brainstorm], [research-prior-art, research-constraints], [plan], [execute], [review]]`.
5. Runtime calls `lifecycle.scaffoldMilestone('v1.5 Search')` + `scaffoldPhase` per YAML phase (mapping YAML phase → cp phase).
6. STATE.md set to the first phase. Runtime emits Wave 1 instruction to stdout for the agent to execute.
7. Agent completes Wave 1, calls `cp run mark-complete` (or cp detects via SUMMARY.md presence at the canonical path).
8. Runtime advances to Wave 2, emits parallel-batch instruction listing both research phases. Agent dispatches in parallel using its harness's Task tool.
9. Loop until all waves complete; `cp complete-milestone` invoked automatically.

### `cp run debug "auth bug"` (custom-bound)

1. CLI parses args, calls `runtime.startRun('debug', {name: 'auth bug'})`.
2. `workflow.loadTemplate('debug')` resolves to built-in (no project override).
3. `custom.createRun('debug', 'auth bug')` creates `.planning/custom/2026-05-24-auth-bug/STATE.yaml` and the directory.
4. Wave 1 instruction emitted. Agent works the phase; output saved to `01-collect-symptoms.md` at cp's path.
5. `custom.writeState(slug, {current_phase: 'repro', completed: ['collect-symptoms'], last_activity: now})`.
6. Loop. On final wave, `custom.writeState(slug, {status: 'done'})`.

### `cp run resume <slug>`

1. Detect binding tier from slug location (custom dir? milestone in ROADMAP?).
2. Read state file, determine `current_phase`.
3. Recompute wave plan from the template.
4. Emit instruction for the current wave (or the next pending wave).

## Error Handling

| Failure mode | Detection | Response |
|---|---|---|
| Template doesn't parse | `yaml.parse` throws | Abort with line/col error |
| Template fails schema | `validate()` errors[] non-empty | Abort, print all errors |
| DAG has cycle | Topological sort fails | Abort with cycle listing |
| `depends_on:` references unknown phase | `validate()` | Abort with offending phase id |
| File order isn't topological | `validate()` | Warn (not error); offer `--fix` to reorder |
| Phase id collision | `validate()` | Abort |
| Agent doesn't honor parallelism hint | Cannot detect | Phases run sequentially; correct but slower |
| Agent doesn't write phase summary at canonical path | Path missing after agent claims done | Runtime prompts user: retry / skip / abandon |
| `cp run resume` on unknown slug | `custom.readState()` ENOENT | Print available slugs, abort |
| `cp run` on already-running slug | STATE.yaml status = in-progress | Refuse; prompt `resume` or `abandon` |
| Concurrent edits to STATE.yaml | File mtime check | Reject second writer, prompt re-read |

All destructive ops (`abandon`, `prune`) require `--yes` flag or interactive confirmation (matches existing cp `safety.always_confirm_destructive`).

## Testing Strategy

- **Unit tests** (`test/unit-workflow.js`) — YAML parsing, schema validation, DAG cycle detection, wave computation, topo-order detection. ~80 assertions.
- **Unit tests** (`test/unit-custom.js`) — custom-tier lifecycle: create, list, read/write STATE, append summary, prune. ~40 assertions.
- **Integration tests** (`test/integration-run.js`) — full `cp run` flows for each binding tier, including resume, retry, abandon. Use fixture templates in `test/fixtures/workflows/`. ~30 assertions.
- **Dryrun tests** (`test/dryrun-workflow-cli.js`) — `cp workflow ls/show/validate/diagram/init/new/import` exit codes + stdout shapes. ~25 assertions.
- **End-to-end** (`test/e2e-workflow.js`) — spin up a temp project, run the `quick` template, verify state files. ~10 assertions.
- **Coverage target:** 80% (matches existing cp threshold).
- **Cross-platform:** all tests run on Ubuntu + Windows in CI (existing GitHub Actions matrix).

## Alternatives Considered

### Option A — Markdown + YAML frontmatter format

**Pros:** Fits cp's house style (all other files are markdown); zero new parser code (existing `lib/frontmatter.js`).

**Cons:** Markdown is unstructured for parallel/dependency expression; "how do I declare 3 parallel phases?" has no clean answer. User explicitly rejected: *"markdown is not structured representation for a workflow."*

**Verdict:** rejected.

### Option B — Pure DAG with no readability tooling

**Pros:** Format stays minimal; one mental model.

**Cons:** Skimming a 10-phase YAML template top-to-bottom doesn't reveal execution order; users must compute topology mentally.

**Verdict:** rejected in favor of layered approach (DAG format + topo-order convention + `cp workflow show / diagram` tooling).

### Option C — Phase groups (two-level YAML: phases → steps)

**Pros:** Visually obvious sequence; `parallel: true` per phase.

**Cons:** "Phase" inside templates collides with cp's existing milestone/phase concept; two levels feel heavy for the common case (3-step quick workflow).

**Verdict:** rejected.

### Option D — `subagent: true|false` opt-in flag

**Pros:** Author opts into subagent dispatch explicitly; visible cost.

**Cons:** User explicitly rejected: *"subagent is harness concept; our template only defines DAG model."* Coupling templates to harness mechanism violates portability.

**Verdict:** rejected.

### Option E — Concrete model IDs in templates

**Pros:** Deterministic — `model: claude-opus-4.7` always picks that exact model.

**Cons:** User rejected: *"I don't like we explicitly define models as well. If possible we just tell agent which level model they should use."* Couples templates to specific harnesses (an OpenAI model name doesn't run under Claude Code).

**Verdict:** rejected; abstract `high|middle|low` only.

### Option F — Templates specify `persist:` paths

**Pros:** Author has full control over where output lands.

**Cons:** User rejected: *"that sounds like template can specify random persistence; CP should maintain state automatically."* Couples templates to cp's planning layout, which may evolve.

**Verdict:** rejected; only `persist_output: bool` remains, cp owns paths.

### Option G — Workflows always create milestones (single state model)

**Pros:** Uniform state; existing tooling (resume, audit, ROADMAP) just works.

**Cons:** Forces every workflow into the milestone shape, contradicting the original requirement *"workflow may not always fit cp's milestone-phase structure."*

**Verdict:** rejected; three-tier hybrid (milestone / phase / custom).

## Open Questions

- [ ] Should `cp run` block until each wave completes, or return immediately after emitting Wave 1's instruction (relying on the agent to call back)? Leaning **return immediately**, matching cp's existing emit-and-trust pattern.
- [ ] Should `STATE.yaml` for custom runs be canonicalized as YAML or JSON? Leaning **YAML** for consistency with templates and easier hand-editing during recovery.
- [ ] What's the schema for the wave-completion call-back? Likely `cp run mark-complete <slug> <phase-id>` taking a summary on stdin. Concrete shape TBD in implementation phase.
- [ ] Should `cp workflow validate` exit non-zero on warnings (strict mode) or only on errors (default mode)? Leaning **errors only**, with `--strict` flag for CI usage.
- [ ] Should built-in templates ship in the npm package or be fetched from a curated repo at install time? Leaning **shipped in package** for v1.0 (zero-network install), revisit at v1.1.

## References

- `.planning/MILESTONE-CONTEXT.md` — verbatim brainstorm transcript
- `.planning/PROJECT.md` — Active requirement for v1.0
- `lib/provider.js` — existing role→skill mapping (informs per-phase `skill:` semantics)
- `lib/lifecycle.js` — existing milestone/phase scaffolding (reused by milestone-bound runs)
- `lib/frontmatter.js` — existing key:value parser (NOT used here; full YAML parser instead)
- `templates/PLAN.md` — existing per-phase planning template (analogue for understanding cp's persistence conventions)
- GitHub Actions workflow YAML — inspiration for `depends_on:` DAG shape
- Mermaid flowchart syntax — `cp workflow diagram` output format
