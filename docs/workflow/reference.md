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
principles:               # optional, array of strings (max 10)
  - "Reminder shown at top of every wave block"
defaults:                 # optional, free-form key/value (loaded but not consumed today)
  model: default
params:                   # optional, see "Params + templating" below
  - name: param_name
    default: "value"      # optional
phases:                   # required, non-empty array
  - phase: { ... }
```

Quick reference (semantics deep-dive follows):

| Field         | Type            | Required | Default                | Notes |
| ------------- | --------------- | -------- | ---------------------- | ----- |
| `workflow`    | string          | yes      | —                      | Must match filename stem. Kebab-case. |
| `version`     | integer         | yes      | —                      | Currently `1`. |
| `binds_to`    | enum            | no       | `quick`                | `quick \| milestone \| phase`. `custom` is a deprecated alias for `quick`. |
| `supervised`  | boolean         | no       | `false`                | `true` makes `cp run` interactive (waves print one at a time; you `mark-complete` between waves). |
| `description` | string          | no       | —                      | Shown in `cp workflow ls`. |
| `principles`  | string[]        | no       | `[]`                   | Reminders printed at the top of every wave block during `cp run`. |
| `defaults`    | object          | no       | `{}`                   | Free-form passthrough; loaded but not consumed by the engine today. |
| `params`      | object[]        | no       | `[]`                   | See "Params + templating". |
| `phases`      | phase-entry[]   | yes      | —                      | Must be non-empty. Each entry must be wrapped in `phase:` or `template:`. |

### Top-level field reference

Each field below is documented as: **what it means** → **how the
runtime uses it** → **validation rules** → **when to set / omit**.

#### `workflow:`

The slug that identifies this template. Used as the lookup key for
`cp workflow show <name>`, `cp run <name>`, `cp workflow new <name>
--from <other>`, and as the namespace prefix when expanded into a
larger workflow via `- template:`.

- **Runtime impact:** the slug appears in `cp workflow ls` output,
  `cp run` invocation, every `cp run mark-complete <slug-with-date>
  <phase-id>` call, and is the primary identifier in `state.json`.
  Internally it's also the key for once-per-workflow warnings such
  as the `persist_output:` deprecation
  (`lib/workflow.js:1165–1169`).
- **Validation:** required, must be a non-empty string. Conventionally
  kebab-case and matches the filename stem (`triage` → `triage.yaml`);
  the loader does not enforce that match, but `cp workflow ls`
  groups by filename and a mismatch is confusing.
- **Set when:** always.
- **Omit when:** never.

#### `version:`

Schema version. The only currently accepted value is `1`. Reserved
for future breaking changes to the workflow schema.

- **Runtime impact:** loaded but not branched on today; the field is
  there so a future schema bump can be additive.
- **Validation:** must be the literal integer `1`.

#### `binds_to:`

Which scaffold layout the runtime creates per run and which finalizer
it auto-injects (see [§`binds_to` and the auto-injected finalize](#binds_to-and-the-auto-injected-finalize)).

- **Runtime impact:** determines the run directory the runtime
  scaffolds; determines which `cp <X>-finalize` command the
  auto-injected `finalize` phase runs; controls which lifecycle
  helper commands accept this slug (`cp quick-setup` vs
  `cp milestone-setup` vs `cp phase-setup`).
- **Validation:** `quick`, `milestone`, or `phase`. `custom` is
  silently normalized to `quick` at load (`lib/workflow.js:72–78`).
- **Set when:** different from the default `quick`.
- **Omit when:** you want quick-task semantics (most ad-hoc
  workflows).

#### `supervised:`

Whether `cp run` operates in interactive (one-wave-at-a-time) mode or
drives all waves itself.

- **Runtime impact:** in supervised mode (`true`), `cp run` prints
  one wave's worth of contract blocks then **exits** with code 0;
  the operator advances each phase with
  `cp run mark-complete <slug> <phase-id>`, and the next wave is
  emitted by the next `mark-complete` (or by `cp run resume`). In
  unsupervised mode (`false`), the runtime fires every phase end to
  end without waiting for human confirmation; the v1.6 contract
  block is **not** printed at all (no checkpoint to print it for).
- **Validation:** boolean.
- **Set when:** any human-in-the-loop workflow (every built-in does
  this).
- **Omit / set `false` when:** short, fully-automated chains where
  no human review is needed between steps.

#### `description:`

A one-line (or one-paragraph) summary of what this workflow does.

- **Runtime impact:** shown in `cp workflow ls` output and in
  `cp workflow show <name>` output. Useful when an operator runs
  `cp run resume <slug>` after a long pause and needs a reminder of
  what the workflow is for — `cp run state <slug>` records the
  `template_path`, and viewing the template re-surfaces its
  description. The field is **not** automatically resurfaced in the
  wave contract block today; agents that want to remind themselves
  of the overall purpose mid-run must re-read the template.
- **Validation:** none (any string is accepted; absence is allowed).
- **Set when:** always — even one sentence is far better than
  nothing for anyone returning to the workflow later.
- **Omit when:** never.

#### `principles:`

Up to 10 short strings that the runtime prints **above** every wave
block during `cp run` (the "Global directives" preamble at
`lib/runtime.js:330–344`). Think of them as workflow-wide reminders
the agent re-reads on every wave: e.g., "Commit one task per
commit", "Stop and ask the user before destructive actions", "Read
materials before fanning out".

- **Runtime impact:** rendered into the wave header alongside any
  project-level constraints pulled from `.planning/PROJECT.md`. The
  agent reads them at the start of every wave, so they're the right
  place for behaviours that must hold across the entire run (not
  the right place for per-phase instructions — those go in
  `phase.prompt`).
- **Validation:** array of strings; >10 entries trigger a warning
  about cognitive overload (`lib/workflow.js:368–370`).
- **Set when:** the workflow has 1–5 invariants that should colour
  every phase (e.g., "principle of least change", "validate every
  YAML you produce").
- **Omit when:** the per-phase prompts already cover every
  guideline; needless principles add noise to every wave.

#### `defaults:`

A free-form object accepted by the loader but **not currently
consumed by the engine** (it is stored on the parsed template at
`lib/workflow.js:305` and not read elsewhere). It exists for future
template inheritance and to remain forward-compatible with templates
that already declare `defaults: { model: default }` and similar.

- **Runtime impact:** none today.
- **Validation:** none beyond "must be an object".
- **Set when:** you have a pre-v1 template using `defaults:` already
  — leave it; it harms nothing.
- **Omit when:** writing a new template. Use `params:` defaults
  instead.

#### `params:`

The template's parameter schema. Each entry declares a name and an
optional default. Values flow into `{{param_name}}` tokens used
elsewhere in the file (see [§`params:` and templating](#params-and-templating)).

- **Runtime impact:** the param-expander (`lib/workflow.js:128`)
  substitutes `{{param_name}}` tokens at template-load time, using
  per-run supervisor-supplied values first, then `default:` values
  (which themselves can reference `${config.…}` paths). Params
  **without** a `default:` survive the expand pass and are treated
  as "supervisor will inject this later"; the validator tolerates
  unresolved tokens for them.
- **Validation:** each entry must have a `name:`; `default:` is
  optional; duplicate names rejected.
- **Set when:** the template has any value that should be
  overridable per run, or any reference to a `${config.…}` skill
  (which only resolves inside a `default:` line).
- **Omit when:** the template hard-codes every value.

#### `phases:`

The phases that make up the workflow. Each entry is wrapped in one
of two keys: `phase:` (an inline phase definition) or `- template:`
(a workflow-template inclusion). See
[§Phase entries](#phase-entries) and [§Template inclusions](#template-inclusions).

- **Runtime impact:** the DAG built from `phases:` (resolved via
  `depends_on:` / `after:`) is what `cp workflow inspect` deduces
  and what `cp run` walks wave-by-wave. The `finalize` phase is
  auto-injected at the end if not present.
- **Validation:** non-empty array; every entry must be either
  `phase:` or `template:`-wrapped (bare `- id: …` entries are
  rejected with a clear error). See [§Validation errors](#validation-errors).


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
above. See [recipes §mixing scaffold + prompt phases](./recipes.md)
to declare your own.

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

Resolved by the param expander (`lib/workflow.js:128`) from the
config tree that `cp doctor` prints. **They only resolve inside
`params:` `default:` values — not inside phase fields like `skill:`,
`role:`, `command:`, or `prompt:`.** To use a config value in a phase
field, declare it as a param and reference it via `{{...}}`:

```yaml
params:
  - name: plan_skill
    default: "${config.provider.plan_skill}"   # ✓ resolves here

