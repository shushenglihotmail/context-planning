Review wave complete. Applied two rounds of fixes:

Round 1 (commits 029a5a8, d56af92, 4653519): Fixed 8 peer-review findings —
${config.…} only-in-params semantics, real v1.6 contract block format,
correct state.json path, phase-template vs workflow-template inclusion
separation, accurate "Aliases and legacy forms" section, Recipe 4
rewrite teaching the working param-indirection pattern.

Round 2 (commits 8a0e878, f54f88c): Rewrote reference.md as a true
field-semantics reference (~990 lines) covering every top-level and
per-phase field with meaning + runtime impact + validation + common
mistakes, cited to concrete lib/* source lines. Fixed recipes.md
Recipe 1's incorrect claim that outputs: is "a hint, not enforced"
(it's a hard contract under supervised mode). Added docs/workflow/README.md
as the folder landing page introducing what a workflow is and routing
readers to the three tutorial docs.

All snippets re-validated under `cp workflow validate --strict`.
The 3 docs + README now form a coherent set:
- README.md (84 lines)  - folder landing page
- quickstart.md (215 lines)  - first-time author walkthrough
- reference.md (993 lines)  - field-by-field semantics + CLI surface
- recipes.md (451 lines)  - 8 worked patterns

