---
# Tier marker: cp scaffold substitutes one of:
#   phase: "49"     (for phase-tier DESIGN.md)
#   milestone_slug: "v1-2-unified-phase-model"  (for milestone-tier DESIGN.md)
phase: "49"
milestone: v1.2 Unified Phase Model
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
---

# Design: Phase 49: Unified Phase type + reader abstractions

## Status

Accepted on 2026-05-25.

## Context

See milestone DESIGN.md (`.planning/milestones/v1-2-unified-phase-model/DESIGN.md`)
for the full layered model and rationale. This phase-tier DESIGN
records only the **shape** decisions specific to phase 49 — the
typedef contract and the parser surfaces.

## Decision

Introduce the unified `Phase` data type as a **JSDoc typedef** living
in `lib/types.js`, with a single runtime validator
`validatePhase(obj) → {ok, errors}`. Both layers (milestone reader,
workflow reader) get an additive function that returns `Phase[]` in
the unified shape; no existing call site changes.

This phase is deliberately **additive and read-only**:
- No removal of existing parsers (`roadmap.js`, `workflow.js`
  internals stay).
- No CLI surface changes.
- No frontmatter schema changes (the `workflow:` field on
  milestone-phases lands in Phase 50).

## Consequences

### Positive
- Phase 50-52 can layer on a stable type contract.
- The validator is a single source of truth for what a "phase" is —
  any layer that returns a `Phase` array can be drop-in.
- Test coverage of the type contract acts as a regression guard for
  future schema changes.

### Negative
- Two parser paths exist in parallel for one milestone (legacy
  callers + new `readPhases`). Phase 50 starts the migration; Phase
  51-52 complete it.

### Neutral
- JSDoc-only typing keeps the codebase TypeScript-free per project
  convention.

---

## Architecture

```
lib/
├── types.js              ← NEW: Phase typedef + validatePhase()
├── milestone.js          ← NEW EXPORT: readPhases(roadmapMd)
└── workflow.js           ← NEW EXPORT: phasesFromTemplate(template)
                            (existing computeWaves/readTemplate untouched)

test/
├── unit-types.js                  ← NEW (~20 assertions)
├── unit-milestone-reader.js       ← NEW (~30 assertions)
└── unit-workflow-phase-adapter.js ← NEW (~15 assertions)
```

## Components

### `lib/types.js` (new)

```js
/**
 * @typedef {Object} Phase
 * @property {string} id              Required. e.g. "47" (milestone) or "brainstorm" (workflow)
 * @property {string[]} depends_on    Required. Other phase ids in the same DAG. Empty for roots.
 * @property {"pending"|"in-progress"|"complete"|"failed"} status  Required.
 *
 * Milestone-layer extension fields (all optional on the base type):
 * @property {string[]} [plans]       e.g. ["47-01", "47-02"]
 * @property {string} [workflow]      Workflow template to use (Phase 50)
 * @property {string} [summary]       Path to phase SUMMARY.md
 * @property {string} [base_commit]   SHA at phase start
 *
 * Workflow-layer extension fields (all optional on the base type):
 * @property {string} [role]          Role name resolved via cp doctor
 * @property {string} [model]         Optional model override
 * @property {boolean} [persist_output]
 */

/**
 * Validate that an object satisfies the Phase contract.
 * @param {unknown} obj
 * @returns {{ok: boolean, errors: string[]}}
 */
function validatePhase(obj) { /* ... */ }

module.exports = { validatePhase };
```

### `lib/milestone.js#readPhases(roadmapMd, opts?)` (new export)

- Input: full ROADMAP.md content string. Optional `opts.milestone` to
  scope to one milestone by name (default: in-progress milestone).
- Output: `Phase[]` where each entry has milestone-extension fields
  populated.
- Handles: in-progress milestones (`### 🚧 ...`), shipped/collapsed
  (`<details>` blocks), phases with explicit plans lists, phases
  without plans, phases with the future `workflow:` annotation
  (forward-compat — reads from frontmatter once Phase 50 adds it).

