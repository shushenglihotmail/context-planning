---
milestone_slug: "v1-3-reusable-phase-templates"
milestone: v1.3 Reusable Phase Templates
status: proposed
created: 2026-05-26
updated: 2026-05-26
deciders: []
supersedes: []
superseded_by: null
---

# Design: v1.3 Reusable Phase Templates

## Status

Proposed (2026-05-26) — captured from v1.2 design discussion ("issue 2:
phase templates"). Deferred from v1.2 to keep that release focused on the
`optimizable` fan-out flag.

## Context

In v1.2, every phase inside a workflow YAML is a one-off literal block. A
typical phase definition (id, role, skill, prompt, max_children, parent,
after, …) cannot be shared or reused across workflows or even across
phases in the same workflow. Users who write similar plan/execute/review
phases in multiple workflow templates currently copy-paste the YAML.

This design adds a phase **template** concept: a named, reusable phase
definition that other phases can refer to via a `template:` field. A phase
that points at a template inherits its fields; the phase's own fields
override on a key-by-key basis.

Two storage locations are supported:

1. **Inline** in the workflow YAML — a top-level `phase_templates:` block
   defines templates scoped to that workflow.
2. **Standalone** files under `templates/phase-templates/<name>.yaml` (and
   `.planning/phase-templates/<name>.yaml` for project-local overrides) —
   define templates reusable across many workflows.

## Decision

Introduce a `template:` field on workflow phases plus two resolution sources
(inline `phase_templates:` and standalone files). Resolution order:

1. Inline `phase_templates:` block in the same workflow (highest priority).
2. Project-local `.planning/phase-templates/<name>.yaml`.
3. Built-in `templates/phase-templates/<name>.yaml` (lowest priority).

Merge rules: a phase's own fields override the template's fields key-by-key.
Arrays (`after`, `principles`) replace rather than merge — keep it simple.
Recursive template references are an error.

## Consequences

### Positive
- DRY across workflow templates — common plan/execute/review patterns
  written once.
- Project-local overrides without forking a built-in template.
- Inline + standalone both supported → ergonomic for small workflows AND
  large multi-workflow setups.

### Negative
- New resolution path adds complexity to `lib/workflow.js` template loading.
- Schema validator needs awareness of `template:` references and must
  validate the merged result, not just the literal phase block.
- Diagnostic messages need to surface BOTH the phase and the template
  source path when validation fails on a merged field.

### Neutral
- Existing v1.2 workflows continue to work unchanged — `template:` is opt-in.

---

## Architecture

```
workflow.yaml ──┐
                ├──► resolvePhaseTemplates(phase, sources)
phase_templates:│        │
  - name: …     │        ├─► merge(template, phase) → resolved phase
                │        │
.planning/      │        │
  phase-        │
  templates/    ├────────┘
                │
templates/      │
  phase-        │
  templates/    ┘
```

## Components

- `lib/phase-templates.js` (new) — loader + resolver.
  - `loadPhaseTemplates(workflowYaml, projectRoot, builtinsDir)` returns a
    name→template map with provenance.
  - `resolvePhase(phase, templates)` merges template → phase, recursion
    check, returns the resolved phase plus a list of source files for
    diagnostics.
- `lib/workflow.js` — call into the resolver during template load, BEFORE
  schema validation runs against the materialized phase list.
- `lib/workflow-schema.js` — extend to accept `template:` and the top-level
  `phase_templates:` block.
- `bin/commands/workflow.js` — `cp workflow inspect` should show the
  resolved view by default with a `--raw` flag to show the unresolved YAML.

## Data Flow

1. `cp run dev` loads `templates/workflows/dev.yaml`.
2. Workflow loader sees `phase.template: "<name>"` references.
3. Resolver assembles candidate templates from the three sources.
4. Each phase is rewritten in place to the merged form.
5. Schema validator runs on the merged phases (same code path as today).
6. Runtime executes the merged phases (no runtime change beyond load).

## Error Handling

- Unknown `template:` name → fail at load time with the workflow + phase id
  + searched paths.
- Cycle in template chain (template A → template B → template A) → fail at
  load time with the cycle path.
- Template defines `template:` itself? Decide: allow one-level chaining or
  disallow. Lean toward **allow with depth limit = 3** to keep
  diagnostics tractable.
- Inline + standalone template with the same name → inline wins, warn at
  load time about the shadow.

## Testing Strategy

- Unit (`test/unit-phase-templates.js`):
  - Inline-only template resolution
  - Standalone-only template resolution
  - Project-local override of built-in
  - Phase fields override template fields
  - Unknown template name → throw
  - Cycle → throw
  - Inline + standalone same name → inline wins + warn
- Integration: a new fixture workflow that uses templates end-to-end via
  `cp run --check`.
- Schema: validation of `template:` field + `phase_templates:` block.

## Alternatives Considered

### Option A — Inline-only `phase_templates:` block

**Pros:** simpler; one source of truth per workflow; no file-system
scanning at load.

**Cons:** no reuse ACROSS workflows; user-requested both shapes; doesn't
solve the multi-workflow DRY case.

**Verdict:** rejected — user explicitly asked for both inline and
standalone support.

### Option B — Standalone-only `.yaml` files

**Pros:** maximum reuse; clear file boundary.

**Cons:** verbose for small one-off workflows; forces a file split even
for templates used by exactly one workflow.

**Verdict:** rejected — same reason as A; both shapes were requested.

### Option C — `extends:` keyword on the phase block (single template)

**Pros:** familiar from CI/CD YAML.

**Cons:** `template:` reads more naturally for this domain ("which phase
template are you using?"). Multi-template merge is a future concern;
ship single-template first.

**Verdict:** keep `template:` for v1.3; revisit multi-template merge if
demand surfaces.

## Open Questions

- [ ] Should `template:` itself be allowed to reference another template
      (chained inheritance)? Lean YES with depth cap.
- [ ] Should `principles:` from a template merge or replace? Lean REPLACE
      for simplicity; revisit if users complain.
- [ ] Surface the resolved phase in `cp workflow inspect` by default or
      only with a flag? Lean DEFAULT resolved + `--raw` flag.
- [ ] Should standalone templates support YAML anchors (`&` / `*`) within
      themselves? Default YES (it's just YAML).

## References

- v1.2 design discussion (issue 2 — phase templates). Decision: defer.
- `lib/workflow.js`, `lib/workflow-schema.js` — current template loader
  surface.
- `templates/workflows/dev.yaml` — first candidate for refactoring once
  templates land.

