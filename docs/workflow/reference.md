# Workflow templates: schema and CLI reference

> **Audience:** project users authoring custom templates who need the
> authoritative schema, CLI flags, and exit codes. Start with the
> [quickstart](./quickstart.md) if this is your first workflow.
> Pattern recipes live in [recipes.md](./recipes.md).
>
> Every claim here is grounded in `lib/workflow.js`,
> `lib/workflow-template-validate.js`,
> `lib/workflow-template-expand.js`, `bin/commands/workflow.js`,
> `bin/commands/run.js`, and `templates/config.json` in the cp
> repository.

## File location and lookup

A workflow template is a YAML file at one of:

| Source            | Path                                    | Precedence |
| ----------------- | --------------------------------------- | ---------- |
| Project (custom)  | `.planning/workflows/<name>.yaml`       | Wins       |
| Built-in (cp)     | `templates/workflows/<name>.yaml`       | Fallback   |

When both exist, the project file shadows the built-in. `cp workflow
ls` flags project entries as `(project)`; `--verbose` on `cp run`
prints `(source: project)` per skill resolution.

You may also pass a path directly to any `cp workflow` sub-command:
`cp workflow validate ./my-template.yaml`, etc.

## Top-level envelope

```yaml
workflow: <name>          # required, kebab-case slug
version: 1                # required, integer
binds_to: quick           # default: quick
supervised: true          # default: false (see "Supervised mode" below)
description: |            # optional but recommended
  One-line summary used in `cp workflow ls`.
principles:               # optional, array of strings
  - "Reminder shown at top of every wave block"
defaults:                 # optional, free-form key/value
  model: default
params:                   # optional, see "Params + templating" below
  - name: param_name
    default: "value"      # optional
phases:                   # required, non-empty array
  - phase: { ... }
```

| Field         | Type            | Required | Default                | Notes |
| ------------- | --------------- | -------- | ---------------------- | ----- |
| `workflow`    | string          | yes      | —                      | Must match filename stem. Kebab-case. |
| `version`     | integer         | yes      | —                      | Currently `1`. |
| `binds_to`    | enum            | no       | `quick`                | `quick \| milestone \| phase`. `custom` is a deprecated alias for `quick`. |
| `supervised`  | boolean         | no       | `false`                | `true` makes `cp run` interactive (waves print one at a time; you `mark-complete` between waves). |
| `description` | string          | no       | —                      | Shown in `cp workflow ls`. |
| `principles`  | string[]        | no       | `[]`                   | Reminders printed at the top of every wave block during `cp run`. |
| `defaults`    | object          | no       | `{}`                   | Free-form passthrough (e.g., `model: default`). Not validated. |
| `params`      | object[]        | no       | `[]`                   | See "Params + templating". |
| `phases`      | phase-entry[]   | yes      | —                      | Must be non-empty. Each entry must be wrapped in `phase:` or `template:`. |

### `binds_to` and the auto-injected finalize

`binds_to` tells the runtime which scaffold layout to create for each
run and which finalizer to inject if you don't declare one.

| `binds_to`  | Run directory                                           | Auto-injected finalize command                |
| ----------- | ------------------------------------------------------- | --------------------------------------------- |
| `quick`     | `.planning/quick/<YYYY-MM-DD>-<slug>/`                  | `cp quick-finalize {{slug_with_date}}`        |
| `milestone` | `.planning/milestones/<milestone_slug>/` (existing)     | `cp milestone-finalize {{milestone_slug}}`    |
| `phase`     | `.planning/phases/<NN-slug>/` (existing)                | `cp run-finalize {{slug_with_date}}`          |

If your `phases:` array does not contain an entry with `id: finalize`,
the runtime appends one of kind `scaffold` that runs the command
above. See [recipes §custom finalizer](./recipes.md) to declare your
own.

### Supervised mode

`supervised: true` puts the run under interactive control. `cp run`
prints **one wave at a time**, with the v1.6 invocation contract for
each phase in the wave, then exits. You advance by running
`cp run mark-complete <slug> <phase-id>` once per phase. The next
wave is printed by the next `cp run mark-complete` (or `cp run resume`).

In `supervised: false` runs, the engine drives waves itself (no
manual `mark-complete` step). All built-ins ship `supervised: true`.

### `params:` and templating

Templating uses two flavours:

1. `{{name}}` — substituted from `params:` defaults, per-run supervisor
   values, or built-in tokens.
2. `${config.<path>}` — substituted from `cp config get` resolved
   values (typically provider skill names).

