# Workflows

This folder is the documentation home for **cp workflow templates** —
the YAML files that drive `cp run`. If you've never written a workflow
before, start here.

## What is a workflow?

A **workflow** is a small YAML file that describes a repeatable piece
of work as a directed graph of **phases**. Each phase says:

- *who* should do the work (`role:` — e.g. `planner`, `reviewer`)
- *how* to do it (`skill:` — a routing key the engine resolves to a
  real skill in your agent harness, e.g. `plan`, `execute`, `review`)
- *what* to do (`prompt:` — the instructions sent to that skill)
- *what comes first* (`depends_on:` or `after:` — wave scheduling)

You hand the workflow file to `cp run <workflow-name>`, and the
engine walks the phase DAG one wave at a time, printing a
machine-readable **invocation contract** for each phase. Your agent
harness picks up that contract, dispatches the named skill, and the
operator (or the agent itself) advances the run with
`cp run mark-complete <slug> <phase-id>`.

The result: a repeatable, auditable, resumable process that the same
team (or the same agent) can drive every time, instead of
reinventing the steps for every new task.

## How it works in 30 seconds

```
1. cp workflow new my-flow --from quick     # scaffold a YAML
2. edit .planning/workflows/my-flow.yaml    # tweak phases/prompts
3. cp workflow validate my-flow             # catch schema errors
4. cp workflow inspect my-flow              # see the wave grouping
5. cp run my-flow "my-first-run"            # start a run
6. cp run mark-complete <slug> <phase> < summary.md   # advance
7. cp run resume <slug>                     # pick up where you left off
```

Under the hood:

- The engine builds a **DAG** from `depends_on:` / `after:` and
  groups phases into **waves** (everything in a wave runs in
  parallel).
- In `supervised: true` mode (the default for every built-in), the
  engine prints **one wave at a time** and exits — you stay in the
  loop and `mark-complete` each phase yourself.
- A **finalize** phase is always present. If you don't declare one,
  the engine auto-injects `cp <binds_to>-finalize` so the run
  always lands in a closed state.
- Workflow files can live in the cp package (`templates/workflows/`
  — the built-ins) or in your project (`.planning/workflows/` —
  yours; shadows the built-ins).

## The three tutorial docs

| File | When to read it |
|------|-----------------|
| [`quickstart.md`](./quickstart.md) | **First.** Walks you end-to-end through writing, validating, and running a small triage workflow. ~10 minutes. |
| [`reference.md`](./reference.md) | **When authoring or debugging.** Full schema: every top-level and per-phase field with its meaning, runtime behaviour, validation rules, and common mistakes. CLI surface, exit codes, and the v1.6 invocation contract line by line. |
| [`recipes.md`](./recipes.md) | **When you need a pattern.** Worked examples for fan-out, parallel-with-dependencies, parameterised workflows, template inclusions, mixed scaffold + skill phases, and more. |

Suggested path:

1. Read **quickstart** start to finish — write the example workflow
   and run it.
2. Skim **reference**'s "Top-level field reference" and "Phase
   fields" sections so you know which fields you have available.
3. When you hit a real pattern (fan-out, parameterisation, including
   reusable phase templates), grab the matching **recipe**.
4. Come back to **reference** whenever a snippet doesn't validate
   or you want to know exactly what a field does at run-time.

## Where to go next

- **First time?** → [quickstart.md](./quickstart.md)
- **Need the schema?** → [reference.md](./reference.md)
- **Want a working pattern?** → [recipes.md](./recipes.md)
- **Read the built-ins:** `cp workflow ls`, then
  `cp workflow show <name>` (try `quick`, `dev`, `docs`, `debug`,
  `milestone`).
- **Design a new one:** `cp workflow brainstorm --workflow <new-name>`
  for provider-assisted design.
