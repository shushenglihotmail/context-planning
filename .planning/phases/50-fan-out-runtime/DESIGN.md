---
# Tier marker: cp scaffold substitutes one of:
#   phase: "50"     (for phase-tier DESIGN.md)
#   milestone_slug: "v1-2-unified-phase-model"  (for milestone-tier DESIGN.md)
phase: "50"
milestone: v1.2 Unified Phase Model
status: accepted
created: 2026-05-26
updated: 2026-05-25
deciders: []
supersedes: []
superseded_by: null
---

# Design: Phase 50: Fan-out runtime

## Status

Accepted on 2026-05-25.

## Context

v1.2's unified Phase model lets a workflow template declare a *parent* phase
with one or more *child* phases (`parent: <parent-id>`). At runtime, the
parent agent emits a structured list of items, and the runtime materialises
each child template once per item.

50-01 added the schema (`parent`, child-level `after`, `max_children`,
`min_children`). 50-02 added `lib/fanout.js#expandPhases` to materialise
children with same-item pairwise sibling rewiring. 50-03 added the parent
agent contract (`buildParentPrompt` / `parseParentOutput` /
`enforceChildCount`) over a structured `items` JSON block.

What was missing: **inter-item ordering**. A typical workflow author cannot
predict at template-design time whether item 2 depends on item 1 — that's a
runtime decision the parent agent makes when it decomposes the milestone
into items. Without a way to express this, every item's child subtree runs
in parallel, which is wrong for the common "feature A must land before
feature B" case.

## Decision

Extend the parent agent's structured-list contract with an optional
**per-item `depends_on`** field (`string[]`, references other items' ids in
the same list). The runtime resolves cross-item execution order using an
**all-or-nothing rule**:

1. **All items have `depends_on`** (including explicit empty `[]`) → treat
   as a DAG. Topologically sort and chain subtrees by the declared edges.
2. **No items have `depends_on`** → sequential by array order (item[0]
   subtree → item[1] subtree → …).
3. **Some items have `depends_on`, others don't** → ambiguous. Fall back
   silently to array-order mode; the partial dependencies are not honored.

The prompt sent to the parent agent explicitly states the array-order
default and encourages it to populate `depends_on` on **every** item if it
can identify the real dependency graph (so we can unlock parallelism).

"Subtree wait" means: when item B depends on item A (whether by array
position or `depends_on`), every expanded child phase of B has every
expanded child phase of A added to its `after` list.

## Consequences

### Positive
- Safe-by-default: with no agent guidance, items execute in stable array
  order — no surprise concurrency, no race conditions across features.
- Clear opt-in to parallelism: agent earns optimised execution by being
  comprehensive (all items annotated), not by being clever-but-partial.
- Zero template-side changes: workflow authors who don't know about
  cross-item ordering keep writing templates exactly as they do today.
- The internal executor needs no new primitive — cross-item ordering is
  expressed as `after` edges on the expanded child phases, which the
  scheduler already honors.

### Negative
- The "all-or-nothing" cutoff means a single missing `depends_on` silently
  collapses the entire DAG to array order. We accept this trade-off
  because the alternative (treating "no `depends_on` field" as "no deps")
  is ambiguous and unsafe.
- Cross-item `after` lists can grow large (every B-child waits on every
  A-child); harmless for correctness, but noisier in dumps.

### Neutral
- Same-item pairwise sibling deps (template-level `child.after:
  [siblingId]`) keep working unchanged.
- Top-level `after: [parentId]` still means "wait for the entire parent
  subtree" — that's enforced at the executor scheduler layer, not in
  `expandPhases`.

---

## Architecture

```
parent agent
   │   (writes JSON: items[], each {id,title,depends_on?})
   ▼
parseParentOutput     ── validates structure
   │
   ▼
enforceChildCount     ── min_children ≤ N ≤ max_children
   │
   ▼
resolveItemOrder      ── all-or-nothing → {mode:'array'} or {mode:'dag', order:[...]}
   │
   ▼
expandPhases          ── materialises children + cross-item `after` edges
   │
   ▼
executor scheduler    ── walks expanded phases honouring `after`
```

