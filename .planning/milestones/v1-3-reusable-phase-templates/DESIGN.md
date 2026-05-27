# v1.3 Reusable Phase Templates — Design Discussion Log

> Working file. Captures design decisions reached via Q&A. Will be folded
> into `.planning/milestones/v1-3-reusable-phase-templates/DESIGN.md` once
> all forks are resolved.

---

## Q1 — Parameterization model

**Decision:** (b) **Parameterized templates** with `{{name}}` substitution.

### Which properties can be parameterized?

ALL fields, via `{{name}}` substitution at the string level.

- **String fields** (`id`, `prompt`, `skill`, `role`, `parent`): `{{var}}`
  is substituted in-place.
- **Array fields** (`after`, `principles`): each element string supports
  substitution.
- **Numeric fields** (`max_children`, `min_children`) and **booleans**
  (`persist`, `optimizable`): value MAY be `{{var}}`; result is cast on
  assignment, with a load-time error if cast fails.

### Substitution syntax

- `{{name}}` only — Mustache-flat.
- No expressions (no `{{name | upper}}`, no defaults inside braces).
- **Missing arg** → load-time error with template name + missing var name.
- **Unused arg** → load-time warning, not error (forward-compat when a
  template drops a param).

### Parameter declaration

Defaults declared on the template:

```yaml
phase_templates:
  - name: review
    params:
      - name: target
        default: "the diff"     # optional; absence means required
    role: reviewer
    skill: code-review
    prompt: "Review {{target}} against the milestone goal."
```

If a param has no `default:`, callers MUST provide it.

---

## Q2 — Template name resolution + precedence

**Same lookup chain applies to BOTH phase templates AND workflow
templates** (separate namespaces — a name can exist in both).

| Priority    | Source                                                                |
|-------------|-----------------------------------------------------------------------|
| 1 (highest) | Inline `phase_templates:` / `workflow_templates:` in calling workflow |
| 2           | `.planning/phase-templates/<name>.yaml` / `.planning/workflow-templates/<name>.yaml` (project-local) |
| 3 (lowest)  | `templates/phase-templates/<name>.yaml` / `templates/workflow-templates/<name>.yaml` (built-in)      |

- Same name at two levels → higher level wins, **load-time warning** logs
  the shadowed path.
- Same name twice at the same level → **load-time error**.

---

## Q3 — Workflow templates vs phase templates — disambiguated by YAML STRUCTURE

The kind of template (workflow or phase) is determined by **where the
`template:` keyword appears in the YAML structure**. One keyword, two
positions, two meanings. The `template:` value is **always an object**
(`name` + optional `args`), never a bare string.

### The structural rule

Each entry in `phases:` is a one-key object. Its top-level key is the
**wrapper kind**:

| Top-level wrapper key | Meaning                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| `phase:`              | **Single phase.** Body holds `id` + normal phase fields + optional `template:` (→ phase-template reference). |
| `template:`           | **Workflow-template inclusion.** Body holds `id`, `name` (which template), optional `args`, optional `after`. Expands into a group of phases here. |

The `template:` field **inside** `phase:` is always an **object**:

```yaml
template:
  name: <template-name>
  args:
    <param>: <value>
```

### Caller-side YAML (canonical example)

```yaml
phases:
  - phase:
      id: plan
      template:
        name: plan-template          # phase template
        args:
          name: my plan

  - template:
      id: review                     # explicit group handle
      name: review-and-address       # workflow template
      args:
        scope: auth
      after: plan

  - phase:
      id: execute
      template:
        name: docker-build           # phase template
        args:
          image: api
      after: review                  # depends on the WHOLE group
```

### Workflow-template definition file

Same wrapped shape internally:

```yaml
# templates/workflow-templates/review-and-address.yaml
name: review-and-address
params:
  - name: scope
phases:
  - phase:
      id: review-{{scope}}
      role: reviewer
      skill: code-review
      prompt: "Review {{scope}} against the milestone goal."
  - phase:
      id: address-{{scope}}
      role: implementer
      after: [review-{{scope}}]
      prompt: "Address review comments on {{scope}}."
```

A workflow template MAY itself contain another `template:` entry
(workflow-template chaining), bounded by the depth cap.

### Back-compat with v1.2

Existing v1.2 workflows use **bare** phase entries (no wrapper):

```yaml
phases:
  - id: plan
    role: planner
```