phases:
  - phase:
      id: classify
      role: planner
      skill: "{{plan_skill}}"                  # ✓ correct indirection
```

The most useful `${config.…}` paths:

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

#### Canonical routing keys

The `skill:` phase field accepts a **routing key** — the engine looks
it up under the active provider's `skills` map
(`templates/config.json` → `providers.<name>.skills`). Built-in keys:

| Key              | Routes to (superpowers)               |
| ---------------- | ------------------------------------- |
| `brainstorm`     | `brainstorming`                       |
| `plan`           | `writing-plans`                       |
| `execute`        | `subagent-driven-development`         |
| `execute_simple` | `executing-plans`                     |
| `review`         | `requesting-code-review`              |
| `receive_review` | `receiving-code-review`               |
| `finish`         | `finishing-a-development-branch`      |
| `worktree`       | `using-git-worktrees`                 |
| `tdd`            | `test-driven-development`             |
| `debug`          | `systematic-debugging`                |
| `verify`         | `verification-before-completion`      |

`cp doctor` prints the resolved table for your active provider.

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

Quick reference:

| Field         | Type        | Required          | Notes |
| ------------- | ----------- | ----------------- | ----- |
| `id`          | string      | yes               | Unique within the workflow, kebab-case. |
| `description` | string      | yes               | Non-empty. The validator rejects empty strings. |
| `depends_on`  | string[]    | no                | Wave-scheduling predecessors. References other phase ids. |
| `after`       | string[]    | no                | Same as `depends_on`. Built-ins prefer `depends_on`. |
| `outputs`     | string[]    | no                | Declared write paths. **Enforced under `supervised: true`** — writes outside this list are rejected by the sub-agent supervisor. |
| `persist`     | boolean     | no (default `false`) | If `true`, the phase's `mark-complete` summary is folded into `DESIGN.md` as a `## <id>` section. |
| `model`       | string      | no                | Advisory model name shown in the v1.6 contract block; not used to route to a specific model by the engine. |

