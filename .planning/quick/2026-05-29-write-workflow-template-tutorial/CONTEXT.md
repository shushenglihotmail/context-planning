# CONTEXT — workflow template tutorial set

Writer-facing context for the three target documents:

- `docs/workflow/quickstart.md`
- `docs/workflow/reference.md`
- `docs/workflow/recipes.md`

Everything here is grounded in `lib/workflow.js`,
`lib/workflow-template-validate.js`, `lib/workflow-template-loader.js`,
`lib/workflow-template-expand.js`, `bin/commands/workflow.js`,
`bin/commands/run.js`, `templates/config.json`, the 6 built-in
templates under `templates/workflows/`, `README.md` §"Workflow Engine",
and `MIGRATION-v1.4.md` / `MIGRATION-v1.6.md` / `MIGRATION-v1.7.md`.
Do not invent fields, flags, or behaviour not listed here.

**Audience:** project users authoring custom templates under
`.planning/workflows/`. CLI surface is the contract; do not document
internals.

## File-system layout (verified)

| Concern | Path |
|---|---|
| Built-in templates | `templates/workflows/<name>.yaml` |
| Project templates  | `.planning/workflows/<name>.yaml` |
| Lookup order       | project shadows built-in (`lib/workflow.js:resolveTemplate`) |
| Quick run scaffold | `.planning/quick/<date>-<slug>/` |
| Milestone scaffold | `.planning/milestones/<slug>/` |

`isPathLike()` (`workflow.js:861`): any name containing `/`, `\`, or
ending in `.yaml`/`.yml` is treated as a literal file path. Plain
names go through `resolveTemplate`.

## Top-level workflow schema (verified against `validate()` in `lib/workflow.js`)

Required:

| Field | Type | Notes |
|---|---|---|
| `workflow` | non-empty string | template name |
| `version`  | integer          | currently always `1` |
| `phases`   | non-empty array  | see "Phase schema" |

Optional:

| Field | Type | Default | Notes |
|---|---|---|---|
| `binds_to`   | enum            | `quick` | one of `milestone`, `phase`, `quick` (also `custom` — silent legacy alias for `quick`) |
| `supervised` | boolean         | absent  | v1.4. `true` = single harness LLM session drives every phase |
| `principles` | array of strings| `[]`    | ≤10 entries recommended (warning above) |
| `defaults`   | object          | `{}`    | currently only `model:` |
| `params`     | array of `{name, default?}` | `[]` | see "Templating" |
| `phase_templates` / `workflow_templates` | inline reuse blocks | absent | advanced, defer to recipes |

`ALLOWED_BINDS = ['milestone', 'phase', 'custom', 'quick']`
(`lib/workflow.js:15`). `custom` is normalized to `quick` silently.

## Phase schema

Phase entries at the top-level **must** be wrapped in a `phase:` or
`template:` key (v1.4 Decision #1). Bare `{ id, ... }` entries are
rejected with `bare-form phase entry no longer accepted in v1.4`.

```yaml
phases:
  - phase:
      id: setup
      description: |
        What this phase does.
      depends_on: [some-other-id]
      role: developer
      skill: plan
      prompt: |
        Multi-line instructions for the agent.
