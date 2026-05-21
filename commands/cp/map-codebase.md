---
name: cp-map-codebase
description: Analyse the current codebase via 4 parallel sub-agents and write .planning/codebase/ docs that ground all later cp work. Native to cp — does NOT require Superpowers or any other workflow provider.
argument-hint: "[--force] [--fast [--focus tech|arch|quality|concerns]]"
requires: []
---

# /cp-map-codebase

You are running `cp-map-codebase`. This is a **cp-native** command — it does
not call the workflow provider. The provider abstraction is for *workflow*
work (brainstorm/plan/execute/review/debug); map-codebase is *upfront context
gathering* and lives entirely in the state layer.

What you'll produce: 7 markdown docs in `.planning/codebase/` that match the
GSD layout exactly, so `cp gsd-import` stays clean and the user can switch
between cp and GSD any time.

```
.planning/codebase/
├── STACK.md          ← tech focus (agent 1)
├── INTEGRATIONS.md   ← tech focus (agent 1)
├── ARCHITECTURE.md   ← arch focus (agent 2)
├── STRUCTURE.md      ← arch focus (agent 2)
├── CONVENTIONS.md    ← quality focus (agent 3)
├── TESTING.md        ← quality focus (agent 3)
└── CONCERNS.md       ← concerns focus (agent 4)
```

## Why this is cp-native

