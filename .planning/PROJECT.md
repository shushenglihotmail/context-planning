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

### Known minor issues
- 5 MEDIUM concerns in `.planning/codebase/CONCERNS.md` open: `bin/cp.js`
  is 1100+ LOC with hand-rolled argv per handler; `lib/lifecycle.js` is
  800+ LOC bundling atomic-write infra with verbs; cosmetic polish on
  aider/cursor installers; codebase-mapper stub heuristic over-flags
  dense docs.
- No CI yet (LOW concern) — `npm test` runs locally only.

### Active
- Consistency stack: prevent / detect / repair drift between `.planning/` and code via SHA pinning, auto key-files, file-existence block, derived STATE, audit + `audit --fix` (GSD-mimic), 4 repair commands (reconcile/supersede/deviate/--continue), agent literacy injection, and opt-in git hooks (smart shim for monorepos) — v0.8

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
*Last updated: 2026-05-21 — started v0.8 Consistency milestone (phases 17-31)*