### `lib/workflow.js#phasesFromTemplate(template)` (new export)

- Input: parsed template object (the one `computeWaves` already
  takes).
- Output: `Phase[]` where each entry has workflow-extension fields
  populated.
- Internally calls existing parsing; just remaps field names to
  match the unified shape.

## Data Flow

```
ROADMAP.md
   │
   ▼
milestone.readPhases(md)
   │
   ▼
[Phase{id:"47", depends_on:["46"], status:"complete", plans:[...]},
 Phase{id:"48", depends_on:["47"], status:"complete", plans:[...]}]
   │
   ├──→ validatePhase(each) → {ok:true}  (test guards)
   │
   └──→ (Phase 51) cp autonomous walker

template.yaml
   │
   ▼
workflow.readTemplate(yaml) → templateObj
   │
   ▼
workflow.phasesFromTemplate(templateObj)
   │
   ▼
[Phase{id:"brainstorm", depends_on:[], status:"pending", role:"brainstorm"},
 Phase{id:"plan", depends_on:["brainstorm"], status:"pending", role:"plan"}]
```

## Error Handling

`validatePhase` returns structured errors (does NOT throw) so callers
can decide what to do:

- Missing required field: `errors: ["missing required field: id"]`
- Wrong status enum: `errors: ["status must be one of pending|in-progress|complete|failed, got: foo"]`
- depends_on shape: `errors: ["depends_on must be string[]"]`

`readPhases` and `phasesFromTemplate` SHOULD validate their output in
debug/test mode. Production callers don't need to re-validate.

## Testing Strategy

| Suite | Assertions (target) | Coverage focus |
|---|---|---|
| `unit-types.js` | ~20 | validatePhase ok/error paths; required-field combos; enum edge cases |
| `unit-milestone-reader.js` | ~30 | All 4 ROADMAP shapes (in-progress, collapsed, plans-present, plans-absent); milestone-extension field population; forward-compat for `workflow:` field |
| `unit-workflow-phase-adapter.js` | ~15 | Parity: every existing template the codebase ships (`dev`, `debug`, `quick`) must round-trip through phasesFromTemplate and pass validatePhase |

Existing suites must remain green — phase 49 changes NO call sites.

## Alternatives Considered

### Option A — TypeScript types instead of JSDoc

**Pros:** Compile-time enforcement; better tooling integration.
**Cons:** Project is JSDoc-only by convention. Introducing TS would
require build-step changes outside this phase's scope.

**Verdict:** rejected — out of scope.

### Option B — Make validatePhase throw on error

**Pros:** Forces callers to handle.
**Cons:** Worse ergonomics for parser code that wants to collect all
errors before bailing.

**Verdict:** rejected — return `{ok, errors}` for composability.

### Option C — Single combined parser instead of two layer-specific ones

**Pros:** One less function.
**Cons:** Violates the layering principle from the milestone DESIGN
("milestone owns roadmap+state, workflow owns execution recipe").
Each layer has its own canonical source format (markdown vs YAML);
forcing them through one parser blurs the line.

**Verdict:** rejected — layering wins.

## Open Questions

- [ ] Should the `workflow:` field on milestone-phases be expressed in
      the H3 phase heading (`### Phase 49 [dev]: ...`) or in
      per-phase frontmatter (in a new `phase-meta.md` file)?
      → Defer to Phase 50.
- [ ] Should `validatePhase` accept a `layer: "milestone"|"workflow"`
      option to also enforce the layer-specific required fields?
      → Probably yes in Phase 50 once `workflow:` becomes required
      for milestone-phases.

## References

- Milestone DESIGN.md (`.planning/milestones/v1-2-unified-phase-model/DESIGN.md`)
- `lib/roadmap.js` — existing ROADMAP parser
- `lib/workflow.js#computeWaves` — existing template parser
- v1.1 DESIGN.md Phase 45 deferral notes
