---
name: cp-workflow-brainstorm
description: Design a new workflow template conversationally. Delegates to the configured provider's brainstorm skill, then writes a draft YAML.
argument-hint: "[--workflow <name>] [--out <path>]"
requires: []
---

# /cp-workflow-brainstorm

You are running `cp-workflow-brainstorm`. Your job is to help the
user design a brand-new workflow template — its phases, the DAG
between them, the role for each phase, the prompts — through
conversation, then emit a draft YAML file ready for editing and
validation.

This skill is the agent-side companion to `cp workflow brainstorm`.
The underlying CLI prints a guided context block (workflow design
prompts, template structure, examples) which you'll use as the
brainstorm starting point. The conversation itself is delegated to
the configured provider's `brainstorm` role skill (resolved via
`cp doctor`).

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- Optional `--workflow <name>`: the working name of the new
  workflow. Default: `new-workflow`. Sanitize against
  `^[A-Za-z0-9][A-Za-z0-9_-]*$`.
- Optional `--out <path>`: destination for the draft YAML. Default:
  `.planning/workflows/<workflow>.yaml`.

If both arguments are missing, ask the user (one focused question):

> "What's the working name for the new workflow you want to design?"

Common cases: `code-review`, `release-prep`, `bug-triage`,
`onboarding`. The name doesn't need to be final — it's just the
working slug.

## Step 2 — Fetch the brainstorm context

```bash
cp workflow brainstorm --workflow <name> --out <path>
```

`cp workflow brainstorm` is itself a thin orchestrator. It:
- emits a structured brainstorm context block on stdout (workflow
  design framework: pick goal, identify phases, role per phase, deps),
- prints "next:" guidance on stderr,
- if the provider has a brainstorm skill installed, delegates the
  actual conversation to it; otherwise prints a manual prompt for
  you to walk the user through.

Capture the stdout block — it's the seed for the design conversation.

## Step 3 — Resolve the brainstorm provider

```bash
cp doctor
```

Look for `Roles -> resolved skill -> brainstorm`. Typical resolutions:

- **Superpowers**: `brainstorming` skill (the default; ~10-15 turn
  Socratic discovery flow).
- **Manual fallback**: walk the user through the design questions
  yourself, using the brainstorm context from Step 2 as the script.

## Step 4 — Run the brainstorm

Delegate to the resolved skill (Superpowers: invoke `brainstorming`).
Hand it the brainstorm context from Step 2 as the seed, and let it
drive the conversation to a structured outcome:

- **Goal**: what business / engineering problem the workflow solves.
- **Phases** (list, in dependency order): `id`, one-sentence purpose,
  the `role` that should execute it.
- **Dependencies**: which phases must complete before each other (the
  default is a linear chain; parallel waves come from multiple phases
  sharing the same `depends_on:`).
- **Principles**: 2-4 global directives that apply to every phase
  (e.g. "Don't commit until confirmed").
- **Binding**: `milestone` / `phase` / `custom` — which state tier
  the workflow attaches to.

## Step 5 — Synthesize the draft YAML

Once the brainstorm produces enough structure, write the draft to
`<out>` in the cp workflow YAML format:

```yaml
workflow: <name>
version: 1
binds_to: <milestone|phase|custom>
principles:
  - <principle 1>
  - <principle 2>
defaults:
  model: default
phases:
  - id: <phase-id>
    role: <role>
    prompt: |
      <phase prompt body>
  - id: <next-phase>
    depends_on: [<prev-phase>]
    role: <role>
    prompt: |
      <…>
```

If `--out`'s parent directory doesn't exist, create it (or refuse
politely and ask the user to `cp workflow init`).

## Step 6 — Validate the draft

```bash
cp workflow validate <out> --strict
```

- If validate passes → tell the user the draft is ready:
  ```
  ✓ Draft workflow `<name>` written to `<out>` and validated.

  Next: /cp-workflow-inspect <name>     # see the wave order
        /cp-workflow-run <name> <slug>  # try it on a real task
  ```
- If validate fails → iterate: surface the errors, walk the user
  through fixes, re-write the YAML, re-validate. Don't promote the
  draft to a "ready" state until validation is clean.

## Step 7 — Confirm

Ask the user one focused question:

> "Want to run this workflow now, or save it and come back later?"

Don't auto-launch `/cp-workflow-run` — let the user opt in.

## Notes

- This skill calls the provider's brainstorm skill; the conversation
  shape depends on which provider is configured. Superpowers' default
  is a 10-15 turn discovery flow.
- The draft YAML is intentionally minimal (no `model:` overrides, no
  `skill:` field on each phase) — the user can layer those in after
  the first happy-path run.
- For *cloning* an existing built-in as a starting point (instead of
  designing from scratch), prefer `/cp-workflow-new <name> --from
  <built-in>` — much faster when the new workflow is "like `dev` but
  with one extra phase".
- For *tweaking* a built-in into a new project template (export →
  edit → import), prefer `/cp-workflow-customize <built-in>`.
