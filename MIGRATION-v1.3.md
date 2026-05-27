# Migration guide: v1.2 → v1.3

**TL;DR**: v1.3 is **strictly additive**. No v1.2 workflow needs changes.
Upgrade by running `npm install -g context-planning@1.3` and you're done.

The new features are opt-in via two wrapper grammars that you can adopt
incrementally as you find repeating patterns in your workflows.

## What's new

### 1. Phase templates — extract reusable phase bodies

Define a parameterized phase once, reuse it everywhere:

```yaml
# .planning/phase-templates/reviewer.yaml
name: reviewer
params:
  - name: scope
role: reviewer
prompt: "Review the {{scope}} changes."
```

Then reference it from any workflow:

```yaml
# my-workflow.yaml
phases:
  - phase:
      id: review-auth
      template:
        name: reviewer
        args:
          scope: auth
      after: [plan]
```

The wrapper supplies `id:`, `after:`, and `depends_on:`. Everything else
comes from the template body. Chain depth is capped at 3.

### 2. Workflow templates — splice a multi-phase group inline

Define a reusable mini-flow:

```yaml
# .planning/workflow-templates/review-and-address.yaml
name: review-and-address
params:
  - name: scope
phases:
  - id: review-{{scope}}
    role: reviewer
    prompt: "Review {{scope}}."
  - id: address-{{scope}}
    role: implementer
    after: ["review-{{scope}}"]
    prompt: "Address review findings for {{scope}}."
```

Include it from any workflow:

```yaml
phases:
  - id: plan
    role: planner
  - template:
      id: review            # group handle (virtual)
      name: review-and-address
      args:
        scope: auth
      after: [plan]
  - id: execute
    after: [review]         # rewritten to depend on group exits
```

Inner phase ids are namespaced with the group handle:
`review--review-auth`, `review--address-auth`. Outside refs to the group
handle (`after: [review]`) are rewritten to depend on the group's exit
phases. Chain depth is capped at 3.

### 3. New CLI commands

```bash
cp phase-template ls [--json]
cp phase-template show <name>
cp phase-template new <name> [--from <built-in>] [--force]

cp workflow-template ls [--json]
cp workflow-template show <name>
cp workflow-template new <name> [--from <built-in>] [--force]
```

`cp workflow inspect <name>` now also surfaces:
- `templates_referenced` — every template the workflow uses
- `resolver_warnings` — warnings from template resolution
- post-expansion resolved phase list (the existing wave display)

## What did NOT change

- The bare phase entry form (`- id: foo`) is unchanged.
- All v1.2 workflows load and run identically.
- The `cp run` runtime, fan-out semantics, and DAG execution are unchanged.
- No file moves, no renames, no schema-breaking changes.

## Built-in templates that ship with v1.3

| Kind              | Name                  | Purpose                                        |
|-------------------|-----------------------|------------------------------------------------|
| Phase template    | `reviewer`            | Parameterized code review phase                |
| Phase template    | `feature-plan`        | Per-feature planning phase (fan-out child)     |
| Phase template    | `feature-execute`     | Per-feature execution phase (fan-out child)    |
| Workflow template | `review-and-address`  | Two-phase review→address mini-flow             |

See `templates/workflows/_examples/dev-templated.yaml` for a full
example that reproduces the production `dev.yaml` fan-out using
phase templates.

## Lookup precedence (per DESIGN.md Q2)

For both kinds, project-local files override built-ins by name:

1. `<projectDir>/.planning/phase-templates/<name>.yaml`
2. `<repoRoot>/templates/phase-templates/<name>.yaml` (built-in)

(Same shape for workflow templates.)

## Should I migrate my existing workflows?

Only when you actually have repetition. The point of v1.3 is to give you
the *option* to factor out common patterns without forcing a rewrite.
We deliberately did NOT migrate the production `templates/workflows/dev.yaml`
because it has only one fan-out pair and the duplication cost is low.

When you DO migrate:

1. Identify a phase body (or multi-phase group) that appears in 2+ workflows.
2. Extract it to a template file with parameters for the parts that vary.
3. Replace each occurrence with a `phase:` or `template:` wrapper.
4. Run `cp workflow inspect <workflow>` to verify the resolved phase list
   matches what you had before.
5. Commit.

## Troubleshooting

- **"phase-template not found"** — check spelling and that the file is
  under one of the two lookup paths above. Use `cp phase-template ls` to
  confirm what cp can see.
- **"Phase-template chain depth exceeds 3"** — a template body references
  another template that references another... cycle or too deep. The cap
  protects against unbounded recursion.
- **"workflow-template group-handle id collides with another phase id"** —
  the `id:` you gave the group is the same as a sibling phase id. Rename.
- **YAML parse error on `after: [foo-{{bar}}]`** — quote the templated
  string in flow sequences: `after: ["foo-{{bar}}"]`. Block style
  (`- foo-{{bar}}`) works unquoted.