Declare a param with a default:

```yaml
params:
  - name: design_skill
    default: "plan"          # routes to provider's plan skill at run-time
```

Declare a param **without** a default — this signals "supervisor will
inject this per run". The validator then tolerates leftover
`{{name}}` tokens after the expand pass:

```yaml
params:
  - name: slug_with_date     # injected by cp run / quick lifecycle
  - name: task_description   # injected by /cp-quick on demand
```

#### Allowed and forbidden token locations

Post-expand, `{{...}}` tokens may only appear in this exact set of
fields (`lib/workflow-template-validate.js`, `ALLOWED_PARAM_FIELDS`):

| Field            | Allowed |
| ---------------- | ------- |
| `skill`          | ✓ |
| `role`           | ✓ |
| `prompt`         | ✓ |
| `command`        | ✓ |
| `description`    | ✓ |
| `outputs[]`      | ✓ |
| `max_children`   | ✓ (integer) |
| `min_children`   | ✓ (integer) |

Token forbidden anywhere (post-expand):

- Dotted tokens like `{{provider.plan_skill}}` — use
  `${config.provider.plan_skill}` for config references.
- Tokens after expand that aren't in a declared `params:` entry — the
  expander treats this as a typo.

Resolution order for `{{name}}`:

1. Per-run supervisor-supplied value (highest).
2. `params:` `default:`.
3. If still unresolved and `name` is in `params:` without a default,
   the token is preserved verbatim (the supervisor resolves it
   per-phase at run-time).
4. Otherwise: validation error `unresolved-token`.

#### `${config.path}` references

Pulled from `cp doctor`'s resolved config. The most useful ones:

| Reference                            | Resolves to                          |
| ------------------------------------ | ------------------------------------ |
| `${config.provider.plan_skill}`      | provider's plan skill                |
| `${config.provider.execute_skill}`   | provider's execute skill             |
| `${config.provider.review_skill}`    | provider's review skill              |
| `${config.provider.brainstorm_skill}`| provider's brainstorm skill          |
| `${config.provider.debug_skill}`     | provider's debug skill               |
| `${config.provider.verify_skill}`    | provider's verify skill              |

Fallbacks (`lib/workflow-template-expand.js:CONFIG_FALLBACKS`) ensure
these references resolve to a usable skill name even with zero config:
e.g., `provider.plan_skill → writing-plans` for the
`superpowers` provider.

## Phase entries

Every entry in `phases:` is wrapped in one of two keys:

```yaml
phases:
  - phase: { ... }       # a real phase
  - template: { ... }    # an inclusion of a reusable phase template
```

Bare `- id: ...` entries are rejected: `phases[i]: entry must be
wrapped in 'phase:' …`.

### Phase fields (common to all kinds)

| Field         | Type        | Required          | Notes |
| ------------- | ----------- | ----------------- | ----- |
| `id`          | string      | yes               | Unique within the workflow, kebab-case. |
| `description` | string      | yes               | Non-empty. The validator rejects empty strings. |
| `depends_on`  | string[]    | no                | Wave-scheduling predecessors. References other phase ids. |
| `after`       | string[]    | no                | Same as `depends_on`. Built-ins prefer `depends_on`. |
| `outputs`     | string[]    | no                | Glob-y paths the runtime hints at; not enforced. |
| `persist`     | boolean     | no (default `false`) | If `true`, the runtime records the phase output in `STATE.yaml`. |

`persist_output:` is the v1.1 spelling; it still works but
`cp workflow validate` prints a deprecation warning. Use `persist:`.

### Phase kinds

The `kind:` field selects the execution mode. Default is the implicit
"skill" kind — i.e., dispatch to an LLM via `skill:` / `role:` /
`prompt:`.

```yaml
- phase:
    id: my-scaffold-phase
    description: ...
    kind: scaffold
    command: "cp <cmd> ..."
```

| Kind             | Required fields                | What it does |
| ---------------- | ------------------------------ | ------------ |
| *(omitted)*      | `role` (optional), `skill` (optional), `prompt` | LLM phase. Engine prints the v1.6 contract block; harness invokes the skill. |
| `scaffold`       | `command`                      | Engine runs the shell command itself. No skill is routed. |
| (template ref)   | `template:` key (top-level)    | Includes a reusable phase template from `phase-templates/`. |

### Skill phases — `role`, `skill`, `prompt`