At load time, **any list entry whose top-level key is neither `phase:`
nor `template:`** is auto-wrapped into a synthetic `phase:`. Internal
model is always wrapped; YAML authors may use either form. v1.3
documentation prefers the explicit form.

### `id:` rules

- **`phase:` entries** — `id:` required (unchanged from v1.2).
- **`template:` entries (workflow-template inclusion)** — `id:` **required**.
  This id becomes the **group handle** for `after:` references from
  outside the group. No auto-generation: explicitness > magic when
  cross-entry references are involved.
- Group-handle id MUST be unique against all other sibling-level
  ids (phase ids and other group handles).
- Group-handle id is virtual: it is **erased** from the materialized
  phase list after resolution and never runs.

### Id namespacing on template expansion

To prevent id collisions between phases produced by different template
inclusions (or by a template and a sibling phase), every phase
materialized from a `template:` entry is **prefixed with the group
handle id**, joined by `--`:

    <group-id>--<template-internal-id>

- Internal `after:` references within the template are rewritten with
  the same prefix so the subgraph remains internally consistent.
- External `after: <group-id>` is rewritten to all *prefixed* exit
  phases of the expanded group.
- Nested templates **stack** prefixes (outer group `id: outer`
  containing `template: { id: inner }` → phase `outer--inner--phase`).
- The `--` separator is reserved: template-internal ids may contain
  single hyphens freely; `--` is the namespace boundary.

### Allowed fields per entry kind

| Field        | `template:` entry (workflow include) | `phase:` entry, no inner `template:` | `phase:` entry, with inner `template:` |
|--------------|---------------------------------------|---------------------------------------|-----------------------------------------|
| `id:`        | Required (group handle)               | Required                              | Required                                |
| `name:`      | Required (which workflow template)    | —                                     | — (lives inside inner `template:`)      |
| inner `template: {name, args}` | —                            | Forbidden                             | Required                                |
| `args:`      | Optional (workflow template params)   | Forbidden                             | — (lives inside inner `template:`)      |
| `after:`     | Optional                              | Optional                              | Optional                                |
| `role:` / `skill:` / `prompt:` / `parent:` / `max_children:` / `min_children:` / `persist:` / `principles:` | **Forbidden** — fork to customize | Optional, normal fields | **Forbidden** — customize via template `params:` / `args:`, or fork the template |

Validator enforces the table; error messages cite the exact YAML path.

**Rationale for forbidding overrides:** silent key-by-key merge creates
subtle "where did this value come from" debugging problems and forces
authors to read both the template and the call site to predict
behavior. A hard error keeps the template's contract local and pushes
all customization through declared `params:`.

### How dependencies attach to a `template:` (workflow-include) entry

The entry's `id:` is a **virtual group handle**. The runtime treats the
expanded group as a subgraph with implicit entry / exit nodes:

| Direction                              | Meaning                                              | Resolution                                                                                       |
|----------------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `after:` ON the `template:` entry      | "Wait until X before any phase in the group starts"  | Prepended to every **entry** phase (entry = no inbound edge from a phase inside the group).      |
| `after: <handle>` on outside phase     | "Wait until the whole group is done"                 | Rewritten at load time to `after: [<every exit phase>]` (exit = no outbound edge inside group).  |

### Worked example — caller above resolves to

```yaml
phases:
  - id: plan
    template: plan-template                  # (phase-template, resolved separately)
  - id: review--review-auth                  # prefixed; entry phase of the group
    after: [plan]                            # ← inherited from group's `after: plan`
  - id: review--address-auth                 # prefixed; exit phase of the group
    after: [review--review-auth]             # internal edge, also prefixed
  - id: execute
    template: docker-build
    after: [review--address-auth]            # ← rewritten from `after: review`
```

The group-handle id `review` does not appear in the materialized list.

### Edge-case rules

- Group-handle `id:` collision with any other id → load-time error.
- Phase ids materialized from a workflow-template expansion must not
  collide with any other id (inside or outside the group).
- **Empty group** (workflow template materializes zero phases) →
  load-time error.
- **Single-phase group** → entry == exit; rewrite rules degenerate
  cleanly.
- **Depth cap 3** for both workflow-template chaining and
  phase-template chaining (a phase template that references another
  phase template via `template:` is rare but possible).
- Two source directories (`phase-templates/`, `workflow-templates/`);
  same name in both is legal — the call site picks the directory via
  YAML structure (inner `template:` → phase-templates; top-level
  `template:` → workflow-templates).

---

