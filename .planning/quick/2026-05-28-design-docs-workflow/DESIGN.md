# docs workflow — design

status: ready

## Task

Add a new built-in workflow template `templates/workflows/docs.yaml`
that ships with cp and drives multi-document authoring work
end-to-end: clarify scope → ingest source materials → fan-out one
write-phase per document → consolidated customer review → finalize.

## Approach

Add **`templates/workflows/docs.yaml`** modelled on `dev.yaml`'s
parent/child fan-out, with these properties:

- `workflow: docs`, `version: 1`, `supervised: true`
- `binds_to: quick` — state lives at
  `.planning/quick/<date>-<slug>/`. No ROADMAP / milestone overhead.
- 7 phases, strictly linear except for the parent/child fan-out
  block in the middle:

  | # | id              | kind / parent      | skill                | purpose                                              |
  |---|-----------------|--------------------|----------------------|------------------------------------------------------|
  | 1 | `setup`         | scaffold           | (none)               | `cp quick-setup {{slug}}` — create state dir         |
  | 2 | `clarify`       | supervised         | `brainstorming`      | Pin down: doc list, audience, format, success bar    |
  | 3 | `read-materials`| supervised         | (none, inline)       | Read source artefacts; write `CONTEXT.md` summary    |
  | 4 | `prepare`       | supervised, parent | `writing-plans`      | Emit JSON `items: [{id,title,audience,format,refs}]` (max_children: 10, min_children: 1) |
  | 5 | `child-write`   | child, parent=prepare | `writing-plans`   | Write **one** doc per item; commit atomically        |
  | 6 | `review`        | supervised         | `requesting-code-review` | Present **all** docs to customer; collect feedback; loop until accepted |
  | 7 | `finalize`      | scaffold           | (none)               | Mark workflow done (auto-injected by runtime, no-op here) |

- Params (all optional, sensible defaults via `${config.provider.*}`):
  - `clarify_skill` → `${config.provider.brainstorm_skill}`
  - `prepare_skill` / `write_skill` → `${config.provider.plan_skill}`
  - `review_skill` → `${config.provider.review_skill}`
- Principles block at top of YAML:
  - "Clarify scope before reading materials; read materials before
    fanning out — context flows down, not up."
  - "One commit per document during child-write."
  - "Review is a single consolidated pass — customer sees all docs
    together, not piecemeal."

### Notes on chosen trade-offs

- **Per-doc fan-out, single review** (user choice): the review is
  intentionally synchronous so the customer can compare docs
  side-by-side. Per-doc review children were rejected to avoid N
  parallel customer interruptions.
- **`writing-plans` for child-write**: stretches the skill's intent
  (it's optimised for implementation plans) but is the closest
  routed match in superpowers. The phase prompt will steer it
  toward markdown doc output. If/when a `writing-docs` skill exists
  upstream, we swap the routing key.
- **`read-materials` has no routed skill**: it's a small inline
  read-and-summarise step. No need to spin up subagents for it.
- **`finalize` is a scaffold no-op**: present so the auto-inject
  finalize logic (v1.6 D1) recognises explicit closure and the
  workflow's `status: done` transition fires cleanly.

## Done-When

- [ ] `templates/workflows/docs.yaml` exists, parses via
      `cp workflow validate docs --strict`, and shows up in
      `cp workflow ls`.
- [ ] `cp workflow diagram docs` renders the expected DAG: linear
      `setup → clarify → read-materials → prepare`, fan-out
      `prepare → child-write` (variable N), then `review → finalize`.
- [ ] `cp workflow inspect docs` deduces the right waves (parent
      and children in adjacent waves, review after all children).
- [ ] `cp run docs "smoke test"` dry-runs end-to-end against a
      sample 2-doc scenario without runtime errors.
- [ ] No new code in `lib/` is required (workflow runtime already
      supports parent/child fan-out via `lib/fanout.js` and
      `lib/runtime-fanout.js`).
- [ ] Existing tests still pass (`npm test`).
- [ ] Atomic commit on `templates/workflows/docs.yaml`.
