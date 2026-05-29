# Workflow templates: recipes and patterns

> **Audience:** project users adapting or composing custom templates
> from real-world patterns. Prereq: you've read the
> [quickstart](./quickstart.md) and know the schema basics from the
> [reference](./reference.md).
>
> Every recipe below is grounded in one of the built-in templates
> (`cp workflow show <name>`). Use them as starting points:
> `cp workflow new my-flow --from <built-in>`.

Each recipe answers three questions:

1. **When to use it.**
2. **What the YAML looks like.**
3. **What to watch out for.**

---

## Recipe 1 — Clarify-then-execute pair (basic 2-phase with STOP gate)

**When:** Most "small task" workflows. Discuss scope with the user
first; only then do the work.

**YAML:**

```yaml
workflow: small-task
version: 1
binds_to: quick
supervised: true
params:
  - name: slug_with_date

phases:
  - phase:
      id: design
      description: |
        Agree on Approach + Done-When with the user before any
        implementation. Mark status=ready in DESIGN.md only AFTER
        explicit user confirmation.

        STOP. Do not start implementation. The user's brief is a
        starting point, NOT a green light. Ask follow-ups until both
        Approach and Done-When are unambiguous.
      role: tech-writer
      skill: ${config.provider.plan_skill}
      outputs:
        - ".planning/quick/{{slug_with_date}}/DESIGN.md"
      prompt: |
        Open DESIGN.md and work with the user to fill in Approach +
        Done-When. Wait for explicit user confirmation before marking
        complete.

  - phase:
      id: execute
      description: Implement the change agreed in DESIGN.md.
      depends_on: [design]
      role: developer
      skill: ${config.provider.execute_skill}
      prompt: |
        Implement the change agreed in DESIGN.md. Commit atomically
        per task; append progress notes to STATE.md.
```

**Watch out:**

- The STOP language goes in **both** `description:` and `prompt:` —
  `description:` is what the user sees in `cp workflow inspect`;
  `prompt:` is what the harness reads.
- The `outputs:` field is a hint for humans, not enforced.
- `binds_to: quick` auto-injects the `finalize` phase. You can omit
  it.

**See:** built-in `quick` (`cp workflow show quick`).

---

## Recipe 2 — Fan-out children via `materialize`

**When:** A planner phase decides how many sub-tasks are needed (1
–10); the runtime spawns one child phase per item.

**YAML:**

```yaml
- phase:
    id: plan
    description: Decompose the milestone into 1-10 sub-features.
    role: planner
    skill: ${config.provider.plan_skill}
    max_children: 10
    min_children: 1
    materialize: inline           # default; "roadmap-phases" for milestone
    prompt: |
      Return JSON:
        { "optimizable": false,
          "items": [ { "id": "slug", "title": "..." } ] }

- phase:
    id: child-plan
    description: Plan one sub-feature in detail.
    parent: plan                  # marks this as a child of `plan`
    role: planner
    skill: ${config.provider.plan_skill}
    prompt: |
      Produce a detailed plan for the assigned sub-feature.

- phase:
    id: child-execute
    description: Execute one sub-feature.
    parent: plan
    after: [child-plan]           # sequence siblings within the fan-out
    role: implementer
    skill: ${config.provider.execute_skill}
    prompt: |
      Execute the planned sub-feature. Commit atomically per task.
```

**Watch out:**

- Children **must** declare `parent:`; without it, they're not part of
  the fan-out.
- Children do **not** inherit `role:` or `skill:` — spell them on
  every child.
- The parent's JSON output drives spawning. Item count must be within
  `[min_children, max_children]` or the runtime errors.
- `after: [child-plan]` sequences siblings within the same parent's
  fan-out (not across waves).

**See:** built-in `dev` (`cp workflow show dev`) and `docs`.

---

## Recipe 3 — Supervisor-supplied params (no `default:`)

**When:** A value the supervisor (e.g., the slash-skill driver) knows
at run-time but the template author doesn't.

**YAML:**

```yaml
params:
  # Defaults: routes you control at template-author time.
  - name: design_skill
    default: "plan"
  # Supervisor-supplied: no default. Injected per run.
  - name: task_description
  - name: slug_with_date

phases:
  - phase:
      id: setup
      description: Scaffold the quick directory.
      kind: scaffold
      command: "cp quick-setup --task '{{task_description}}'"

  - phase:
      id: design
      description: Discuss the task with the user.
      depends_on: [setup]
      role: tech-writer
      skill: "{{design_skill}}"
      outputs:
        - ".planning/quick/{{slug_with_date}}/DESIGN.md"
      prompt: |
        Open .planning/quick/{{slug_with_date}}/DESIGN.md and work with
        the user on Approach + Done-When.
```

**Watch out:**

- Declaring a `params:` entry **without** `default:` is the *only*
  way to keep leftover `{{name}}` tokens after the expand pass. Any
  other unresolved token is an error.
- The supervisor (your slash skill or driver) is responsible for
  injecting these values per-phase at run-time; the template just
  declares the contract.

**See:** built-in `quick` (params for `slug_with_date` and
`task_description`).

---

## Recipe 4 — `${config.provider.*_skill}` for provider portability

**When:** You want the template to work for any provider (Superpowers,
manual, etc.) without hard-coding skill paths.

**YAML:**

```yaml
phases:
  - phase:
      id: plan
      description: Plan the change.
      role: planner
      skill: ${config.provider.plan_skill}      # zero-config fallback
      prompt: |
        Produce a detailed plan.

  - phase:
      id: review
      description: Review the proposed change.
      depends_on: [plan]
      role: reviewer
      skill: ${config.provider.review_skill}
      prompt: |
        Review for correctness, scope creep, and missed edge cases.
```

