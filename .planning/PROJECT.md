# context-planning

## What This Is

A harness-agnostic CLI plugin that keeps GSD's stateful context-management
layer (PROJECT/ROADMAP/STATE/phases) but delegates the actual development
workflow to a configurable provider — defaulting to Superpowers. Built for
developers using AI coding agents (Copilot CLI, Claude Code) who want
long-lived projects to stay coherent across sessions without the heavy,
prescriptive workflow of GSD.

## Core Value

**Stateful planning files survive across LLM sessions; the lifecycle CLI
makes those files painless to maintain — so an AI agent (or a human) can
pick up exactly where work left off without re-reading the whole repo.**

## Requirements

### Validated
- ✓ Drop-in GSD-compatible file shapes — v0.1
- ✓ Workflow-provider abstraction (Superpowers + manual) — v0.1
- ✓ End-to-end CLI lifecycle (status/tick/write-summary/complete) — v0.2
- ✓ Scaffold-milestone / scaffold-phase wrappers with correct ROADMAP shape — v0.3
- ✓ Atomic multi-file writes with rollback (writeBatch) — v0.3.2 / v0.3.4
- ✓ Scoped git commits (no more `git add -A` sweep) — v0.3.3
- ✓ Installer collision protection (writeFileSafe) + `--key=value` argv — v0.3.4
- ✓ Brownfield codebase mapping (7 docs, 4 parallel sub-agents) — v0.3.x
- ✓ `/cp-capture` + `cp capture`/`cp inbox` inbox triage — v0.4.0
- ✓ `cp statusline` for shell PS1 / Starship / tmux — v0.4.1
- ✓ Cursor (`.cursor/rules/*.mdc`) + Aider (`.aider.conf.yml`) installers — v0.4.2
- ✓ `cp worktree {create,list,remove}` with Superpowers hand-off opt-in — v0.4.3
- ✓ Aider YAML-parser fix (preserves user `read:`) + worktree shell-out extraction — v0.4.4
- ✓ Generic provider/harness detection — harnesses × providers cross-product with trailing-`*` glob, sectioned `cp doctor`, brownfield auto-heal merge — v0.5
- ✓ Quality wave: decompose `bin/cp.js` into per-command modules, dual-binary `cplan` + `cp`, GitHub Actions CI (Ubuntu+Windows × Node 20+22), c8 coverage with 80% threshold — v0.6
- ✓ Design capture infrastructure (DESIGN.md, REVIEW-LOG.md, key-decisions hard-block, milestone DESIGN.md aggregation) — v0.7
- ✓ npm publish (`context-planning@0.7.1`) + restructured Install docs — v0.7.1
- ✓ Consistency stack: prevent / detect / repair drift via SHA pinning, auto key-files, file-existence block, derived STATE, audit + `audit --fix` (GSD-mimic), 4 repair commands (reconcile/supersede/deviate/--continue), agent literacy injection, opt-in git hooks + CI template — v0.8 (published as `context-planning@0.8.1`)
- ✓ Onboarding wave: `cp map-codebase` auto-init (case-2 one-liner), `cp update` + `/cp-update` skill mirroring `/gsd-update`'s npx one-liner (case-4), README "Choose your starting path" 4-row decision matrix, milestone digest surfaces phase DESIGN.md + REVIEW-LOG.md refs, scaffoldMilestone tail-insert bug fix — v0.9 (published as `context-planning@0.9.0`)
- ✓ Autonomy: `/cp-autonomous` slash skill + `cp autonomous` CLI looping `plan-phase → execute-phase → tick → write-summary → state regen` across pending phases of the active milestone; smart-gated on test failure, audit HIGH, executor deviation; clean stop via `.planning/.continue-here.md` so `/cp-resume` picks up — v0.10 (published as `context-planning@0.10.x`)
- ✓ Workflow Engine: YAML-based workflow templates as a top-level abstraction. Templates declare a DAG of phases (`depends_on:`) with per-phase `role` / `model` / `skill` / `persist_output`. cp emits per-wave instructions; harness owns parallelism + model resolution. Three first-class state tiers: `milestone` / `phase` / `custom`. Ships 3 built-in templates (`dev`/`debug`/`quick`), 14-command CLI surface (`cp run` + `cp workflow`), AI-driven authoring via `cp workflow brainstorm`. — v1.0 (published as `context-planning@1.0.0`)
- ✓ Workflow Skills: 12 agent-side `cp-workflow-*` slash skills (one per `cp workflow` verb except `init`) closing the v1.0 agent-skill gap; 2 new CLI verbs (`cp workflow export`, `cp workflow inspect`); the latter exposes the runtime's deduced wave-by-wave execution sequence. ~150 new test assertions. — v1.1 (published as `context-planning@1.1.0`)

### Known minor issues
- 5 MEDIUM concerns in `.planning/codebase/CONCERNS.md` open: `bin/cp.js`
  is 1100+ LOC with hand-rolled argv per handler; `lib/lifecycle.js` is
  800+ LOC bundling atomic-write infra with verbs; cosmetic polish on
  aider/cursor installers; codebase-mapper stub heuristic over-flags
  dense docs.
- No CI yet (LOW concern) — `npm test` runs locally only.

