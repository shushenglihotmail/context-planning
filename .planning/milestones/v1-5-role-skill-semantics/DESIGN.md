---
milestone_slug: "v1-5-role-skill-semantics"
milestone: v1.5 Role/skill semantics
status: proposed
created: 2026-05-28
updated: 2026-05-28
deciders: []
supersedes: []
superseded_by: null
---

# Design: v1.5 Role/skill semantics

## Status

Proposed (2026-05-28). Pre-customer; breaking schema changes are acceptable.

## Context

While dogfooding v1.4's new `quick.yaml` / `milestone.yaml` workflows we hit
a class of bugs around how phases declare *who* runs them and *what* they
run:

1. **`role:` and `skill:` are conflated.** Today `provider.resolveSkill(role)`
   uses `role` as a routing key into `cp.providers.<name>.skills` — but the
   field's name implies persona. The v1.4 templates then set
   `role: planner` / `role: brainstormer` (persona-ish), AND
   `skill: "{{plan_skill}}"` (procedure-ish) on the same phase. Two
   different ideas, both wrong half the time.
2. **`${config.provider.X}` defaults are inert.** `quick.yaml` declares
   `default: "${config.provider.quick_design_skill}"`, but
   (a) no provider's config defines `quick_design_skill`, and (b) the
   runtime never interpolates `${config.…}` tokens — `lib/runtime.js`
   prints the literal string into the supervisor instructions.
3. **Result:** the supervised `design` phase of `cp-quick` arrives with
   `skill: ${config.provider.quick_design_skill}` (unresolved). Nothing
   binds the harness to a "discuss → DESIGN.md → confirm" gate, so on a
   terse task description the harness jumps straight to implementation —
   the bug that triggered this milestone.

The old (pre-v1.4) `cp-quick` shim did not have this problem because it
called `provider.resolveSkill('plan')` directly using an existing,
well-defined routing key (`plan` → `writing-plans`) and added an explicit
"confirm before executing" gate in prose.

## Decision

Treat **role** and **skill** as orthogonal concepts and fix the workflow
templates / runtime / validator accordingly.

### Conceptual model

| Concept | Meaning | Owner | Example |
|---|---|---|---|
| `role` | **Persona** the agent should adopt. Optional. Free-form. | Workflow author | `developer`, `tech-writer`, `ui-designer` |
| `skill` | **Routing key** into the active provider's skills map (default), or a hard-pinned provider skill name (escape hatch). | Workflow author + provider config | `plan`, `execute`, `brainstorm` (routing); `writing-plans` (pinned) |

- `role` shapes the agent's voice / mindset; it is rendered into the
  prompt as a persona hint.
- `skill` selects the *procedure*. By default it is a routing key the
  runtime resolves via `provider.resolveSkill(skill)`. If the value
  matches a literal skill name registered by the active provider, it is
  used as-is (pinned).
- They live on different axes and may both appear on a phase.

### Defaults strategy

Workflow YAML params must work **with zero user configuration**:

- Defaults may be either:
  - **Literal routing keys** guaranteed to exist in every provider's
    `skills:` map (`plan`, `execute`, `brainstorm`, `review`, …), or
  - **`${config.<dot.path>}` references** that resolve at load time
    against the loaded `config.json`.
- **Unresolved `${config.…}` fallback rule** (added during Phase 70
  implementation, per user direction):
  - If the dot-path is missing from `config.json`, fall back to the
    corresponding superpowers skill name from a hard-coded table.
  - Supported paths and their fallbacks:
    - `provider.quick_design_skill` → `writing-plans`
    - `provider.plan_skill`         → `writing-plans`
    - `provider.execute_skill`      → `subagent-driven-development`
    - `provider.brainstorm_skill`   → `brainstorming`
    - `provider.review_skill`       → `requesting-code-review`
  - Paths not in the fallback table → hard error citing the offending
    path and template name.
- User overrides:
  - per-run: `cp run <wf> "..." --param plan_skill=writing-plans`
  - global: edit `cp.providers.<name>.skills.<role>` in `config.json`
    (the dot-path resolver checks config first; fallback only fires
    when the path is genuinely absent).

### Loader-level params processing (implementation note)