`persist_output:` is a v1.1 spelling — silently normalised to `persist:`
on load (`lib/persist.js:mergePersistAlias()`) and validated against the
same boolean rule.

#### Per-phase-field semantics

Below: **what it means** → **how the runtime uses it** →
**validation** → **when to set / omit / common mistakes**.

##### `id:`

Stable identifier for the phase within this workflow. Referenced from
`depends_on`/`after`, from `parent:` on fan-out children, and on the
operator command line as `cp run mark-complete <slug> <phase-id>`.

- **Runtime impact:** keys the DAG, names the directory the runtime
  creates under the run scaffold for that phase's artifacts (e.g.,
  `.planning/quick/<slug>/<id>/`), and is echoed in the v1.6
  contract `Phase: <id>` header.
- **Validation:** required; must be unique across all top-level
  phases; convention: kebab-case. When this phase comes from a
  workflow-template inclusion, the engine prefixes the id with
  `<inclusion-id>--`, so `r--review` is the resolved id of `review`
  inside an inclusion with `id: r`.
- **Common mistake:** giving the same id to two phases by copy-pasting
  — the validator rejects duplicates with a clear error.

##### `description:`

A one-line summary of what this phase does. Required on every phase
(`lib/workflow.js:419,424`).

- **Runtime impact:** printed in `cp workflow inspect` next to the
  wave listing, in `cp run state <slug>` output for any in-progress
  phase, and helps any human (and agent on resume) tell phases
  apart at a glance. The description is intentionally separate from
  `prompt:` — `description:` says *what this is*, `prompt:` says
  *what the agent should do*.
- **Validation:** required and non-empty. The validator rejects both
  missing and empty-string values. On phase-template inclusions the
  description must be supplied by the caller — phase-template bodies
  may not define their own.
- **Common mistake:** repeating the prompt verbatim. Keep it
  bumper-sticker short.

##### `depends_on:` / `after:`

Wave-scheduling predecessors. Both work and mean the same thing for
top-level phases; the loader normalises everything to `depends_on`
internally. Built-ins prefer `depends_on:`; pick one and stay
consistent.