The work decomposes into 4 independent reads + 7 file writes. Every modern
agent harness has a native sub-agent dispatch (Copilot CLI's `task` tool,
Claude Code's Task tool, etc.) that does this faster than any provider could.
Delegating to a workflow skill would add latency and lose the parallelism.

## Step 1 — Parse flags

Parse `$ARGUMENTS`:

- `--force` — pass through to `cp scaffold-codebase --force` (overwrites stubs).
- `--fast [--focus <area>]` — single-agent scan mode. Spawn ONE agent for the
  named focus (default `tech+arch`) instead of four. Useful for incremental
  refreshes.
- No flags — full parallel map.

## Step 1.5 — Auto-init if `.planning/` missing (v0.9)

Check whether `.planning/PROJECT.md` exists in the repo root.

- **If it exists**, skip this step and continue.
- **If it does NOT exist**, this is a case-2 user (existing code, no
  planning yet). Print a clear notice and run `cp init` BEFORE the
  scaffold-codebase step:

  ```
  ℹ .planning/ not found — initialising before mapping (cp init)…
  ```

  ```
  cp init
  ```

  `cp init` is idempotent and additive — it creates PROJECT.md /
  ROADMAP.md / STATE.md / MILESTONES.md stubs and the `cp:` config block
  if they're missing, and leaves any existing GSD files untouched. After
  it runs, continue to Step 2.

**Never auto-init silently.** The notice line above is mandatory so the
user understands what just happened and can answer "why are there new
files in my repo?" without reading the source.

## Step 2 — Scaffold the stub files

Run the cp wrapper. This creates `.planning/codebase/` and seeds 7 stub
files from the templates. Idempotent — refuses to overwrite without `--force`.

```
cp scaffold-codebase
```

If `cp codebase-status` shows files already exist with content, ask the user
whether to refresh (`--force`) or skip. **Never overwrite filled docs without
explicit confirmation.**

## Step 3 — Detect the host's sub-agent dispatch mechanism

Pick the right one for your runtime:

| Harness         | Mechanism                                                          |
| --------------- | ------------------------------------------------------------------ |
| Copilot CLI     | `task` tool, `agent_type: "explore"` (Haiku) or `"general-purpose"`|
| Claude Code     | Task tool with `subagent_type: "general-purpose"`                  |
| Cursor / others | Whatever native parallel-agent primitive exists                    |

If you cannot find a parallel sub-agent primitive: skip to **Fallback (inline
mode)** at the bottom of this command.

## Step 4 — Dispatch 4 parallel mapper agents

Spawn 4 agents IN PARALLEL (one tool-call block, all four invocations).
Each agent gets:

- A focus area (`tech` | `arch` | `quality` | `concerns`)
- The exact output file paths it owns
- The "be prescriptive, include file paths, current-state only" rules

### Agent 1 — tech focus

> You are a codebase mapper. Focus: **tech stack and external integrations**.
>
> Explore `{repo_root}` and write TWO files:
>
> 1. `.planning/codebase/STACK.md` — languages with versions (from manifest
>    files), frameworks, top ~10 prod deps with purpose, dev tooling
>    (build/test/lint/format with their npm/script commands), package manager
>    and lockfile.
> 2. `.planning/codebase/INTEGRATIONS.md` — APIs called (endpoint + auth +
>    calling file path), DBs / data stores, message queues, auth providers,
>    CI/CD pipelines, secrets/env-var loading paths. NEVER paste secret values.
>
> Rules: always cite file paths in backticks (e.g. `src/db/client.ts`). Be
> prescriptive ("Use X") not descriptive ("X is used"). Describe current
> state only — no history, no alternatives considered. Replace the stub
> content entirely. Return only a one-line confirmation per file written.

### Agent 2 — arch focus

> You are a codebase mapper. Focus: **architecture and folder structure**.
>
> Explore `{repo_root}` and write TWO files:
>
> 1. `.planning/codebase/ARCHITECTURE.md` — architectural style (one paragraph),
>    module boundaries (cite dirs), one end-to-end data-flow trace with file
>    paths at each hop, key design patterns in use with file refs, cross-cutting
>    concerns (logging/auth/caching/config/error handling) and where each lives,
>    boundaries the executor must respect ("never import X from Y").
> 2. `.planning/codebase/STRUCTURE.md` — annotated top-level tree, per-folder
>    responsibilities (what belongs / does not), "where do I put a NEW
>    CLI subcommand / HTTP route / test / migration?", filename conventions,
>    generated/vendored/ignored paths to never edit.
>
> Rules as above. Replace stubs entirely. Return only confirmations.

### Agent 3 — quality focus

> You are a codebase mapper. Focus: **code conventions and testing**.
>
> Explore `{repo_root}` and write TWO files:
>
> 1. `.planning/codebase/CONVENTIONS.md` — naming (functions/vars/types/files),
>    import/export style with example file ref, error handling pattern, logging
>    (logger choice, levels, init location), comment & docs style, formatting/
>    linting (tool + config path + commands).
> 2. `.planning/codebase/TESTING.md` — test framework + version + all-tests
>    and single-file commands, file layout (co-located vs mirror dir), naming
>    pattern, AAA structure with one real example from the codebase, fixtures
>    & mocks strategy, honest coverage picture, copy-pasteable run commands.
>
> Rules as above. Replace stubs entirely. Return only confirmations.

### Agent 4 — concerns focus

> You are a codebase mapper. Focus: **technical debt and risk**.
>
> Explore `{repo_root}` and write ONE file:
>
> 1. `.planning/codebase/CONCERNS.md` — issues bucketed Critical / High /
>    Medium / Low. For each: file path + line range + symptom + fix approach.
>    Plus a "Workarounds & gotchas" section ("if you change X, also update Y")
>    and an "Areas that look safe to touch" section for low-risk regions with
>    good test coverage.
>
> Rules: be specific — vague concerns are not actionable. Replace stub entirely.
> Return only a confirmation.

## Step 5 — Verify and commit

Once all four agents complete:

```
cp codebase-status
```

Confirm every row shows `filled`, not `stub`. If any still look like stubs,
ask the user whether to redispatch the matching agent.

Then commit:

```
git add .planning/codebase/
git commit -m "cp: map-codebase (7 docs)"
```

## Step 6 — Report

Print:

```
✓ Codebase mapped → .planning/codebase/ (7 docs, N total lines)
  Focus areas:    tech ✓  arch ✓  quality ✓  concerns ✓
  Next:           cp init  (for brownfield first-time setup)
                  /cp-plan-phase N  (to start using the new context)
```

## --fast mode

When `--fast` is in `$ARGUMENTS`: spawn only ONE agent, with the focus area
from `--focus` (default `tech+arch`, meaning it writes 4 files: STACK,
INTEGRATIONS, ARCHITECTURE, STRUCTURE). Same prompt style, just sequential
rather than 4-way parallel. Useful for quick refreshes after small changes.

## Fallback (inline mode, no sub-agent dispatch available)

If the harness has no parallel sub-agent primitive, do the work inline:

1. Run `cp scaffold-codebase`.
2. For each of the 4 focus areas in sequence, do an exploration pass (read
   manifest files, glob for representative source files, sample 5–10 each)
   and rewrite the corresponding doc(s) in place.
3. Run `cp codebase-status` to verify, then commit.

This is slower and consumes more context (no offloading), but produces the
same output.

## Notes

- **No provider involved.** `cp doctor` will not show a `codebase_mapper`
  role — that's correct; this command is built into cp.
- **Stub markers:** the templates contain `fill via \`/cp-map-codebase\``
  comments and an HTML comment per section explaining what to include.
  Mapper agents should DELETE those markers when writing real content (so
  `cp codebase-status` correctly reports `filled`).
- **Brownfield bootstrap:** the recommended order for an existing project
  is `/cp-map-codebase` — that's it. Since v0.9, the skill auto-invokes
  `cp init` (with notice) if `.planning/` is missing. The legacy 3-step
  order (`cp scaffold-codebase` → `/cp-map-codebase` → `cp init`) still
  works but is no longer the documented path.
- **Re-run any time** the codebase changes materially: `/cp-map-codebase --force`.