### Active
- **Unified Phase Model**: collapse cp-autonomous + cp-quick onto the v1.0 workflow engine via a unified `Phase` data type used by both the milestone layer (ROADMAP/STATE — owns plan + state) and the workflow layer (templates — owns execution recipe). CLI surfaces (`cp autonomous`, `cp quick`, `cp run`) stay frozen; refactor is internal. Unifies transcript state under `.planning/runs/<slug>/`. Resolves the v1.1 Phase 45 deferral. — v1.2
- **- **Role/skill semantics + zero-config workflow defaults**: fix the cp-quick gate-skip bug by separating `role` (persona — developer, tech-writer, …) from `skill` (routing key by default, or pinned literal). Add `${config.<dot.path>}` interpolation in workflow expansion so defaults like `${config.provider.brainstorm_skill}` resolve via `provider.resolveSkill()` against the always-present routing-key map. Rewrite `quick.yaml` and `milestone.yaml` to use the new shape with strong design-gate prose. Pre-customer, breaking workflow-YAML schema changes acceptable. — v1.5** — v1.5
- **- **Workflow Contract Hardening**: close three foundational gaps in the workflow contract. (1) Make the `skill:` field in wave-block output read as a directive (`invoke skill: <name>`) with a one-time per-wave legend defining the contract and a single sanctioned fallback (skill unavailable → inline + tell user); move `(source: routing-key)` provenance behind `cp run --verbose`. (2) Auto-inject an implicit `finalize` phase at workflow-load time when YAML omits one, plus a generic `cp run-finalize <slug>` CLI for custom workflows — closes the gap where built-in `debug.yaml`/`dev.yaml` and any user-authored workflow can finish without closing. (3) Expand `CONFIG_FALLBACKS` in `lib/workflow-template-expand.js` with 5 missing role-keys (test → `test-driven-development`, debug → `systematic-debugging`, verify → `verification-before-completion`, execute_plan → `executing-plans`, finish_branch → `finishing-a-development-branch`) so natural workflow authoring routes to the right Superpowers skill out of the box. Also 6 inline prompt-scrub edits across `cp-quick`, `cp-workflow-run`, `cp-new-project`, `cp-execute-phase` to remove wording that legitimized inline execution. Spec: `docs/superpowers/specs/2026-05-28-v1-6-workflow-contract-hardening-design.md`. — v1.6** — v1.6

### Out of Scope
- **No knowledge-graph layer** — gsd-graphify-style indexing is heavy and
  out of step with the lightweight philosophy. Use ripgrep + file structure.
- **No multi-tenant SaaS** — this is a single-developer / single-repo plugin.
  Team workflows compose via PRs and committed `.planning/`, not a server.

## Context

- Forked the *state-management* shape from `get-shit-done` (TÂCHES) — same
  file names, same frontmatter keys — so projects can switch back to GSD
  at any time. The `cp:` config block in `.planning/config.json` is the
  only cp-specific addition.
- Workflow delegation lives behind `lib/provider.js` with 11 mappable
  roles (brainstorm/plan/execute/review/finish/worktree/tdd/debug/verify/...).
  Default mapping targets [Superpowers](https://github.com/obra/superpowers)
  skill names; `manual` provider inlines the prompts.
- Two harnesses installed today: GitHub Copilot CLI (`.github/skills/cp/`)
  and Claude Code (`.claude/commands/cp/`).
- Tests: ~429 assertions across 7 files (parser, gsd-import,
  complete-milestone, resume, round-trip, unit-lib, lifecycle).

## Constraints

- **Compatibility**: any change must remain GSD-shape-compatible. `cp gsd-import`
  on a project mutated by cp must still return clean.
- **No external services**: cp ships as a Node package, runs locally, never
  phones home, no telemetry.
- **Node-only runtime**: keep zero-deps in `bin/`/`lib/` to avoid supply-chain
  surface area. Test deps are fine.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Soft-couple to Superpowers (configurable provider) | Skills evolve fast; lock-in is the wrong default | v0.1+ provider abstraction with `manual` fallback |
| Single `lib/lifecycle.js` for "user-facing" ops | The 6 underlying GSD lib contracts have sharp edges (kebab-vs-snake, descriptor returns, single PLAN.md across both ROADMAP and phase) — wrapping them shields the agent | v0.2 CLI wrappers |
| Drop bullet-style `## Milestones` in ROADMAP | Parser wanted H3 in `## Phases`; templates contradicted parser | v0.3 template fix |
| `.planning/` is committed | Treats planning as source code (reviewable, diffable) | Default since v0.1 |
| `.planning/` includes design docs (PLAN-DESIGN.md, milestone DESIGN.md, REVIEW-LOG.md) | Stateless LLMs need design rationale, not just task lists, to resume work coherently | v0.7 design-capture infra |
| SHA pinning is foundation for consistency (`base-commit`/`end-commit` on PLAN/SUMMARY) | Deterministic audit requires deterministic phase boundaries; fuzzy "since last summary" heuristics produce false positives | v0.8 P1 |
| Drift defense is layered (prevent + detect + repair, not just one) | Prevention misses drift caused by manual ops; detection without repair leaves user hand-editing markdown; repair without prevention is whack-a-mole | v0.8 milestone |
| Agent literacy is always-on after `cp install`; agents always suggest, never refuse | Refusal-based gating is user-hostile; hooks are the enforcement safety net | v0.8 P11 |

---
*Last updated: 2026-05-25 — started v1.1 Workflow Skills milestone (phases 43-46)*

