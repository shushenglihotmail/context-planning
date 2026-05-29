# Workflow templates: quickstart

> **Audience:** project users new to authoring custom workflow
> templates in `.planning/workflows/`. Prereq: a `cp` project
> (`cp init` done) and a harness installed
> (`cp install copilot|claude|cursor|aider`).
>
> **Time:** ~10 minutes end-to-end.

You'll build a runnable workflow named `triage` that classifies an
inbox item, drafts a response, asks the user to approve it, then
finalises. Five commands, no schema theory — that lives in
[`reference.md`](./reference.md). Patterns for fan-out, parallel
items, and custom finalizers are in [`recipes.md`](./recipes.md).

## Prerequisites

```bash
cp doctor
```

You want to see your harness, a provider (`superpowers` or `manual`),
and `Skill resolution` with the canonical keys (`brainstorm`, `plan`,
`execute`, `review`, …) resolving to skill paths. Anything labelled
`MISSING` must be installed before the engine can route phases.

```bash
cp workflow init
```

Creates `.planning/workflows/` (idempotent — safe to re-run).

## Step 1 — Seed from a built-in

Hand-typing YAML works, but `cp workflow new <name>` (without
`--from`) emits a stub whose phase entries are **not** wrapped in
`phase:` and the validator rejects them. Always seed from a built-in:

```bash
cp workflow new triage --from quick
```

This copies `templates/workflows/quick.yaml` into
`.planning/workflows/triage.yaml`. Project templates **shadow**
built-ins of the same name.

## Step 2 — Edit

Open `.planning/workflows/triage.yaml` and replace its contents with
this. The whole thing is the workflow — top-level envelope plus three
phases (a fourth, `finalize`, is auto-injected because `binds_to:
quick`).

```yaml
workflow: triage
version: 1
binds_to: quick
description: |
  Triage an inbox item: classify it, draft a response,
  ask the user to approve before sending.
supervised: true
params:
  # Supervisor-supplied per run (no default). Declaring it here
  # tells the validator to tolerate {{slug_with_date}} tokens.
  - name: slug_with_date

phases:
  - phase:
      id: setup
      description: Scaffold the quick directory.
      kind: scaffold
      command: "cp quick-setup {{slug_with_date}}"

  - phase:
      id: classify
      description: Classify the inbox item.
      depends_on: [setup]
      role: planner
      skill: ${config.provider.plan_skill}
      prompt: |
        Read the inbox item provided by the supervisor. Classify it
        as one of: bug, feature, question, noise. Return JSON:
          { "kind": "...", "rationale": "<1-2 sentences>" }

  - phase:
      id: respond
      description: Draft a response and ask the user to approve.
      depends_on: [classify]
      role: writer
      skill: ${config.provider.plan_skill}
      prompt: |
        Read the classification. Draft a response (~3 sentences)
        appropriate for the kind. Ask the user to approve, edit, or
        reject before continuing.
```

Four things worth noticing here, each cross-referenced in
[`reference.md`](./reference.md): every entry is wrapped in `phase:`,
every phase has a `description:`, `skill:` uses a
`${config.provider.plan_skill}` config fallback (your provider's
plan skill, zero-config), and `depends_on:` is what serialises phases
into waves. (`after:` works too; built-ins use `depends_on`.)

## Step 3 — Validate

```bash
cp workflow validate triage --strict
```

Expected: a single line ending in `OK`. Errors print to stderr with
file location; fix and re-run. `--strict` makes warnings (shadowed
built-in, missing description) fatal too. A common error is a bare
`- id: …` entry — wrap it in `phase:` and re-validate.

## Step 4 — Inspect the waves

```bash
cp workflow inspect triage
```

The output prints the YAML, then the deduced schedule. For `triage`
you should see 4 waves: `[setup]`, `[classify]`, `[respond]`, and
`[finalize] [auto-injected]`. Phases with no `depends_on` go in wave
1; the rest land in the first wave where all their predecessors are
done. For a picture: `cp workflow diagram triage` emits Mermaid.

## Step 5 — Run it

```bash
cp run triage my-first-triage
```

The engine creates `.planning/quick/<YYYY-MM-DD>-my-first-triage/`
(date prefix is automatic), writes a `STATE.yaml`, and prints
**wave 1** with the v1.6 contract block:

```
Phase: setup
  role:  scaffold
  invoke skill: (none)
  command: cp quick-setup ...
```

The contract is the only protocol you need to remember:

- **`invoke skill: <name>`** — your harness's agent must call that
  skill via its skill mechanism. Do **not** inline the work.
- **`invoke skill: (none)`** — no skill is routed; follow the prompt
  inline.
- **`command: …`** — a scaffold phase. The runtime already ran the
  command; there is nothing for the agent to do.

When every phase in a wave is finished, mark it complete so the next
wave prints:

```bash
echo "did the classification, kind=bug" | \
  cp run mark-complete <slug> classify
```

(The slug — `my-first-triage` plus date prefix — is printed at the
bottom of every wave block.) Repeat through `respond`; the
auto-injected `finalize` phase then runs `cp quick-finalize`, writes
`SUMMARY.md`, and flips `STATE.yaml` `status` to `complete`.

Pause any time by walking away. Resume with `cp run resume <slug>`.
List in-flight runs with `cp run status`.

## Where to go next

- [`reference.md`](./reference.md) — every field, every default,
  every exit code.
- [`recipes.md`](./recipes.md) — fan-out, parallel-with-dependencies,
  custom finalizers, parameterised workflows.
- `cp workflow show <name>` — read the built-ins
  (`quick`, `dev`, `docs`, `debug`, `milestone`,
  `complete-milestone`).
- `cp workflow brainstorm --workflow <new-name>` — provider-assisted
  design for a fresh workflow.

That's the loop. The same five commands —
`new --from`, edit, `validate`, `inspect`, `run` — apply to every
custom workflow you'll ever write.