```yaml
- phase:
    id: classify
    description: Classify the inbox item.
    role: planner
    skill: ${config.provider.plan_skill}
    prompt: |
      Read the item and return JSON: { "kind": "..." }
```

- `role:` is a free-form string. Used in the v1.6 contract block for
  the human reader. Conventional values: `planner`, `writer`,
  `implementer`, `reviewer`, `verifier`, `tech-writer`.
- `skill:` is the **only** mechanism that routes work. Either a bare
  skill name (`writing-plans`), a fully-qualified path
  (`superpowers/writing-plans`), or a `${config.provider.<x>_skill}`
  reference (recommended — provider-agnostic).
- If `skill:` is omitted, the v1.6 contract prints `invoke skill:
  (none)` and the harness follows `prompt:` inline.
- `prompt:` is required for skill phases. Use a YAML block scalar
  (`|`) for multi-line content.

### Scaffold phases — `command`

```yaml
- phase:
    id: setup
    description: Create the run directory.
    kind: scaffold
    command: "cp quick-setup {{slug_with_date}}"
```

- The engine executes `command` itself before printing the next wave
  block; nothing is sent to the harness for this phase.
- `command` can use `{{...}}` (only from declared params).
- Use scaffolds for filesystem mutations (`cp quick-setup`,
  `cp tick`, `cp write-summary`) and for the final-phase finalizer.

### Fan-out phases — `parent`, `materialize`, `max_children`, `min_children`

A "parent" phase produces a JSON `items:` list; the runtime then spawns
one or more "child" phases per item.

```yaml
- phase:
    id: plan
    description: Decompose into 1-10 items.
    role: planner
    skill: ${config.provider.plan_skill}
    max_children: 10            # default 10; positive integer
    min_children: 1             # default 1
    materialize: inline         # default; or "roadmap-phases"
    prompt: |
      Return JSON: { "optimizable": false, "items": [{ "id": "...", "title": "..." }] }

- phase:
    id: child-plan
    description: Plan one item.
    parent: plan                # marks this as a child of `plan`
    role: planner
    skill: ${config.provider.plan_skill}
    prompt: |
      Plan the item assigned to this child.

- phase:
    id: child-execute
    description: Execute one item.
    parent: plan
    after: [child-plan]         # cross-sibling sequencing
    role: implementer
    skill: ${config.provider.execute_skill}
    prompt: |
      Execute the planned item.
```

| Field          | Where           | Default  | Notes |
| -------------- | --------------- | -------- | ----- |
| `parent`       | child phase     | —        | Required on every child. References the parent's `id`. |
| `after`        | child phase     | `[]`     | Sequences siblings within the same parent's fan-out. |
| `materialize`  | parent phase    | `inline` | `inline` (default) or `roadmap-phases` (used by milestone workflow). |
| `max_children` | parent phase    | `10`     | Validator rejects items lists that exceed this. |
| `min_children` | parent phase    | `1`      | Validator rejects items lists below this. |

Children inherit `role:` and `skill:` from themselves (not from the
parent) — every child must spell its own routing.

#### `optimizable:` flag

In the parent's `items:` JSON output, set `optimizable: true` to opt
into parallel/DAG child execution; otherwise children run sequentially
in list order. When `optimizable: true`, every item must declare
`depends_on: [...]` (use `[]` for no deps). If unsure about any
dependency, set `optimizable: false` — the runtime will ignore any
`depends_on` you wrote and fall back to safe sequential execution.

### Template inclusions

```yaml
phases:
  - template:
      id: clarify-and-design     # local id this inclusion takes
      name: superpowers/brainstorm
      args:
        skill: ${config.provider.brainstorm_skill}
      after: [setup]
```

| Field | Notes |
| ----- | ----- |
| `id`         | Local id. Required. |
| `name`       | Template name. Resolved against `phase-templates/` (`cp phase-template ls`). |
| `args`       | Map of arg name → value. The template's `params:` define what's expected. |
| `after`      | Same as on regular phases. `depends_on:` is **not** allowed here. |

`cp phase-template ls` and `cp phase-template show <name>` list and
inspect available templates.

## The v1.6 invocation contract

When `cp run` prints a wave, every phase in it gets a block in this
exact shape:

```
Phase: <id>
  role:  <role-or-(absent)>
  model: <model-or-(absent)>
  invoke skill: <skill-name>     # or "(none)"
  persist_output: <true/false-or-(absent)>
  prompt: |
    <prompt body>
```

The contract block always starts with this preamble (printed once at
the top of the wave):

