---
name: cp-workflow-diagram
description: Emit a Mermaid flowchart of a workflow's phase DAG — paste into any Markdown renderer that supports Mermaid.
argument-hint: "<name-or-path>"
requires: []
---

# /cp-workflow-diagram

You are running `cp-workflow-diagram`. Your job is to emit a
Mermaid `flowchart TD` diagram of a workflow's phase DAG so the
user can visualize phase dependencies — particularly which phases
run in parallel as a wave.

This skill is a thin wrapper over `cp workflow diagram`. It does no
state mutation.

## Step 1 — Parse arguments

`$ARGUMENTS` must contain a single positional `NAME_OR_PATH` — a
built-in name, project template name, or YAML file path.

If missing: stop and suggest `/cp-workflow-list` to enumerate
available templates.

Sanitize: if not a path (no `/` or `\`), must match
`^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Step 2 — Run diagram

```bash
cp workflow diagram <NAME_OR_PATH>
```

## Step 3 — Render

- **Exit 0** → wrap stdout in a Mermaid fenced code block so it
  renders inline:

  ```
  Phase DAG for `<NAME>`:

  ```mermaid
  <stdout from cp workflow diagram>
  ```
  ```

  Most modern Markdown renderers (GitHub, VS Code, Obsidian, etc.)
  display Mermaid blocks as actual diagrams.

- **Exit 2** with validation errors → surface them. The diagram
  command only works on valid templates; suggest
  `/cp-workflow-validate <NAME_OR_PATH>` to see the full error list.

- **Exit 3** ("template not found") → suggest `/cp-workflow-list`.

## Step 4 — Optional follow-up

> "Want the same DAG as text with wave numbers and roles?
> `/cp-workflow-inspect <NAME>` shows the YAML plus the linear
> wave-by-wave execution sequence."

## Notes

- Pure read-only — no writes.
- The diagram is `flowchart TD` (top-down); each phase is a node and
  every `depends_on` becomes an arrow.
- For programmatic / non-visual consumption of the same dependency
  info, prefer `/cp-workflow-inspect --json` (in `cp workflow
  inspect`'s JSON form, each phase carries its `depends_on` list).
