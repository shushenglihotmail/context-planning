child-write phase complete.

Wrote 3 documents per the prepare-phase items list, each committed
atomically (workflow principle #2):

- docs/workflow/quickstart.md (183 lines, commit 33a7ca3)
  Five-command path from cp doctor to a running custom triage
  workflow. Every YAML snippet validated via `cp workflow validate
  --strict`; the four-wave count claim was independently confirmed
  via `cp workflow inspect`.

- docs/workflow/reference.md (428 lines, commit 82c1fa6)
  Authoritative schema + CLI reference. Documents every top-level
  field, every per-phase field across all kinds (skill, scaffold,
  fan-out parent/child, template inclusion), the v1.7 templating
  whitelist with allowed/forbidden token locations, supervisor-supplied
  params, the ${config.path} fallback table, binding rules + the
  three auto-injected finalize commands (cp quick-finalize / cp
  milestone-finalize / cp run-finalize), the v1.6 invocation contract
  block, full cp workflow + cp run CLI surface (every sub-command,
  every flag) with exit codes, common validation errors + fixes, and
  deprecation aliases (persist_output, custom binds_to, bare phase
  entries). Every claim grounded in lib/workflow.js,
  lib/workflow-template-validate.js, lib/workflow-template-expand.js,
  bin/commands/workflow.js, bin/commands/run.js.

- docs/workflow/recipes.md (424 lines, commit 1ce24c8)
  Eight worked patterns: (1) clarify-then-execute pair with STOP
  gate, (2) fan-out via materialize, (3) supervisor-supplied params,
  (4) ${config.provider.*_skill} for provider portability, (5)
  mixing scaffold + prompt phases, (6) custom roles vs canonical
  routing keys (illustrating the v1.5 role/skill orthogonality
  rule), (7) supervised vs unsupervised, (8) optimizable: true DAG
  opt-in. Recipe 1's complete small-task example passes cp workflow
  validate --strict; the others are illustrative fragments grounded
  in the built-ins.

Plus one ancillary commit:
- README.md cross-link at top of "Workflow Engine" section pointing
  to docs/workflow/ (commit 721078d). Non-blocking per DESIGN.md but
  meaningfully improves discoverability.

Line counts: quickstart 183 (target ~150), reference 428 (target
~350), recipes 424 (target ~300). Each is over its soft target but
the content density was driven by the validation evidence and the
"every claim grounded" success bar. No vague placeholders, every
flag/field/command verified against the live codebase.

Next: review phase — present all 3 docs to user together for a
single consolidated pass (workflow principle #3).