```
[contract] For each phase below:
  'invoke skill: <name>'  → call that skill via your harness's skill tool now;
                            do NOT perform the phase inline.
  'skill: (none)'         → no skill is routed; follow the prompt inline.
```

If your harness doesn't have the named skill, fall back to inline
execution and tell the user which skill is missing.

## CLI surface

### `cp workflow <subcommand>`

| Command                                                       | Description |
| ------------------------------------------------------------- | ----------- |
| `cp workflow ls [--json]`                                     | List all templates (built-in + project). |
| `cp workflow show <name>`                                     | Print a template's YAML to stdout. |
| `cp workflow validate <name-or-path> [--strict]`              | Validate. `--strict` also exits 2 on warnings. |
| `cp workflow diagram <name-or-path> [--format mermaid]`       | Emit a Mermaid flowchart. |
| `cp workflow inspect <name-or-path> [--json]`                 | Show YAML plus the deduced wave grouping. |
| `cp workflow init`                                            | Create `.planning/workflows/`. Idempotent. |
| `cp workflow new <name> [--from <built-in>] [--force]`        | Scaffold a new template file. **Always use `--from`** — bare scaffolds emit bare-form phases that fail validation. |
| `cp workflow import <path> [--name <override>] [--force]`     | Validate + copy an external template into `.planning/workflows/`. |
| `cp workflow export <name> [--out <path>] [--as <new-name>] [--force]` | Write a template's YAML to a file for editing. |
| `cp workflow brainstorm [--workflow <name>] [--out <path>]`   | Emit a brainstorm context for designing a new workflow. |

### `cp run <subcommand>`

| Command                                                       | Description |
| ------------------------------------------------------------- | ----------- |
| `cp run <workflow> [name] [--plan-only] [--verbose]`          | Start a new run. `--plan-only` prints waves without mutating state. `--verbose` adds `(source: …)` skill provenance. |
| `cp run resume <slug> [--verbose]`                            | Resume a paused/in-progress run. |
| `cp run retry <slug> <phase-id>`                              | Retry a phase (rolls back wave if needed). |
| `cp run abandon <slug> [--yes]`                               | Mark a run abandoned. |
| `cp run mark-complete <slug> <phase-id>`                      | Mark a phase complete. Reads summary from stdin: `cp run mark-complete <slug> <phase> < summary.md`. |
| `cp run status [slug] [--json]`                               | Show one run's state or list all active runs. |
| `cp run state <slug> [--json]`                                | Print supervised-run `STATE.yaml` (read-only). |
| `cp run state get <slug> <path>`                              | Get a value at a dot-path from `STATE.yaml`. |
| `cp run state set <slug> <path> <val>`                        | Set a value (val parsed as JSON, fallback string). |
| `cp run state append <slug> <path> <val>`                     | Append to an array at a dot-path. |

Common flag on all `cp run` sub-commands: `--projectDir <path>` to
override cwd (rare).

### Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | OK. |
| `1`  | Generic error (file not found, missing arg, bad input). |
| `2`  | Validation failure (`cp workflow validate` errors; `--strict` also exits 2 on warnings). |

## Validation errors

Common errors you'll hit and what to fix:

| Error                                                       | Fix |
| ----------------------------------------------------------- | --- |
| `phases[N]: entry must be wrapped in 'phase:' …`            | Wrap each entry in `phase:` (or `template:`). |
| `phases[N] (id: 'X'): missing required 'description'`       | Add a non-empty `description:` field. |
| `meta.binds_to must be one of: milestone, phase, quick`     | Use one of the three values (or omit for `quick`). |
| `unresolved-token (token: {{name}})`                        | Declare `name` in `params:` (with or without a default). |
| `phase 'X' max_children must be a positive integer`         | Use an integer > 0. |
| `phase 'X' has max_children (N) < min_children (M)`         | Swap them or pick consistent bounds. |
| `phase 'X' materialize must be 'inline' or 'roadmap-phases'`| Pick one of the two. |
| `depends_on references unknown phase 'X'`                   | Either typo or missing phase. |

## Deprecations and aliases

| Deprecated                | Use instead                |
| ------------------------- | -------------------------- |
| `persist_output:`         | `persist:`                 |
| `binds_to: custom`        | `binds_to: quick`          |
| Bare `- id: …` phase entry| `- phase: { id: …, … }`    |

`cp workflow validate` prints warnings (not errors) for deprecations
so existing workflows keep working. `--strict` promotes them to
errors, which is what `cp install --ci`'s GitHub Action uses.