- **Runtime impact:** controls the DAG that `cp workflow inspect`
  prints and that `cp run` walks. Phases with no unsatisfied
  predecessors run in parallel within the same wave. The runtime
  fails fast on a cycle (`unresolved dependency` /
  `dependency cycle` errors).
- **Validation:** array of strings; every referenced id must exist
  in the workflow. On workflow-template **inclusions** (`- template:`),
  **only `after:` is allowed** — `depends_on:` on the inclusion
  itself is rejected; use `after:` to sequence the whole expanded
  block after an earlier phase.
- **Set when:** ordering matters; otherwise omit and let the runtime
  parallelise.
- **Common mistake:** forgetting that two phases without
  `depends_on` between them WILL be scheduled in the same wave —
  if your second phase reads files the first phase writes, declare
  the dependency.

##### `outputs:`

Declared paths the phase is allowed to write to (paths or path
prefixes, relative to the run directory or the repo root depending
on the path you give).

- **Runtime impact (this is the field most often misunderstood):**
  - Under `supervised: true`, the **sub-agent output-path contract**
    (`lib/supervisor.js:261–264`) returns `true` only if the
    sub-agent's write is within at least one declared `outputs:`
    prefix. Writes elsewhere are rejected. This means `outputs:`
    is a **hard contract**, not a hint.
  - The checkpoint/rollback logic
    (`lib/checkpoint.js:144–150, 217–223, 311–316`) uses the same
    list to know what to back up before the phase runs and what to
    restore on failure or explicit rollback.
  - On fan-out children, every entry in `outputs:` is namespaced
    per-child by the runtime (`lib/fanout.js:164–184`).
- **Validation:** array of strings. The validator accepts any
  non-empty string entries; correctness is the author's
  responsibility.
- **Set when:** every phase that writes files. Be specific
  (`.planning/quick/{{slug_with_date}}/<phase>/`,
  `docs/workflow/`) — wide entries (`.`) defeat the point.
- **Common mistake:** treating `outputs:` as documentation. It is
  also documentation, but the runtime really does use it.

##### `persist:` (alias `persist_output:`)

Whether the phase's summary (the text the operator pipes into
`cp run mark-complete <slug> <phase-id>` on stdin) should be
**folded** into `DESIGN.md` as a `## <phase-id>` section.

- **Runtime impact:** when `true`, on `mark-complete`,
  `lib/persist.js:foldIntoDesign()` either appends a new `## <id>`
  section or replaces the existing one in
  `<run-dir>/DESIGN.md`. Subsequent phases — and the final
  finalize phase — read DESIGN.md to get the running narrative.
  When `false` (the default), the summary still goes into
  `STATE.yaml` as bookkeeping but is not folded into DESIGN.md.
- **Validation:** boolean. The legacy alias `persist_output:` is
  silently renamed at load
  (`lib/persist.js:mergePersistAlias()`), and the run-time path
  emits a per-workflow deprecation warning when the alias is
  encountered (`lib/workflow.js:1165–1168`).
- **Set when:** the phase produces narrative the next phase (or the
  operator) needs visible at a glance — typically planning,
  review, and synthesis phases. Default `false` is correct for
  routine setup/scaffold/finalize phases.
- **Common mistake:** writing `persist:` on a `kind: scaffold`
  phase — scaffolds don't have a summary stdin, so `persist:`
  there is a no-op.

##### `model:`

Advisory model identifier for the harness/agent invoking this phase.

- **Runtime impact:** copied into the expanded phase
  (`lib/workflow.js:1147`) and printed on the `model:` line of the
  v1.6 contract block (`lib/runtime.js:404`). The cp engine itself
  does **not** route work to a specific model; honouring this hint
  is the harness's job.
- **Validation:** any string.
- **Set when:** a phase has unusual model requirements that the
  operator should see at a glance (e.g., a long-context synthesis
  phase). Otherwise omit and let the harness pick.


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
    skill: plan                          # routing key — see canonical table above
    prompt: |
      Read the item and return JSON: { "kind": "..." }
