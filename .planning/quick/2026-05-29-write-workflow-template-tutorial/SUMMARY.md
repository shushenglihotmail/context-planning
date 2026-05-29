# Summary: 2026-05-29-write-workflow-template-tutorial

Completed: 2026-05-29T18:07:58.425Z

## Outcome

Wrote a 4-document tutorial set under `docs/workflow/` teaching project
users how to author custom cp workflow templates.

### Deliverables

| File | Lines | Purpose |
|------|-------|---------|
| `docs/workflow/README.md` | 84 | Folder landing page: what a workflow is, how the engine walks the DAG, route-map of the other 3 docs |
| `docs/workflow/quickstart.md` | 215 | First-time author walkthrough: scaffold a YAML → validate → inspect → run a small triage workflow end to end |
| `docs/workflow/reference.md` | 993 | Full schema reference: every top-level and per-phase field with meaning + runtime impact + validation rules + common mistakes, cited to concrete `lib/*` source lines; CLI surface, exit codes, v1.6 invocation contract line-by-line |
| `docs/workflow/recipes.md` | 451 | 8 worked patterns: small task, fan-out, parameterised workflows, mixed scaffold + skill phases, phase-template + workflow-template inclusions, parallel-with-dependencies, debug-style, milestone-style |

Also linked the new folder from the top-level `README.md` "Workflow
Engine" section so it's discoverable.

### Process

Drove the `docs` workflow under `cp run` with supervised mode. Seven
waves: setup → clarify → read-materials → prepare → child-write
(fan-out, one commit per doc) → review → finalize.

The review wave caught real bugs in the first-draft docs and ran two
full iterations:

1. **Peer-review-driven round 1** (8 findings): fixed
   `${config.…}`-in-phase-fields misclaim (replaced with the working
   param-indirection pattern across all 3 docs), tightened the v1.6
   contract block format, corrected `state.json` references, split
   phase-template vs workflow-template inclusion docs with correct
   paths and `--` namespace separator, rewrote the deprecations table
   as an honest "Aliases and legacy forms" section, replaced bad
   skill-routing examples with bare canonical keys throughout
   `recipes.md`.

2. **User-pushback round 2**: rewrote `reference.md` from an
   inventory into a true semantics-and-impact reference (~480 →
   993 lines). Every workflow-level and phase-level field now has
   its own subsection: meaning, runtime impact (citing `lib/*`
   source), validation rules, when to set / omit / common mistakes.
   Also fixed `recipes.md` Recipe 1's incorrect "outputs: is a
   hint, not enforced" claim — under supervised mode the sub-agent
   supervisor (`lib/supervisor.js:261-264`) treats `outputs:` as
   a hard contract, and the checkpoint logic uses the same list
   for backup/rollback. Added a line-by-line meaning table for
   the v1.6 invocation contract block.

3. **Folder README**: added `docs/workflow/README.md` as the
   landing page introducing what a workflow is and routing readers
   to the three tutorial docs in the right order.

### Verification

- Every code snippet in the docs was extracted to a real YAML file
  under the session workspace and round-tripped through
  `cp workflow validate --strict` (exit 0) before publication.
- `cp workflow inspect` confirmed the quickstart's triage example
  produces the documented 4-wave layout including the auto-injected
  finalize.
- Every claim about runtime behaviour was grounded in a specific
  `lib/*` source location (cited inline in `reference.md`).

### Commits

- `029a5a8` quickstart review fixes (round 1)
- `d56af92` reference review fixes (round 1)
- `4653519` recipes review fixes (round 1)
- `73b9208` runtime state bookkeeping
- `8a0e878` reference rewrite + recipes outputs fix (round 2)
- `f54f88c` docs/workflow/README.md landing page

