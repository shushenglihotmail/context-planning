# DESIGN — cp workflow template tutorial set

**Run slug:** `2026-05-29-write-workflow-template-tutorial`
**Workflow:** `docs` (binds to `quick`)
**Status:** ready (user-approved 2026-05-29)

## Goal

Produce a focused 3-document set under `docs/workflow/` that teaches
project users how to author their own custom workflow templates in
`.planning/workflows/<name>.yaml`. The set should mirror the style and
depth of the existing `docs/writing-providers.md`, but cover the
workflow-template surface area instead of the provider surface area.

## Audience

Primary: **project users** authoring custom templates in their own
project's `.planning/workflows/`. The docs should be readable
without first reading any cp internals; CLI surface (`cp workflow ...`,
`cp run ...`) is treated as the contract.

Out of scope: cp contributors authoring new built-in templates under
`templates/workflows/`. The same docs will mostly serve them, but we
do not call out contributor-only concerns or repo-internal layouts.

## Format

Markdown, one file per document, sibling to existing docs in `docs/`.
Each file starts with a short cross-link header pointing at the other
two docs in the set.

## Document set

| File | Title | Target length | Purpose |
|---|---|---|---|
| `docs/workflow/quickstart.md` | Writing your first workflow | ~150 lines | Build a runnable 4-phase "hello world" template from scratch; validate; run via `cp run`; loop through `mark-complete`. |
| `docs/workflow/reference.md` | Workflow template schema reference | ~350 lines | Every YAML field documented — type, default, example, when to use. |
| `docs/workflow/recipes.md` | Workflow template recipes | ~300 lines | 7–8 cookbook patterns covering advanced features. |

### Quickstart outline

1. Prerequisites (`cp v1.7+`, provider visible via `cp doctor`)
2. The simplest template (`workflow` / `version` / `phases` with one phase)
3. Hand-writing under `.planning/workflows/<name>.yaml` (or `cp workflow new`)
4. Validating with `cp workflow validate <name> --strict`
5. Running it: `cp run <name> <slug>` and the wave / `mark-complete` loop
6. Inspecting waves with `cp workflow inspect` and `cp workflow show`
7. Pointers to Reference and Recipes

### Reference outline (grouped, one section per top-level field)

- **Workflow envelope:** `workflow`, `version`, `binds_to`, `supervised`,
  `principles`, `defaults`, `params`.
- **Phase envelope:** `id`, `description`, `depends_on`, `outputs`.
- **Phase routing:** `role`, `skill`, `model`, `persist_output`.
- **Phase kind:** `kind: scaffold` + `command` vs prompt phases with
  `prompt:`.
- **Fan-out phases:** `parent`, `after`, `materialize`, `max_children`,
  `min_children`.
- **Templating:** `{{param}}` substitution, `${config.provider.<x>_skill}`
  references.
- **Binding rules:** what `binds_to: quick | milestone | phase | custom`
  means and which scaffolds run.

### Recipes outline (8 patterns)

1. Clarify-then-execute pair (basic 2-phase with STOP gate)
2. Fan-out children via `materialize` (planner produces N items, runtime
   spawns N child phases)
3. Supervisor-supplied params (`name:` with no `default:`, injected at
   run-time)
4. Param templating with provider defaults (`${config.provider.plan_skill}`)
5. Mixing scaffold + prompt phases (cp commands sandwiching skill work)
6. Custom roles vs canonical roles (when `role: analyst` + explicit
   `skill:` beats `role: plan`)
7. Supervised vs unsupervised mode (`supervised: true` semantics)
8. `optimizable: true` DAG opt-in for parallel item execution

## Source materials (`read-materials` phase will consume these)

- `templates/workflows/*.yaml` — 6 built-ins as worked examples
- `lib/workflow/*` — schema + validator code, to ground field semantics
- `bin/commands/workflow.js`, `bin/commands/run.js` — CLI behaviour, to
  avoid fictional flags
- `docs/writing-providers.md` — style anchor
- `docs/architecture.md` — cross-reference
- `MIGRATION-v1.4.md`, `MIGRATION-v1.6.md`, `MIGRATION-v1.7.md` —
  workflow-related changes across recent releases
- `docs/superpowers/specs/2026-05-28-v1-6-workflow-contract-hardening-design.md`
  — deep design context

## Style + conventions

- Match `writing-providers.md`: short sentences, code-first, tables for
  enum-style fields.
- Every YAML snippet in the docs must be a valid template that passes
  `cp workflow validate --strict`.
- Every CLI command and flag mentioned must exist in `cp <cmd> --help`
  (no fictional surface area).
- Cross-link the three docs at the top of each, and add a short
  "Workflows → see `docs/workflow/`" pointer from `README.md` if a
  natural anchor exists.

## Success bar

The doc set is "done" when all of the following hold:

1. Every YAML snippet in the three docs is a valid, runnable template
   (validated by `cp workflow validate --strict`).
2. Every CLI command and flag mentioned in the docs matches what
   `cp <cmd> --help` actually prints (no fictional flags).
3. Every field in the live YAML workflow schema appears somewhere in
   `reference.md`.
4. A first-time user can read `quickstart.md` straight through, end up
   with a working custom workflow they can run, and not need any other
   docs to do it.
5. The three docs cross-link each other, and `README.md` points at
   `docs/workflow/` (if there is a natural anchor — non-blocking
   otherwise).
