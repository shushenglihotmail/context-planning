# Milestone Context: v1.0 Workflow Engine

Brainstorm transcript (verbatim Q&A) captured 2026-05-24.
Promoted into `milestones/v1-0-workflow-engine/DESIGN.md` as an appendix
at `cp complete-milestone`.

---

## Initial user prompt (intent)

> I would like to design a text based workflow format. The purpose is:
>
> 1. Customizable and reusable. For some type of work, the workflow can be
>    reused, like for development could have brainstorm → discussion →
>    research → plan → execution → review → audit. For debugging an issue,
>    could be brainstorm → collect symptoms → repro → plan → execution →
>    review → verify. Or a quick workflow just contains discuss → execution
>    → verify. These are pseudo procedures. The design of these phases
>    could be initially made by people or by AI agent. Once the workflow
>    design is done, the workflow can be written in text format template.
>    The template can copied to other places and be invoked by a cp
>    command. User can manually or through agent update the text based
>    template for their purpose.
>
> 2. The workflow template can specify if creating a subagent for a task,
>    what's that subagent's role (developer, sales, ceo …), what's that
>    subagent's model (high, middle, low or specific model name, by
>    default the current model). Also which task or phases can run
>    parallel. Where and what need to be persisted in CP planning
>    documents (design or implementation ideas, why make this change …).
>
> 3. CP maintains states automatically according the workflow. Note the
>    workflow may not always fit cp's milestone-phase structure, workflow
>    is customized state cycle defined by itself.
>
> 4. Workflow template can specify use what harness utility to do what
>    task like use superpowers to do brainstorm, design plan, execution.
>    But can also specify other framework, by default it should be
>    superpowers.
>
> 5. We should design this framework in simple and concise way.

---

## Q1 — Milestone name

**A:** v1.0 Workflow Engine

## Q2 — Scope decomposition

> Six implied subsystems: template format & loader, workflow runtime, per-step
> provider/skill override, subagent dispatch, persistence model, CLI surface.
> Should v1.0 cover all, or decompose?

**A:** Decompose — treat v1.0 as just the format + minimal runtime; queue the rest as v1.1, v1.2.

## Q3 — Template file format

> YAML / markdown+frontmatter / TOML / custom DSL?

