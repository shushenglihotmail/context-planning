---
name: cp-workflow-inspect
description: Show a workflow template's YAML alongside its deduced wave-by-wave execution sequence (parallel groupings).
argument-hint: "<name-or-path> [--json]"
requires: []
---

# /cp-workflow-inspect

You are running `cp-workflow-inspect`. Your job is to show the user
both the raw template (what's in the YAML file) and the **deduced
execution sequence** that `cp run` will follow — including which
phases run in parallel as part of the same wave. This is the
"explain what this workflow will do, exactly" view.

This skill is a thin wrapper over `cp workflow inspect`. It does no
state mutation.

## Step 1 — Parse arguments

`$ARGUMENTS` may contain:

- A required positional `NAME_OR_PATH`: a built-in name, project
  template name, or filesystem path.
- An optional `--json` flag: return structured JSON instead of the
  human-readable form. Use `--json` when the user has follow-up
  questions you can answer programmatically (e.g. "which phases run
  in parallel?") or when piping to another tool.

If `NAME_OR_PATH` is missing: stop and suggest `/cp-workflow-list`.

Sanitize: if not a path, must match `^[A-Za-z0-9][A-Za-z0-9_-]*$`.

## Step 2 — Run inspect

```bash
cp workflow inspect <NAME_OR_PATH> [--json]
```

## Step 3 — Render

### Human-readable form (no `--json`)

`cp workflow inspect` prints the YAML body followed by a
`=== Deduced execution sequence ===` block. Reproduce both verbatim:

````
Template `<NAME>` (source: …):

```yaml
<YAML body>
```

**Deduced execution sequence** — `<N>` phase(s) across `<M>` wave(s):

```
Wave 1 of M — K phase(s) [(parallel) if K>1]:
  - <phase>  (role: …, depends on: …)
Wave 2 of M — …
  - …
```
````

Surface the "(parallel)" marker prominently so users notice which
waves can be dispatched concurrently.

### JSON form (`--json`)

Parse stdout as JSON and present a brief summary:

```
Template `<NAME>` deduced sequence:
  - Total phases: <total_phases>
  - Total waves:  <total_waves>
  - Parallel waves: <count where wave.phases.length > 1>
  - Roles used: <distinct role values, comma-separated>
```

Then offer to walk through any specific wave's phases on request.

## Step 4 — Optional follow-up

> "Ready to run this workflow?
> `/cp-workflow-run <NAME> <run-name>` will execute it wave by wave."

If the user is comparing two workflows, suggest running
`/cp-workflow-inspect` on each and diffing the wave counts / roles.

## Notes

- Pure read-only — no `.planning/` writes.
- The wave decomposition is the same topological-sort grouping the
  runtime uses internally when executing `cp run`. What you see here
  is exactly what will execute.
- If the template is invalid (`cp workflow inspect` exits 2),
  surface the validation errors and suggest `/cp-workflow-validate`
  to see the full list.
