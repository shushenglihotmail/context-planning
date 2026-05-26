# Migration notes — v1.2

## Fan-out parent output: `optimizable` flag

v1.2 introduces an explicit `optimizable: boolean` flag on the JSON object a
parent (fan-out) phase emits. It replaces the v1.1-era "all-or-nothing
`depends_on`" rule, which silently fell back to sequential mode whenever a
parent emitted a partially-declared dependency graph — leaving the agent unable
to distinguish "I want full parallelism" from "I don't know the dependencies".

### New shape

A parent phase should return:

```json
{
  "optimizable": false,
  "items": [
    { "id": "auth-core", "title": "Auth core" },
    { "id": "api-routes", "title": "API routes" }
  ]
}
```

### Semantics

| `optimizable` | per-item `depends_on` | Execution |
|---|---|---|
| `false` or missing | anything (ignored) | **Array mode** — items run sequentially in declared order. |
| `true` | every item declares (use `[]` for none) | **DAG mode** — topological sort of declared edges. |
| `true` | some items omit `depends_on` | **DAG mode** — missing `depends_on` is treated as `[]`. |
| `true` | cycle / self-ref / unknown id | **Hard error** — phase fails fast. |

Rule of thumb for agents: only set `optimizable: true` when you are confident
about every inter-item dependency. If unsure, leave it `false` (or omit it) and
let the runtime run items in safe sequential order.

### Back-compat

A bare items array (no wrapping object) is still accepted and treated as
`{ optimizable: false, items: [...] }`. Existing v1.1 fan-out flows continue
to work unchanged.

### Why the change

The v1.1 rule conflated two distinct agent intents:

- "All items are independent — run them all in parallel" (would want
  `depends_on: []` everywhere)
- "I don't know the dependencies — please be safe" (would emit no
  `depends_on`)

Both produced an identical partial/empty declaration, and the runtime guessed
sequential. With `optimizable` made explicit, the agent's confidence is now a
first-class signal rather than something the runtime has to infer.