**Watch out:**

- `${config.path}` references are resolved at run-time from
  `cp doctor`'s view of your provider config; they don't need a
  `params:` entry.
- If a provider doesn't define a particular `<x>_skill`, cp falls
  back to a built-in default (see the reference for the table).
- `${config.…}` is distinct from `{{…}}`: dotted tokens **only** work
  through `${config.…}`. `{{provider.plan_skill}}` is forbidden.

**See:** built-in `quick` and `docs` (both use these references
throughout).

---

## Recipe 5 — Mixing scaffold + prompt phases

**When:** You want `cp` to do the deterministic filesystem work
(scaffold a directory, write `SUMMARY.md`, tick a plan) while the
harness handles the open-ended thinking.

**YAML:**

```yaml
phases:
  - phase:
      id: setup
      description: Create the run directory.
      kind: scaffold
      command: "cp quick-setup {{slug_with_date}}"

  - phase:
      id: think
      description: Plan + discuss.
      depends_on: [setup]
      role: planner
      skill: ${config.provider.plan_skill}
      prompt: |
        Draft the plan; check it with the user.

  - phase:
      id: finalize
      description: Write SUMMARY.md and flip status=complete.
      depends_on: [think]
      kind: scaffold
      command: "cp quick-finalize {{slug_with_date}}"
```

**Watch out:**

- `kind: scaffold` requires `command:`. No `prompt:`, no `skill:`, no
  `role:` (the runtime runs the command itself).
- The contract block for a scaffold phase prints `invoke skill:
  (none)` — there's nothing for the harness to do.
- You can omit your own `finalize` and let the runtime auto-inject
  one (see Reference §`binds_to`).

**See:** built-in `quick` and `milestone`.

---

## Recipe 6 — Custom roles vs canonical routing keys

**When:** You want a human-readable persona label that's distinct
from the routing key.

**Anti-pattern:**

```yaml
- phase:
    id: plan
    role: plan                # ← validator warns: 'plan' is a routing key
    prompt: |
      Plan the change.
```

The validator (`v1.5` rule) warns: *"role 'plan' looks like a routing
key — role is persona only; use `skill: plan` instead and set role to
a persona (e.g., developer, tech-writer)."*

**Pattern:**

```yaml
- phase:
    id: plan
    role: tech-writer                              # persona
    skill: ${config.provider.plan_skill}           # routing
    prompt: |
      Plan the change.

- phase:
    id: investigate
    role: analyst                                  # custom persona
    skill: ${config.provider.brainstorm_skill}     # explicit routing
    prompt: |
      Investigate the cause before proposing a fix.
```

**Watch out:**

- `role:` is persona-only; the v1.6 contract block shows it for the
  human reader but doesn't use it to route work.
- If both `role:` and `skill:` are routing keys *and they disagree*,
  the validator fails (`role 'plan' and skill 'execute' both as
  routing keys — they must agree`).
- Use canonical routing keys (`plan`, `execute`, `review`, `brainstorm`,
  `verify`, `debug`, `worktree`, …) in `skill:`; use free personas in
  `role:`.

**See:** Reference §"Skill phases" for the canonical routing key list.

---

## Recipe 7 — Supervised vs unsupervised

**When:** Most authors want `supervised: true`. Reach for `false`
only for short fully-automated chains.

**Supervised (default for built-ins):**

```yaml
workflow: review-pass
version: 1
binds_to: quick
supervised: true             # cp run prints one wave at a time
phases:
  - phase:
      id: review
      description: ...
      role: reviewer
      skill: ${config.provider.review_skill}
      prompt: |
        Review the diff.
```

`cp run review-pass` prints **wave 1** with the contract block, then
exits. You drive forward with
`cp run mark-complete <slug> review`, which prints wave 2 (or
finalize), and so on.

**Unsupervised:**

```yaml
supervised: false           # engine drives all waves itself
```

No `mark-complete` calls; the engine fires every phase in sequence
without waiting for human acknowledgement.

**Watch out:**

- `supervised: false` skips the v1.6 contract block — there is no
  per-wave checkpoint for a human to read.
- All built-ins use `supervised: true`. There is rarely a good reason
  for a custom template to be unsupervised.

---

## Recipe 8 — `optimizable: true` DAG opt-in for parallel items

**When:** Your planner phase knows the *exact* dependency graph
between items and you want the runtime to execute independent items
in parallel.

**Default (sequential):**

The planner returns:

```json
{
  "optimizable": false,
  "items": [
    { "id": "a", "title": "..." },
    { "id": "b", "title": "..." },
    { "id": "c", "title": "..." }
  ]
}
```

Runtime executes `a → b → c` in list order. Any `depends_on` on the
items is ignored.

**Opt-in DAG:**

The planner returns:

```json
{
  "optimizable": true,
  "items": [
    { "id": "schema",   "title": "...", "depends_on": [] },
    { "id": "migrate",  "title": "...", "depends_on": ["schema"] },
    { "id": "seed",     "title": "...", "depends_on": ["schema"] },
    { "id": "verify",   "title": "...", "depends_on": ["migrate", "seed"] }
  ]
}
```

Runtime runs `schema`, then `migrate` + `seed` in parallel, then
`verify`. The graph is computed from `depends_on`.

**Watch out:**

- `optimizable: true` is **only** meaningful if **every** item declares
  `depends_on` (use `[]` for no deps). One missing entry and the
  runtime falls back to sequential.
- If you're unsure about any dependency, set `optimizable: false` and
  list items in safe order. Mistaken parallelisation is harder to
  debug than slow sequential execution.
- This flag is in the planner's JSON output, not in the template.

**See:** built-in `dev` and `docs` (planner prompts mention this
mechanism explicitly).