```

##### `role:`

A free-form persona string (e.g., `planner`, `writer`,
`implementer`, `reviewer`, `verifier`, `tech-writer`).

- **Runtime impact:** echoed verbatim on the `role:` line of the
  v1.6 contract block. Helps the harness/operator at a glance and
  helps the agent self-frame. It does **not** route work — only
  `skill:` does that.
- **Validation:** any string. There is a v1.5 orthogonality rule
  (`lib/workflow.js:730–748`): if `role:` matches a known routing
  key AND `skill:` is set to a *different* routing key, the
  validator errors out (likely a copy-paste mistake). If `role:`
  matches a routing key but `skill:` agrees or is absent, a
  warning is emitted.
- **Set when:** every skill phase (good hygiene).
- **Omit when:** rarely — most phases benefit from a persona label.

##### `skill:`

The **only** mechanism that routes work. Resolved by
`resolvePhaseSkill()` (`lib/runtime.js:257–297`) at run time, with
three accepted forms:

1. A **canonical routing key** (`plan`, `execute`, `review`, …) —
   looked up under the active provider's `skills` map (see
   [§Canonical routing keys](#canonical-routing-keys)).
2. A **literal skill name** (`writing-plans`,
   `subagent-driven-development`) — passes through marked as
   "pinned" if it appears as a value anywhere in any provider's
   skills map; this disables provider override for the phase.
3. A **`{{param_name}}` token** whose param defaults to
   `"${config.provider.X_skill}"` — recommended for
   provider-overridable workflows.

Anything else passes through but emits an
`Unknown skill "<value>"` warning at run time.

- **Runtime impact:** the resolved skill is printed on the
  `invoke skill:` line of the v1.6 contract block; the harness
  uses it to dispatch work. With `--verbose`, the contract block
  also prints `skill resolved via:` (routing-key / pinned /
  unknown / absent) and the source provider.
- **Validation:** string; orthogonality rule vs `role:` as above;
  direct `${config.…}` in this field does **NOT** expand (silently
  passes through and triggers an unknown-skill warning at run
  time). Always go through a param.
- **Set when:** every skill phase that should route to a real
  skill.
- **Omit when:** prompt-only phases where the harness should follow
  `prompt:` inline; the contract prints `skill: (none)` and the
  agent does its best directly.

##### `prompt:`

The instruction sent to the resolved skill. Use a YAML block
scalar (`|`) for multi-line content.

- **Runtime impact:** the prompt is printed verbatim in the v1.6
  contract block (`lib/runtime.js:411–420`); a single trailing
  empty line is stripped to avoid a wide gap before the next
  phase block. The harness then routes the prompt + the resolved
  skill to the underlying agent.
- **Validation:** required for skill phases (non-empty). The
  validator does not introspect content; you are responsible for
  whether the prompt makes sense.
- **Set when:** every skill phase.
- **Common mistake:** leaving stale `{{tokens}}` in the prompt
  that aren't declared in `params:` — the validator catches this
  with `unresolved-token` errors.

### Scaffold phases — `kind`, `command`

```yaml
- phase:
    id: setup
    description: Create the run directory.
    kind: scaffold
    command: "cp quick-setup {{slug_with_date}}"
```

##### `kind:`

Selects execution mode. Default (when omitted) is the implicit
"skill" kind — engine prints the v1.6 contract block and the
harness invokes the skill.

- **Runtime impact:** when `kind: scaffold`, the engine runs
  `command:` itself before printing the next wave block; the
  phase is never dispatched to the harness. When `kind:` is
  omitted (skill phase), the engine prints the contract block
  and waits for the harness/operator to advance via
  `mark-complete`.
- **Validation:** must be either omitted or the literal string
  `scaffold` (`lib/workflow.js:685–728`). On `kind: scaffold`,
  the validator **requires** `command:` and emits warnings if
  `skill:`, `role:`, or `prompt:` are present (they are
  ignored). On `kind:` omitted, the validator emits a warning
  if `command:` is present without `kind: scaffold` (likely a
  typo).
- **Set when:** filesystem mutations (`cp quick-setup`,
  `cp tick`, `cp write-summary`) and the finalize phase.
- **Omit when:** anything that needs an LLM.

##### `command:`

The shell command the scaffold runs.

- **Runtime impact:** executed verbatim by the engine after
  `{{...}}` token expansion. The command's exit status matters —
  non-zero aborts the wave with an error visible to the operator.
- **Validation:** required on `kind: scaffold` (non-empty string).
  Can use `{{...}}` from declared params; cannot use
  `${config.…}` directly (params only — same rule as `skill:`).
- **Set when:** every scaffold phase.

Use scaffolds for filesystem mutations and for declaring your own
finalizer (instead of the auto-injected default — see
[§`binds_to` and the auto-injected finalize](#binds_to-and-the-auto-injected-finalize)).

### Fan-out phases — `parent`, `materialize`, `max_children`, `min_children`

A "parent" phase produces a JSON `items:` list; the runtime then spawns
one or more "child" phases per item.

```yaml
- phase:
    id: plan
    description: Decompose into 1-10 items.
    role: planner
    skill: plan
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
    skill: plan
    prompt: |
      Plan the item assigned to this child.