**A:** "I need your think through and give me suggestions."
Walked through trade-offs (no-deps rule, cp's markdown house style, hand-edit-ability, long prompts, distributability). Recommended Markdown + key:value frontmatter.

**A (follow-up):** "I don't like markdown because it is not structured representation for a workflow. Like how do I express to run 3 tasks parallel in structured way? I like a structured way like XML, JSON or YAML, or our own customized structure?"

Re-evaluated structured options. Confirmed `yaml@^2.9.0` already a runtime dep (no marginal cost). YAML wins on parallelism expressiveness, multi-line prompts, comments, agent fluency.

**Decision:** YAML.

## Q4 — Orchestration shape (sequence + parallelism)

> Three options: flat DAG with `after:` / phase-groups two-level / flat steps with `group:` tag.

**A:** "I am thinking a dependent graph structure. YAML template is a list of phases. Each phase has a dependent field indicates which other phases it depends on. CP framework needs to first understand dependency relationship and figure out execution plan. However the weak point is this model is not very straightforward for people to understand its execution sequence. Any idea?"

**Mitigation strategy proposed (4 layers):** topo-order authoring convention + `cp workflow show` (wave staircase) + `cp workflow diagram` (Mermaid sidecar) + `cp run --plan-only` (dry-run).

**Decision:** DAG via `depends_on:` + topo-order convention (warning, not error) + readability tooling.

## Q5 — Workflow ↔ cp state architecture

> A: workflows replace milestones/phases / B: workflows are parallel concept / C: hybrid binds_to.

**A:** "I like Hybrid C, with 1 more caveat. `binds_to: none` seems a little random, hard to manage state. In this case, I suggest add a new state called 'custom' in CP framework. If template doesn't specify a binds_to, this is the default option. How do you think about custom state idea?"

**Refined model:** three first-class state tiers (milestone / phase / custom). Custom runs live in `.planning/custom/<slug>/` with their own `STATE.yaml` + per-phase `.md` files. Date-prefixed slugs. Discoverable by directory scan; no separate index file. `cp status` lists active custom runs alongside the active milestone.

**Decision:** Hybrid with three tiers; `custom` as default when `binds_to:` is absent.

## Q6 — Subagent dispatch semantics

> Proposed: `subagent: true|false` opt-in; abstract model levels mapped to concrete IDs in config.json; parallelism rule.

**A:** "About subagent, we should remove subagent concept from our template, it is agent harness concept. Our template only defines DAG model. How do tasks can be run parallel is up to harness. When CP detects two phases can run parallel from DAG, cp just prompt agent and says these 2 phases should run parallel, either in subagent or multiple agent cli instances, it is up to harness. But we do able to put phase task's role and model requirement. Like this phase should be run by an agent role as a business planner with high-end model. I don't like we explicitly define models as well. If possible we just tell agent, which level model they should use. And agent decide what model to use. But current copilot and claude may not support dynamic modeling, so this could be a place holder feature for now."

**Refinement (separation of concerns):** templates declare INTENT (id, depends_on, role free-form, model abstract level, skill, prompt); harness owns MECHANISM (process structure, parallelism mechanism, model resolution). cp emits intent prompts per wave; never picks model names, never spawns subprocesses, never counts parallel slots. `model:` is advisory/placeholder until harnesses expose per-call model APIs.

**Decision:** Templates declare WHAT, harnesses decide HOW.

## Q7 — Persistence model

> Proposed: templates declare `persist:` paths; cp writes to them.

**A:** "I am ok with your proposal. The only thing is 'Persist output to xxxx' sounds like template can specify random persistence. CP should maintain state automatically. About planning doc, it is better to be controlled by CP. However we should allow user to specify special persist point. May have a property like 'PersistOutput', that means we want to summarize and persist that phase's output. By default, true. But user can turn it off not persisting current phase."

**Refinement:** Templates drop `persist:` paths entirely. Only `persist_output: bool` (default true) remains. cp owns the destination path, computed from binding tier + phase id + topological order:

| Binding | Destination |
|---|---|
| milestone | `.planning/phases/{NN-phase-slug}/SUMMARY.md` |
| phase | appended to active phase's SUMMARY.md |
| custom | `.planning/custom/{run-slug}/{NN}-{phase-id}.md` |

Named accumulators (e.g., shared NOTES.md per run) deferred to v1.1.

**Decision:** `persist_output: bool` only; cp owns paths.

## Q8 — Built-in templates + CLI surface

**A:** Accept 3 reference templates (dev / debug / quick) matching the originally-named workflows. Accept CLI surface.

## Q9 — Clarifications (slug / `cp workflow init`)

**A (user request for clarification):** explained `slug` as the per-run instance identifier (vs. template name) and `cp workflow init` as the "copy built-in to project for local editing" pattern (analogous to `eslint --init`, `tsc --init`).

## Q10 — Adding/injecting custom templates

**A (user follow-up):** "How does user add, inject their customized template into current project?"

**Four authoring paths proposed:**
1. `cp workflow new <name>` — scaffold blank template
2. `cp workflow new <name> --from <existing>` — clone an existing template (built-in or local)
3. `cp workflow brainstorm` — AI-designed workflow via provider's brainstorm skill (fulfils original "by people or AI agent" requirement)
4. `cp workflow import <path-or-url>` — copy external template with validation

Plus: manual file drop into `.planning/workflows/` always works (directory IS the registry; no registration command required).

**Decision:** Accept all 4 authoring paths.

---

## Locked-in design (summary)

- **Format:** YAML, DAG-based, phases listed in topological order
- **Three state tiers:** milestone | phase | custom (default)
- **Per-phase fields:** `id`, `depends_on`, `role` (free-form), `model` (high|middle|low, advisory), `skill`, `persist_output` (bool, default true), `prompt`
- **Strict separation:** templates declare WHAT; harnesses decide HOW
- **cp owns paths:** destinations computed from binding + id + topo order
- **Built-in templates:** dev / debug / quick (3 starters)
- **CLI surface:** ~14 sub-commands (run + workflow + 4 authoring paths)
- **Readability:** topo-order convention + `cp workflow show / diagram` + `cp run --plan-only`
- **Deferred to v1.1+:** named accumulators, npm-style distribution, JSON Schema, branching/loops, harness-level dynamic model dispatch