```

### Per-phase fields (verified in `validateV12Schema()` + surrounding code)

| Field | Type | When required | Notes |
|---|---|---|---|
| `id` | non-empty string, slug-safe, unique, no `--` | always | reserved separator `--` is for workflow-template namespacing |
| `description` | non-empty string | always (on `phase:` wrapper entries) | v1.4 Decision #2 |
| `depends_on` | string[] | optional | references must match an existing phase id; cycles rejected |
| `kind` | `'skill'` \| `'scaffold'` | optional, default `'skill'` | scaffold = cp runs a deterministic command instead of a skill |
| `command` | string | required iff `kind: scaffold` | the literal shell command |
| `role` | string | optional | persona only (free-form). Warned if it looks like a routing key |
| `skill` | string | optional | routing key (`plan`, `execute`, …) OR pinned full path (`cp:manual/plan`, `superpowers:writing-plans`) |
| `model` | string | optional | model hint, free-form |
| `prompt` | string (multi-line) | optional but practically required for `kind: skill` | the wave-instruction body |
| `outputs` | string[] | optional | declared writable paths (v1.4 Decision #8) |
| `persist_output` | string | optional | path to write raw skill output |
| `persist` | boolean | optional | legacy fold into DESIGN.md |
| `parent` | string (phase id) | optional | this phase fans out under that parent (one level of nesting only) |
| `after` | string[] (sibling ids) | optional | ordering inside the same fan-out unit |
| `materialize` | `'inline'` \| `'roadmap-phases'` | optional | only on a parent phase (v1.4 Decision #3) |
| `max_children` | positive integer | optional, default `10` | only meaningful on a parent phase |
| `min_children` | positive integer | optional, default `1`  | only meaningful on a parent phase |

`kind: scaffold` + `skill:` or `role:` ⇒ warning (those fields are
ignored).  `kind: skill` + `command:` ⇒ warning (command ignored).
`command:` without `kind:` ⇒ warning (set `kind: scaffold` to use it).

### Role vs skill (v1.5 — `lib/workflow.js:730–748`)

- `role:` is a persona (job title), free-form. Examples: `developer`,
  `tech-writer`, `analyst`, `planner`, `product-thinker`.
- `skill:` is the routing key OR pinned literal. Routing keys resolve
  via the active provider; literals (containing `:` or `/`) are used
  verbatim.

**Validator rules:**

- If `role:` is a routing key AND `skill:` is a different routing
  key → ERROR.
- If `role:` alone is a routing key → WARNING ("set skill: X instead
  and use a persona for role").

### Canonical routing keys (sourced from `templates/config.json` provider skill maps)

`brainstorm`, `plan`, `execute`, `execute_simple`, `review`,
`receive_review`, `finish`, `worktree`, `tdd`, `debug`, `verify`.

Superpowers mapping (built-in): `plan → writing-plans`,
`execute → subagent-driven-development`, `brainstorm → brainstorming`,
`review → requesting-code-review`, `tdd → test-driven-development`,
`debug → systematic-debugging`, `verify → verification-before-completion`,
`finish → finishing-a-development-branch`,
`worktree → using-git-worktrees`,
`execute_simple → executing-plans`,
`receive_review → receiving-code-review`.

Manual provider (always available, fallback): all keys map to
`cp:manual/<key>` inline-prompt skills.

## Templating (v1.7 — verified in `lib/workflow-template-validate.js`)

### `{{name}}` substitution

Two layers:

1. **Top-level `params:` substitution** (load time). For each
   `params:` entry with a `default:`, the runtime substitutes
   `{{name}}` everywhere across the phase tree.
2. **Workflow-template inclusion args** (Phase 55-02): the included
   template's body sees substituted args.

### Field whitelist (v1.7 hard rule)

`{{...}}` and `${...}` tokens are **allowed** only in:

```
skill           role
prompt          command
description     outputs
max_children    min_children
```

Tokens in any other field → `field-not-parameterizable` error.

**Forbidden** anywhere (including the allowed-list above):

- Dotted tokens like `{{item.id}}`, `{{x.y.z}}`. Per-item identity is
  supplied by the supervisor's run-time context, not template
  substitution. `dotted-token-forbidden` error.
- Any leftover `{{...}}` token after the post-expand pass.
  `unresolved-token` error.

### `${config.path}` interpolation

In `params:` `default:` values, `${config.<dot.path>}` is resolved
against `.planning/config.json` at load time (`interpolateConfigTokens`
in `lib/workflow-template-expand.js`).

If the config doesn't define the path, these fallback strings are
used (the Superpowers skill names, so workflows work out of the box):

```
provider.brainstorm_skill   → brainstorming
provider.plan_skill         → writing-plans
provider.execute_skill      → subagent-driven-development
provider.execute_plan_skill → executing-plans
provider.review_skill       → requesting-code-review
provider.test_skill         → test-driven-development
provider.debug_skill        → systematic-debugging
provider.verify_skill       → verification-before-completion
provider.finish_branch_skill→ finishing-a-development-branch
provider.quick_design_skill → writing-plans
```

### Supervisor-supplied params

Declare a `params:` entry **without** `default:`. Its name is added
to a per-run "supervisor allow-list", so leftover `{{name}}` tokens
in the substituted phases are *not* rejected by the post-expand
validator. The supervisor (e.g. a `/cp-quick` skill) is expected to
inject the value at run-time.

Built-ins use this for `slug_with_date` (in `quick.yaml`, `docs.yaml`)
and `milestone_slug` (in `milestone.yaml`).

## Fan-out (v1.2)

A parent phase returns a structured list. The runtime materializes
one child phase instance per item.

```yaml
phases:
  - phase:
      id: plan
      role: planner
      max_children: 10
      prompt: "Decompose into 1-10 items..."

  - phase:
      id: child-plan
      parent: plan
      role: planner
      prompt: "Plan one item."

  - phase:
      id: child-execute
      parent: plan
      after: [child-plan]
      role: developer
      prompt: "Execute one item."