- phase:
    id: child-execute
    description: Execute one item.
    parent: plan
    after: [child-plan]         # cross-sibling sequencing
    role: implementer
    skill: execute
    prompt: |
      Execute the planned item.
```

##### `parent:`

Declared on a **child** phase. The id of the parent phase whose
`items:` JSON this child consumes.

- **Runtime impact:** the runtime spawns one instance of each
  child phase per item the parent produced, in scheduling order
  honouring sibling `after:`. Per-item state is recorded under
  `<run-dir>/<parent-id>/<item-id>/`.
- **Validation:** required on every child; must reference an
  existing parent phase id.
- **Set when:** every child of a fan-out parent.
- **Common mistake:** giving children a `depends_on:` on the
  parent. They get that implicitly through `parent:`; an explicit
  `depends_on:` on the parent is redundant (and ignored — the
  fan-out scheduler reads `parent:` only).

##### `materialize:`

Declared on a **parent** phase. Controls how children are surfaced
to the run.

- **Runtime impact:** `inline` (default) keeps children inside the
  current run scaffold. `roadmap-phases` (used by the milestone
  workflow) writes each child item out as its own roadmap phase
  under `.planning/phases/` — this is what turns a milestone plan
  into a multi-phase project.
- **Validation:** must be `inline` or `roadmap-phases`. Warning
  emitted (`lib/workflow.js:757–759`) if placed on a non-parent
  phase.
- **Set when:** writing a milestone/roadmap-style workflow.
- **Omit when:** ordinary fan-out (default `inline` is correct).

##### `max_children:` / `min_children:`

Declared on a **parent** phase. The acceptable range for the
parent's `items:` list length.

- **Runtime impact:** the validator rejects `items:` lists outside
  this range at run-time, before any child is spawned — useful
  for "must produce at least one work item" and "must not
  explode into 100 items" safety rails.
- **Validation:** positive integers; defaults `min_children: 1`,
  `max_children: 10`.
- **Set when:** the parent has natural bounds (e.g., "at most 5
  reviewers").

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

There are **two** distinct inclusion mechanisms — keep them straight:

#### Phase-templates (one phase, body comes from a template)

The `template:` key sits **nested inside** a `phase:` block. The
phase's id, description, and `after:` stay in the workflow; the
phase's body (`role`, `skill`, `prompt`, …) comes from the named
phase-template after `{{arg}}` substitution.

```yaml
phases:
  - phase:
      id: review-auth
      description: review-auth
      template:
        name: reviewer            # phase-template name
        args:
          scope: auth
          min_findings: 1
      after: [ plan ]
```

Resolution order (project shadows built-in):
1. `<projectDir>/.planning/phase-templates/<name>.yaml`
2. `<repoRoot>/templates/phase-templates/<name>.yaml`

Built-ins: `feature-plan`, `feature-execute`, `reviewer`.

CLI: `cp phase-template ls` (list), `cp phase-template show <name>`
(print YAML), `cp phase-template new <name> [--from <built-in>]`
(scaffold a new one in `.planning/phase-templates/`).

#### Workflow-templates (one inclusion expands to multiple phases)

The `- template:` key sits **at the top level** of `phases:`. It
expands into multiple phases — each prefixed with the inclusion's
`id` via the namespace separator `--`. The included workflow-template
declares its own `params:` schema; pass values through `args:`.

```yaml
phases:
  - phase:
      id: plan
      description: plan
      role: planner
      skill: plan
      prompt: "Plan the change."

  - template:
      id: r                           # local namespace for expanded phases
      name: review-and-address        # workflow-template name
      args:
        scope: auth
      after: [ plan ]                 # depends_on: is NOT allowed here