## Components

- `lib/runtime-fanout.js`
  - `buildParentPrompt(parentPhase, basePrompt) → string` — instructs the
    agent on schema, count limits, **array-order default**, and the
    all-or-nothing `depends_on` rule.
  - `parseParentOutput(text) → items[]` — structural validation only
    (rejects malformed `depends_on` shape).
  - `enforceChildCount(parentPhase, items) → items` — bounds check.
  - `resolveItemOrder(items) → {mode:'array'} | {mode:'dag', order:string[]}`
    — applies the all-or-nothing rule. In `dag` mode, validates:
    no self-loops, no unknown ids, no cycles.

- `lib/fanout.js`
  - `expandPhases(phases, parentOutputs) → expanded[]` — now chains
    cross-item `after` edges per the resolved mode.

## Data Flow

1. Parent phase runs → agent emits `items[]` with optional `depends_on`.
2. Runtime validates count + parses structure.
3. `resolveItemOrder` picks mode based on coverage.
4. `expandPhases` materialises each child template per item AND wires:
   - same-item sibling deps (template-driven), unchanged.
   - cross-item subtree-wait deps:
     - **array mode**: item N's children wait for ALL of item N-1's
       expanded children.
     - **dag mode**: item B's children wait for ALL expanded children of
       every item in B's `depends_on`.
5. Executor walks the flat list, honouring `after`.

## Error Handling

- `parseParentOutput`: rejects malformed JSON; rejects items missing
  `id`/`title`; rejects `depends_on` that isn't `string[]`.
- `enforceChildCount`: throws when count is out of bounds (existing).
- `resolveItemOrder` (only when mode would be `dag`):
  - self-loop in `depends_on` → throw.
  - reference to unknown item id → throw.
  - cycle in DAG → throw with cycle path.
- Partial `depends_on` (some items annotated, others not): no error;
  silently fall back to array mode.

## Testing Strategy

- Unit (`test/unit-runtime-fanout.js`): prompt content, parser
  validation for `depends_on`, `resolveItemOrder` decision matrix +
  cycle/unknown/self-loop detection.
- Unit (`test/unit-fanout.js`): cross-item chaining in array mode,
  cross-item edges in DAG mode, back-compat with same-item sibling deps.
- Integration (`test/integration-fanout-v12.js`): end-to-end against
  `templates/workflows/dev-v2.yaml` — validate → phasesFromTemplate →
  buildParentPrompt → parseParentOutput → enforceChildCount →
  resolveItemOrder → expandPhases.

## Alternatives Considered

### Option A — Partial DAG (use declared deps, treat missing as `[]`)

**Pros:** Maximises declared parallelism; agent can incrementally annotate.

**Cons:** Ambiguous semantics — "missing `depends_on`" could mean "no
deps" or "agent forgot". Silent ordering bugs are worse than sequential
execution.

**Verdict:** rejected — safety beats opportunism here.

### Option B — Template-side `items_form_dag: true` toggle

**Pros:** Workflow author explicitly opts in to DAG mode.

**Cons:** Pushes the decision to the wrong actor — the workflow author
doesn't know at template-design time whether the items the agent will
emit have inter-item deps. Adds template surface for no clear benefit.

**Verdict:** deferred — the all-or-nothing rule already gives the agent a
clear opt-in path without new template config.

### Option C — Per-item topological hints (priority numbers, layers)

**Pros:** Compact representation.

**Cons:** Less expressive than explicit `depends_on`; surfaces ordering
without surfacing rationale; harder to validate.

**Verdict:** rejected — `depends_on` matches the workflow YAML's own
mental model (which uses `depends_on` at the phase level).

## Open Questions

- [ ] Should `resolveItemOrder` *warn* (not error) when in partial mode
  with non-empty `depends_on` arrays present? (Deferred — the prompt
  guidance should make it rare.)

## References

- `.planning/phases/50-fan-out-runtime/50-02-SUMMARY.md` — expander base.
- `.planning/phases/50-fan-out-runtime/50-03-SUMMARY.md` — original
  parent contract before this amendment.