```

**One level of nesting only.** A child of a child is rejected:
"`'<id>' is a grandchild of '<grandparent>' via '<parent>'; v1.2
allows only one level of nesting`".

`after:` inside a fan-out unit must reference siblings under the same
parent.

`materialize: 'roadmap-phases'` (parent-phase only) emits real
ROADMAP entries instead of in-memory phases — used by the
`milestone` template's `propose-phases` phase.

### Inter-child ordering with `optimizable:` + `depends_on:`

The parent's structured output:

```json
{
  "optimizable": true,
  "items": [
    { "id": "feature-a", "depends_on": [] },
    { "id": "feature-b", "depends_on": [] },
    { "id": "feature-c", "depends_on": ["feature-a", "feature-b"] }
  ]
}
```

- `optimizable: true` + per-item `depends_on` → runtime parallelizes
  safe waves.
- `optimizable: false` (or missing) → strict sequential, declared
  `depends_on` ignored.
- Bare items array (no wrapping object) → treated as
  `optimizable: false`.

The prompt for the parent phase should explicitly tell the agent
"only set `optimizable: true` if you are confident about ALL
inter-item dependencies." Built-in templates demonstrate this.

## Auto-injected `finalize` phase (v1.6 — `applyAutoInjectFinalize`)

If a template doesn't already have a phase with `id: finalize`, the
runtime appends one automatically:

- `kind: scaffold`
- `depends_on: [<last-phase-id>]`
- `command:` depends on binding:
  - `binds_to: milestone` → `cp milestone-finalize {{milestone_slug}}`
  - `binds_to: quick`     → `cp quick-finalize {{slug_with_date}}`
  - otherwise             → `cp run-finalize {{slug_with_date}}`

`cp workflow inspect` flags auto-injected phases (`[auto-injected]`
in human output, `auto_injected: true` in JSON).

## Wave computation

`computeWaves()` in `lib/workflow.js:795`:

- Topo sort over `depends_on` edges.
- Wave N = all phases with current indegree 0.
- Cycles → "Cycle detected while computing workflow waves".
- File-order ≠ topo order → warning (not an error).

`cp workflow inspect <name>` exposes the wave grouping (human-readable
or `--json`).

## CLI surface (verified against `bin/commands/workflow.js` USAGE
block and `bin/commands/run.js` USAGE block)

### `cp workflow` subcommands

```
cp workflow ls [--json]
cp workflow show <name>
cp workflow validate <name-or-path> [--strict]
cp workflow diagram <name-or-path> [--format mermaid]
cp workflow inspect <name-or-path> [--json]
cp workflow init
cp workflow new <name> [--from <built-in>] [--force]
cp workflow import <path> [--name <override>] [--force]
cp workflow export <name> [--out <path>] [--as <new-name>] [--force]
cp workflow brainstorm [--workflow <name>] [--out <path>]
```

Exit codes: 0 ok, 2 usage/validation (strict + warnings counts), 3
template not found, 6 file already exists (without `--force`).

### `cp run` subcommands

```
cp run <workflow> [name] [--plan-only] [--verbose]
cp run resume <slug> [--verbose]
cp run retry <slug> <phase-id>
cp run abandon <slug> [--yes]
cp run mark-complete <slug> <phase-id>   # summary from stdin
cp run status [slug] [--json]
cp run state <slug>
cp run state get <slug> <path>
cp run state set <slug> <path> <val>
cp run state append <slug> <path> <val>
```

Common: `--projectDir <path>`.

`cp run <workflow> [name]`: `name` is **optional for custom-bound**
(`binds_to: quick`) workflows (cp generates `<YYYY-MM-DD>-<task-slug>`),
**required for milestone-bound** workflows.

`cp run mark-complete` reads the summary from stdin:

```
echo "summary text" | cp run mark-complete <slug> <phase-id>
```

### Skill invocation contract (v1.6)

Each wave block prints either:

- `invoke skill: <name>` — supervisor MUST call its skill tool with
  that name. Falls back to inline execution if skill is unavailable
  (with a message naming what was missing).
- `skill: (none)` — no skill routed; follow the `prompt:` body inline.

A one-time contract legend is printed at the top of every `cp run`
output. Document this contract once in `quickstart.md` and refer to
it from `reference.md`.

### `cp workflow new <name>` stub (verified)

`cp workflow new <name>` (no `--from`) writes a 3-phase stub
template:

```yaml
workflow: <name>
version: 1
binds_to: quick  # or: phase | milestone
principles:
  - TODO: add a principle