## Q7 — Migration / dogfooding — LOCKED

**Refactor `templates/workflows/dev.yaml` into the new template
shape as part of v1.3.**

- Identify natural sub-patterns inside the current `dev.yaml` (e.g. a
  review-and-address pair, a build-and-verify pair) and extract them
  into built-in workflow templates under
  `templates/workflow-templates/`.
- Extract any phase definitions that recur across workflows into
  built-in phase templates under `templates/phase-templates/`.
- Rewrite `dev.yaml` to use the new structural shape (`phase:` /
  `template:` wrappers + references).
- The behavior of `cp run dev …` must remain **identical** after the
  refactor (verified by snapshotting the resolved graph before and
  after).
- Update MIGRATION-v1.3.md with the diff and instructions for users
  who have forked `dev.yaml`.

This proves the contract end-to-end and gives users a real-world
example to copy from.

---

## Q4 — Merge semantics — LOCKED

**No merge.** A `phase:` entry that references a `template:` is
restricted to `id` + `template` + `after`. Any additional phase field
on that entry is a **load-time error**. Customization must go through
the template's declared `params:` (via `args:`) or by forking the
template into a new file. See Q3 field-rules table.

---

## Q5 — Validation strategy — LOCKED

**Two-layer validation, standalone is opt-in:**

1. **Post-merge validation** (always, on the resolution path).
   When a workflow is loaded for run / inspect, the fully-resolved
   phase graph is validated:
   - Field-rules table (Q3/Q4) enforced per entry.
   - All `args:` satisfied (Q1); unused args → warning.
   - All `after:` refs resolve to a real materialized phase id.
   - No id collisions after namespace prefixing.
   - Depth cap (3) not exceeded.
   - No empty group from a workflow-template expansion.
   - DAG is acyclic.

2. **Standalone template validation** (opt-in).
   Triggered by:
   - `cp doctor` — sweeps every file under
     `templates/{phase,workflow}-templates/` and
     `.planning/{phase,workflow}-templates/`; reports per-file errors
     and warnings. Non-fatal if any template is broken.
   - `cp template lint [<path|name>]` — same checks, scriptable for
     pre-commit / CI.
   Standalone checks include: YAML well-formedness, `params:` shape,
   self-contained `{{var}}` references resolve to declared params,
   internal `after:` refs resolve to internal phase ids
   (pre-namespacing).

Runtime workflows do **not** trigger the standalone sweep — they
validate only what they actually resolve. Authors who want the broader
guarantee wire `cp template lint` into their commit hooks / CI.

---

## Q6 — CLI surface — LOCKED

Seven new / extended commands ship in v1.3:

| Command | Purpose |
|---|---|
| `cp workflow inspect <name>` | Resolved phase graph + topological execution levels + fan-out parent annotations. Static analysis only; fan-out children resolved at runtime (controlled by v1.2 `optimizable` flag). Flags: `--raw` (print authored YAML, no expansion), `--json` (machine-readable). |
| `cp template lint [<path\|name>]` | Standalone validation per Q5. Default = sweep every template under both source directories. |
| `cp template list` | Enumerate templates. Flags: `--name <glob>` (wildcard), `--type phase\|workflow`, `--scope project\|builtin`. Default = all. Shows shadowing markers when same name exists at higher priority. Inline templates only surface via `cp workflow inspect`. |
| `cp template export <name> [--to <path>]` | Copy a built-in or project template file out (defaults to stdout). Useful to fork a built-in for local customization. |
| `cp template import <path> [--as <name>]` | Copy an external template file into `.planning/{phase\|workflow}-templates/` (kind auto-detected from file shape; explicit `--as` overrides the name). |
| `cp phase-template new <name>` | Scaffold a new phase template into `.planning/phase-templates/<name>.yaml`. |
| `cp workflow-template new <name>` | Scaffold a new workflow template into `.planning/workflow-templates/<name>.yaml`. |

Existing `cp doctor` is extended to call `cp template lint` as part of
its standard sweep (non-fatal — broken templates surface as warnings).

### `cp workflow inspect` output shape (sketch)

```
Workflow: dev (templates/workflows/dev.yaml)
  Level 0:  plan
  Level 1:  review--review-auth
  Level 2:  review--address-auth
  Level 3:  execute  [fan-out, max_children=5] — children resolved at runtime
```

`--json` returns the same structure as
`{ workflow, levels: [[ids]], fanout: { id: { max, min } } }`.
