read-materials phase complete.

Read and synthesised source materials into CONTEXT.md (443 lines, just under the 400-line target).

Materials consumed:
- lib/workflow.js (loadTemplate, validate, validateV12Schema, computeWaves, applyAutoInjectFinalize, resolveTemplate)
- lib/workflow-template-validate.js (ALLOWED_PARAM_FIELDS, FORBIDDEN_PARAM_FIELDS, dotted/simple/config token regexes)
- lib/workflow-template-loader.js (workflow-template loader for reusable phase chunks)
- lib/workflow-template-expand.js (CONFIG_FALLBACKS table for  defaults)
- bin/commands/workflow.js (USAGE block, exit codes, all sub-commands)
- bin/commands/run.js (USAGE block, sub-commands, stdin protocol for mark-complete)
- templates/config.json (canonical routing keys + Superpowers/manual provider skill maps)
- All 6 built-in templates (quick, docs, milestone, dev, debug, complete-milestone) as worked examples
- README.md §"Workflow Engine" (lines 418-660 — cross-link target)
- MIGRATION-v1.4.md, MIGRATION-v1.6.md, MIGRATION-v1.7.md

CONTEXT.md captures: file layout + lookup order, complete top-level + per-phase schema with required/optional + defaults, role-vs-skill (v1.5) rules, full template parameterization whitelist (v1.7) with allowed/forbidden field lists, dotted-token + post-expand rules, supervisor-supplied params pattern, fan-out semantics (parent/after/materialize/max_children + optimizable+depends_on), auto-injected finalize (v1.6), wave computation, full cp workflow + cp run CLI surface with exit codes, the v1.6 skill invocation contract, a worked-example table of all 6 built-ins keyed to which recipe each illustrates, the style anchor (docs/writing-providers.md), the cross-link plan, and 6 hard rules for the writers.

Notable caveat captured: cp workflow new (without --from) emits a stub with bare-form phase entries that the v1.4 validator rejects. Writers should hand-roll quickstart examples using phase: wrappers, and recommend --from <built-in> when introducing cp workflow new.

Next: prepare phase will decompose the work into one item per document (3 items: quickstart, reference, recipes).
