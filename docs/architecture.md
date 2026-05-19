# Architecture

`cp` (context-planning) is two layers welded together by a thin command surface:

```
   ┌──────────────────────────────────────────────────────────────────┐
   │  Slash commands  (/cp-new-project, /cp-plan-phase, /cp-quick…)    │
   │  Live as harness-native skill files (Copilot .github/skills/cp-*) │
   └──────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  STATE LAYER  (this plugin owns it)                              │
   │   .planning/PROJECT.md      living spec                          │
   │   .planning/ROADMAP.md      milestone → phase → plan tree        │
   │   .planning/STATE.md        <100-line "you are here" digest      │
   │   .planning/phases/NN-name/{PLAN,SUMMARY}.md                     │
   │   .planning/quick/YYYYMMDD-slug/{PLAN,SUMMARY}.md                │
   │   .planning/cp-config.json  provider mapping                     │
   │                                                                  │
   │  Helpers: lib/frontmatter.js, lib/roadmap.js, lib/state.js       │
   └──────────────────┬───────────────────────────────────────────────┘
                      │ delegates by ROLE (brainstorm, plan, execute…)
                      ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  WORKFLOW PROVIDER  (configurable; default = Superpowers)        │
   │   brainstorm → writing-plans → subagent-driven-development …     │
   │   resolved at run time by lib/provider.js                        │
   │                                                                  │
   │  Fall-back: `manual` provider — inline prompts written into the  │
   │  command markdown so cp still works without any external skills. │
   └──────────────────────────────────────────────────────────────────┘
```

## Design principles

1. **Be the spine, not the muscles.** State management is what we own. The
   actual *do the work* skills (brainstorming, planning, executing, reviewing,
   shipping) come from a workflow provider.
2. **Role-based delegation.** Commands invoke providers by role
   (`brainstorm`, `plan`, `execute`, …), never by hard-coded skill name.
   Swapping providers is a config change.
3. **Soft dependency.** Missing provider skills don't crash; fall back to
   inline `manual` prompts and warn the user.
4. **Harness-agnostic source, per-harness install.** Command markdown is
   harness-independent. A small installer projects it into each harness's
   conventions (Copilot's `.github/skills/cp-*`, Claude's `.claude/commands/`,
   etc.).
5. **Atomic commits + resumable state.** Every command updates STATE.md and
   (optionally) creates a git commit, so any session can pick up where the
   last left off without re-deriving context.
6. **Small surface.** ~8 commands. If you find yourself wanting a 9th, ask
   whether it's a provider concern instead.
7. **GSD compatibility is a hard contract.** Same filenames, same
   frontmatter, shared `config.json`. Users can switch back to GSD any time;
   cp only ADDS to `.planning/`, never breaks it.

## File responsibilities

| File | Owns | Updated by |
|---|---|---|
| `PROJECT.md`  | What/why/requirements/constraints/decisions | `cp-new-project`, `cp-new-milestone`, manual edits |
| `ROADMAP.md`  | Milestones → phases → plans tree | `cp-new-project`, `cp-new-milestone`, `cp-plan-phase`, `cp-execute-phase` |
| `STATE.md`    | Where am I right now (digest) | every cp command |
| `MILESTONES.md` | Archive of shipped milestones | `cp-complete-milestone` |
| `MILESTONE-CONTEXT.md` | Transient spec for current milestone | `cp-new-milestone` (created), `cp-complete-milestone` (moved) |
| `phases/{NN-slug}/{phase}-{plan}-PLAN.md` | Concrete tasks for a plan | `cp-plan-phase` (via provider) |
| `phases/{NN-slug}/{phase}-{plan}-SUMMARY.md` | What actually happened | `cp-execute-phase` |
| `quick/*/PLAN.md` | Concrete tasks for ad-hoc work | `cp-quick` |
| `quick/*/SUMMARY.md` | Outcome | `cp-quick` |
| `config.json` (`cp.*`) | Provider + behavior settings | `cp config set`, manual edits |

All filenames and frontmatter match GSD's conventions. See the
"GSD compatibility" section in the [README](../README.md) for the round-trip
contract.

## What we explicitly do NOT do

- We don't review code. (Provider's `review` skill does that.)
- We don't run tests. (Provider's execute skill does that.)
- We don't write the actual plan tasks. (Provider's `plan` skill does that.)
- We don't enforce TDD or branch policy. (Provider's skills do that.)
- We don't track requirements traceability with REQ-IDs. (Light decisions
  table in PROJECT.md is enough.)