DESIGN.md originally scoped Phase 70 to
`lib/workflow-template-expand.js` only. During implementation we
discovered that the **top-level workflow `params:` block** (e.g.
`quick.yaml`'s `params:` array) is currently never processed by
`lib/workflow.js`'s `loadTemplate` — only inline nested
workflow-template params (a separate v1.4 feature) flow through
expand.js. Phase 70 therefore also adds top-level params merge +
`{{name}}` substitution in `loadTemplate`, mirroring what expand.js
does for nested templates. This is what actually fixes the original
"`{{design_skill}}` reaches the supervisor literally" bug.

## Consequences

### Positive
- Workflows work out of the box on a fresh `cp init` without any config
  tweaks (and without superpowers installed — `manual` provider catches).
- The persona vs. procedure distinction matches how every other agent
  framework names these concepts; future contributors will guess right.
- The cp-quick design gate is enforced again (a real skill — e.g.
  `writing-plans` for superpowers, `cp:manual/plan` for manual — runs in
  the `design` phase and demands a DESIGN.md before execute).

### Negative
- **Breaking change** to the workflow YAML schema. All in-repo templates
  and any custom workflows must migrate. (Pre-customer, so acceptable.)
- Adds an interpolation pass in the template expander — small new
  surface in `lib/workflow-template-expand.js`.

### Neutral
- The `role` field becomes informational only (persona); it no longer
  affects skill routing. Tests that asserted `role` drove resolution
  must move to asserting on `skill`.

---

## Architecture

```
┌──────────────────────┐
│  workflow YAML       │
│  - params (defaults) │
│  - phases:           │
│    role: <persona>   │  ← free-form, optional
│    skill: <key>      │  ← routing key OR literal skill name
└──────────┬───────────┘
           │
           ▼
┌────────────────────────────────────────┐
│  lib/workflow-template-expand.js       │
│  - merge caller args + defaults        │
│  - NEW: interpolate ${config.<path>}   │
│    against loaded config.json          │
└──────────┬─────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────┐
│  lib/runtime.js (formatInstruction)    │
│  - if skill is a known routing key →   │
│    provider.resolveSkill(skill)        │
│  - else (looks like a literal skill    │
│    name registered by provider) →      │
│    use as-is                           │
│  - emit role (persona) + skill         │
│    (resolved) into supervisor block    │
└────────────────────────────────────────┘
```

## Components

### `lib/workflow-template-expand.js`
- Add `interpolateConfigTokens(value, cfg)` helper.
- Apply to each param's resolved value after default-vs-caller merge.
- Error on unresolved `${config.…}` tokens.

### `lib/runtime.js`
- New helper `resolvePhaseSkill(phase, cfg)`:
  - If `phase.skill` matches a known routing key → `provider.resolveSkill(phase.skill)`.
  - Else if it equals a literal skill name registered by the active provider → return as-is.
  - Else → emit a warning and pass through (manual provider will catch).
- Update `formatInstruction()` to print `role: <persona>` and
  `skill: <resolved>` (with `source:` annotation for debuggability).

### `lib/workflow.js` (validator)
- Forbid `kind: skill` phase with both `role:` matching a known routing
  key AND `skill:` set differently (likely author confusion).
- Warn when `role:` value equals a known routing key (probable misuse).
- Keep existing `kind: scaffold` mutual-exclusion checks.

### `templates/workflows/quick.yaml`
- Rename params: `design_skill`, `design_role`, `execute_skill`,
  `execute_role`. Literal defaults: `plan`, `developer`, `execute`,
  `developer`.
- Phases use both `role:` and `skill:`.
- Append explicit "STOP. Wait for user to confirm DESIGN.md before
  marking complete." to the `design` phase description (belt + suspenders).

### `templates/workflows/milestone.yaml`
- Same shape. Params: `brainstorm_skill`/`brainstorm_role`,
  `plan_skill`/`plan_role`. Defaults: `brainstorm`/`product-thinker`,
  `plan`/`developer`.
- Drop `${config.provider.*_skill}` defaults entirely.

### `templates/workflows/complete-milestone.yaml`
- Audit and migrate to the same shape (if it uses skill phases).

### `templates/config.json`
- No new keys required (routing keys `plan` / `execute` / `brainstorm` /
  `review` etc. already defined for all providers).
- Optionally add a comment block in each provider's `skills:` block
  documenting these as the stable routing-key vocabulary.

## Data Flow

1. User: `cp run quick "<task>"` (or via `/cp-quick`).
2. Runtime loads `quick.yaml`, merges params with caller args.
3. Param defaults like `plan` are interpolated as-is (no `${config.…}`
   to resolve in the v1.5 templates; the interpolation pass is there for
   future templates and for any user-authored ones).
4. Per phase, runtime emits supervisor instructions:
   - `role: developer` (persona, free-form)
   - `skill: writing-plans` (resolved from `plan` via active provider)
5. Supervisor LLM picks up the named skill from the configured provider
   (e.g. superpowers' `writing-plans`) and follows it.

## Error Handling

- Unresolved `${config.…}` token in param default → hard error at
  workflow-load time with the offending path.
- `skill:` value that is neither a known routing key nor a registered
  provider skill name → warning in supervisor instructions
  (`source: passthrough`); the manual provider's prose prompts are the
  ultimate fallback.
- `role:` value matching a routing key (e.g. `role: plan`) → validator
  warning suggesting the author meant `skill: plan`.

## Testing Strategy

- **Unit (`test/unit-libs.js` or new file):**
  - `interpolateConfigTokens` resolves nested paths against config.
  - Unresolved tokens throw.
  - `resolvePhaseSkill` routes known keys, passes through pinned names.
- **Workflow CLI dry-run (`test/dryrun-workflow-cli.js`):**
  - `cp run quick "..."` Wave 2 supervisor block shows real skill names
    (`writing-plans` with superpowers, `cp:manual/plan` with manual).
  - No literal `${config.…}` or `{{...}}` tokens appear in instructions.
- **Validator (`test/unit-workflow-validate.js` or extension):**
  - `role: plan` produces a warning.
  - `kind: skill` requires at least one of `role:` or `skill:` (today
    both are optional → tightening).
- **Fixture migration (`test/fixtures/workflows/*.yaml`):**
  - Any fixture using old shape (`role: planner` as routing) updated.
- **Round-trip (`test/roundtrip-gsd.js`):**
  - Confirm a project after migration still passes `cp gsd-import`.

## Alternatives Considered

### Option A — Add a new `persona:` field, leave `role:` as routing key
**Pros:** non-breaking; gradual deprecation.
**Cons:** keeps the wrong name on the routing field forever; every new
contributor will continue to assume `role: developer` makes sense and
silently break their workflows.
**Verdict:** rejected. Pre-customer is the right time to fix the names.

### Option B — Hard-code superpowers skill names as workflow defaults
**Pros:** no interpolation infra needed.
**Cons:** assumes a single provider. Manual / echo / future providers
each need their own provider-specific YAML, or the literal-name default
breaks them.
**Verdict:** rejected. Routing keys are the right abstraction.

### Option C — Tighten only `quick.yaml` / `milestone.yaml`; leave the model alone
**Pros:** smallest patch.
**Cons:** the underlying schema bug (role-as-routing-key) re-surfaces
the next time anyone authors a workflow.
**Verdict:** rejected per user direction ("full scale fix").

## Open Questions

- [ ] Should `skill:` accept an explicit `pin: true` marker, or keep
  auto-detection of "is this a routing key or a literal name"?
  (Lean: auto-detect now, add `pin:` only if it bites us.)
- [ ] Should `role:` be required for `kind: skill` phases, or optional?
  (Lean: optional, default omitted → no persona hint.)
- [ ] Migration tooling: emit a one-shot `cp workflow migrate-v1-5
  <path>` to upgrade external workflow YAMLs? (Pre-customer → skip.)

## References

- Conversation thread that surfaced this:
  cp-quick design phase skipped clarification on a one-line task
  description (2026-05-27).
- Old shim behavior: `commands/cp/quick.md` at commit `563fd39`.
- v1.4 design that introduced the bug:
  `.planning/milestones/v1-4-workflow-driven-quick-and-milestone/DESIGN.md`
  lines 222-308.