defaults:
  model: default
phases:
  - id: discuss
    role: planner
    prompt: |
      TODO: describe what this phase should accomplish.
  - id: execute
    depends_on: [discuss]
    role: implementer
    prompt: |
      TODO: describe the implementation work.
  - id: verify
    depends_on: [execute]
    role: verifier
    prompt: |
      TODO: describe verification steps.
```

> **Caveat:** the stub uses bare-form `- id: ...` entries which the
> v1.4 validator rejects on `cp workflow validate`. Either tell users
> to wrap each phase in `phase:` after running `new`, or write
> hand-rolled examples in the docs. Recommended: hand-roll the
> quickstart example using `phase:` wrappers, and only mention
> `cp workflow new --from <built-in>` (which copies a wrapped
> built-in and is therefore valid as-is).

## Built-in templates as worked examples (in `templates/workflows/`)

| Template | Binds to | Supervised | Notable features |
|---|---|---|---|
| `quick` | quick | yes | clarify-then-execute pair, STOP gate, `slug_with_date` supervisor param |
| `docs`  | quick | yes | 7-phase doc-set authoring, 4 `${config.provider.*}` params, fan-out via `parent: prepare` |
| `milestone` | milestone | yes | `materialize: roadmap-phases` fan-out, `milestone_slug` supervisor param |
| `dev`   | milestone | no  | classic plan→fan-out children with `optimizable:` opt-in |
| `debug` | quick | no | linear 5-phase chain, custom roles (`investigator`, `debugger`, `verifier`) |
| `complete-milestone` | quick | no | 2-phase scaffold-only workflow (`cp complete-milestone --dry-run` → `cp complete-milestone`) |

Use these as recipe sources. Show real YAML snippets — do not
paraphrase.

## Style anchor

`docs/writing-providers.md` is the model. Conventions:

- Short sentences, code-first.
- Tables for enum-style fields.
- One `##` per top-level concern; `###` sub-sections.
- Cross-reference to README and migration guides where they go
  deeper.

## Cross-link plan

- Each of the 3 new docs starts with a one-line cross-link header to
  the other two.
- `README.md` §"Workflow Engine" (line 418+): add a "See
  `docs/workflow/quickstart.md`, `reference.md`, and `recipes.md`
  for the full author's guide." line at the top of that section. The
  anchor is natural; the change is small.

## Hard rules for the writers (do not violate)

1. **Every YAML snippet** in the docs must pass
   `cp workflow validate --strict` (no warnings either). Test
   snippets locally before committing each doc.
2. **Every CLI flag** mentioned must appear in the USAGE block of
   `bin/commands/workflow.js` or `bin/commands/run.js`. No fictional
   flags. No invented sub-commands.
3. **Every schema field** documented in `reference.md` must appear
   in `lib/workflow.js` (`validate` / `validateV12Schema`) or
   `lib/workflow-template-validate.js`. If you can't cite it, it's
   not real.
4. **One commit per document** during `child-write` — the workflow
   principle requires it.
5. **Bare-form phase entries are rejected.** Always wrap with `phase:`.
6. **Dotted `{{x.y}}` tokens are always forbidden** — do not use them
   in examples even when illustrating fan-out per-item identity
   (that identity is supplied by the supervisor at run-time, not by
   template substitution).