```

After expansion, the `review-and-address` template (which itself has
two phases, `review` and `address`) contributes phases `r--review`
and `r--address` to the parent workflow's DAG.

Resolution order (project shadows built-in,
`lib/workflow-template-loader.js:25–27`):
1. `<projectDir>/.planning/workflow-templates/<name>.yaml`
2. `<repoRoot>/templates/workflow-templates/<name>.yaml`

Built-ins: `review-and-address`.

CLI: `cp workflow-template ls`, `cp workflow-template show <name>`,
`cp workflow-template new <name> [--from <built-in>]`.

| Field   | Where                          | Notes |
| ------- | ------------------------------ | ----- |
| `id`    | both                           | Local id. Required. Becomes the namespace prefix for workflow-template inclusions. |
| `name`  | both                           | Template name as listed by the matching `ls` command. |
| `args`  | both                           | Map of arg name → value. Must satisfy the template's `params:` schema. |
| `after` | top-level workflow-template    | Same semantics as on regular phases. `depends_on:` is **not** allowed on inclusions. |

## The v1.6 invocation contract

When `cp run` prints a wave under `supervised: true`, every phase in
it gets a block in this exact shape:

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

Above the contract preamble, the runtime also prints any **Global
directives** (`lib/runtime.js:330–344`) gathered from
`.planning/PROJECT.md` (project constraints) and the template's
`principles:` field. Those directives apply to every phase of the
workflow and the agent re-reads them at the start of every wave.

### Line-by-line meaning

| Line                | Source                                             | What the agent / harness should do |
| ------------------- | -------------------------------------------------- | ---------------------------------- |
| `Phase: <id>`       | phase `id:`                                        | Identifies which phase the rest of the block describes. Used for the matching `cp run mark-complete <slug> <id>` call. |
| `role:`             | phase `role:` (or `(absent)`)                      | Persona reminder. Free-form. Not routing. |
| `model:`            | phase `model:` (or `(absent)`)                     | Advisory model hint. The cp engine doesn't switch models — the harness may. |
| `invoke skill:`     | resolved `skill:` (or `(none)`)                    | The agent's harness must dispatch the named skill via its skill tool. `(none)` means follow `prompt:` inline without a dedicated skill. |
| `skill resolved via:` | `--verbose` only; from `resolvePhaseSkill()`     | Provenance: `routing-key` / `pinned` / `unknown` / `absent`, plus the source provider. Useful when debugging "why did it route there?" |
| `persist_output:`   | phase `persist:` (or `(absent)`)                   | If `true`, the agent's `mark-complete` summary will be folded into `DESIGN.md`; the agent should write a summary the next phase can build on, not a one-liner. |
| `prompt: \|`         | phase `prompt:` (verbatim, trailing blank stripped) | The actual instructions for this phase. |

### What to do when the contract says…

- **`invoke skill: (none)`** — no skill was named; do the work inline.
  This is fine for prompt-only phases (one-off "tell me X about Y"
  steps).
- **Unknown skill warning above the block** — the resolver didn't
  recognise the value. Either fix the workflow (`skill:` should be a
  canonical key or a literal skill name) or, if the harness *does*
  have a skill by that name, proceed and tell the operator the
  template has a stale routing value.
- **Skill not present in harness** — fall back to inline execution
  and tell the user which skill is missing so they can install it
  or revise the template.



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
| `cp run state <slug> [--json]`                                | Print supervised-run `state.json` (read-only). |
| `cp run state get <slug> <path>`                              | Get a value at a dot-path from `state.json`. |
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

## Aliases and legacy forms

The loader normalises a few legacy spellings silently before
validation runs:

| Legacy form               | Normalised to              | Notes |
| ------------------------- | -------------------------- | ----- |
| `binds_to: custom`        | `binds_to: quick`          | Silent rewrite at `lib/workflow.js:72–78`. `validate` does not warn. |
| `persist_output:` field   | `persist:` (run-time only) | The deprecation warning fires only when the runtime expands a phase for execution (`lib/workflow.js:1168`), **not** from `cp workflow validate`. |

The bare `- id: …` phase entry (without `phase:` wrapping) is **not**
a deprecation — it's a hard validation **error** (see Validation
errors table above, "entry must be wrapped in `phase:`").

Prefer the modern form in new workflows; the runtime keeps reading
the legacy forms for backward compatibility with already-published
templates.
