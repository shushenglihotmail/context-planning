---
phase: "70"
name: Config token interpolation in workflow expansion
milestone: v1.5 Role/skill semantics
status: in-progress
created: 2026-05-28
base-commit: b6b3008122fedbf41b7dc387fe227f819c623d4b
# expected-key-files (optional, v0.8 P5) — declare what each plan
# intends to touch. `cp write-summary` will diff against the actual
# `key-files` and warn on drift (soft) or block (with --strict-expected).
# Two shapes accepted:
#   1. Flat array — phase-wide expected list:
#        expected-key-files:
#          - lib/foo.js
#          - test/foo.js
#   2. Object keyed by plan id — per-plan expectations:
#        expected-key-files:
#          {{NN}}-01:
#            - lib/foo.js
#          {{NN}}-02:
#            - bin/cli.js
---

# Phase 70: Config token interpolation in workflow expansion

**Milestone**: v1.5 Role/skill semantics
**Created**: 2026-05-28

## Goal

Make top-level workflow `params:` blocks actually work end-to-end:
parse them in the loader, interpolate `${config.<dot.path>}` defaults
against `.planning/config.json` (with a superpowers-skill fallback when
the path is missing), and substitute `{{name}}` tokens through every
phase body before the runtime sees it. After this phase, `quick.yaml`
defaults reach the supervisor as concrete skill names, not literal
`{{design_skill}}` strings.

## Scope clarification (vs DESIGN.md)

DESIGN.md scoped Phase 70 to `lib/workflow-template-expand.js` only.
During investigation we found the top-level workflow `params:` block
is **currently never read** by `lib/workflow.js`'s `loadTemplate` —
expand.js only handles params for *inline nested workflow-templates*.
Phase 70 is therefore expanded to cover both:

1. `interpolateConfigTokens(value, cfg, opts)` primitive (the DESIGN.md
   ask), with **superpowers-skill fallback** for unresolved paths (per
   user direction: "missing configuration skills assume using
   corresponding superpowers skill").
2. Top-level params merge + `{{name}}` substitution in `workflow.js`
   `loadTemplate`, mirroring what `workflow-template-expand.js` already
   does for nested templates.

DESIGN.md will be updated to document the fallback rule and the
loadTemplate change.

## Success Criteria

1. A workflow YAML with top-level `params:` declaring
   `default: "${config.provider.quick_design_skill}"` loads without
   error on a fresh project (no extra config), and the resolved value
   is the corresponding superpowers skill name (`writing-plans`).
2. When `cp.providers.<name>.skills.<key>` is defined in config, that
   value wins over the superpowers fallback.
3. Phase bodies that reference `{{design_skill}}` see the resolved
   string after loading — `formatInstruction` no longer emits literal
   `{{...}}` or `${config.…}` tokens.
4. Unresolved `${config.…}` tokens with no superpowers fallback throw
   a hard error at load time citing the offending path and template.
5. `npm test` passes; new unit tests cover both the helper and the
   loader integration.

## Plans

### 70-01 — Update DESIGN.md fallback rule
- Document the superpowers-skill fallback for unresolved
  `${config.…}` tokens.
- Document that top-level `params:` requires loader-level processing
  (previously absent).
- Files: `.planning/milestones/v1-5-role-skill-semantics/DESIGN.md`.

### 70-02 — `interpolateConfigTokens` primitive
- Add to `lib/workflow-template-expand.js` (per DESIGN.md location).
- Signature: `interpolateConfigTokens(value, cfg, opts) → resolved`
  where opts carries `templateName` for error context.
- Walk strings, replace `${config.<path>}` via dot-walk on `cfg`.
- Fallback table for unresolved paths:
  - `provider.quick_design_skill` → `writing-plans`
  - `provider.plan_skill` → `writing-plans`
  - `provider.execute_skill` → `subagent-driven-development`
  - `provider.brainstorm_skill` → `brainstorming`
  - `provider.review_skill` → `requesting-code-review`
- Unresolved + no fallback → throw with path + template name.
- Files: `lib/workflow-template-expand.js`.

### 70-03 — Wire into `mergeArgs` for nested templates
- Inside `mergeArgs`, after default+caller merge, walk each value
  through `interpolateConfigTokens` with the loaded config.
- Load config lazily once per `expandWorkflowTemplate` call.
- Files: `lib/workflow-template-expand.js`.

### 70-04 — Top-level params processing in loader
- In `lib/workflow.js` `loadTemplate`, after parsing YAML:
  - Read `source.params` (array of `{name, default}`).
  - Build `defaultsMap`, interpolate each default via
    `interpolateConfigTokens`.
  - Call `substituteArgs(phases, defaultsMap, …)` to apply
    `{{name}}` substitution across every phase body.
  - Surface a meaningful error if a phase body references an
    undeclared `{{name}}`.
- Files: `lib/workflow.js`.

### 70-05 — Unit tests
- `test/unit-libs.js` (or new file under `test/`):
  - `interpolateConfigTokens` resolves nested paths.
  - Fallback table fires for known superpowers paths.
  - Unresolved + no fallback throws.
  - Top-level params substitution: load a fixture workflow with
    `params:` block, assert phase fields are resolved.
- Files: `test/unit-libs.js`, possibly a fixture under
  `test/fixtures/workflows/`.

### 70-06 — npm test green, commit, SUMMARY.md
- Run `npm test`, fix regressions.
- Atomic commit per plan.
- Write `SUMMARY.md` with subsystems / key-files / decisions.

## Notes

- Loader-level processing means tpl.phases returned by `loadTemplate`
  has fully-substituted bodies. `computeWaves` and `formatInstruction`
  are unchanged.
- Phase 71 (provider.resolveSkill in runtime) becomes much simpler
  once Phase 70 lands: it only has to handle the routing-key vs.
  pinned-skill-name distinction; substitution is already done.
- Keep `interpolateConfigTokens` in workflow-template-expand.js (not a
  standalone module) to minimise new surface; export it so workflow.js
  can require it.
