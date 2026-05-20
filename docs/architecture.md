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
| `phases/{NN-slug}/DESIGN.md` | Phase-level design intent (ADR-style) | `cp-plan-phase` Step 3.5 (via provider `brainstorm`) |
| `phases/{NN-slug}/REVIEW-LOG.md` | Append-only log of review/decision pivots | `cp-execute-phase` Step 4.5 |
| `milestones/{slug}/DESIGN.md` | Milestone-level design + roll-up of phase DESIGNs | `cp-new-milestone`, promoted by `cp-complete-milestone` |
| `quick/*/PLAN.md` | Concrete tasks for ad-hoc work | `cp-quick` |
| `quick/*/SUMMARY.md` | Outcome | `cp-quick` |
| `config.json` (`cp.*`) | Provider + behavior settings | `cp config set`, manual edits |

All filenames and frontmatter match GSD's conventions. See the
"GSD compatibility" section in the [README](../README.md) for the round-trip
contract.

## Interaction with workflow providers

cp drives a provider session like a *conversation with a contract*: cp owns
the file system before/after the call, the provider owns reasoning + creative
output during the call, and cp captures the durable artifacts back out before
yielding control to the user.

```
                cp command                provider skill (e.g. SP)
                ──────────                ────────────────────────
   call:   ─ assemble context ──▶  ─ brainstorm / plan / execute ─┐
              (state + slot)                                       │
                                                                   │
   return: ◀── extract artifacts ◀── conversation output ──────────┘
              (write to .planning/)
```

### The role contract

Each provider skill is invoked for a specific **role**. cp passes a small
*context slot* (relevant files + intent) and expects a known *artifact* back.
Providers don't need to know about cp — they just produce their normal output;
cp's command markdown does the lifting to harvest it.

| Role | Where cp calls it | What cp sends in | What cp captures back | Lands in |
|---|---|---|---|---|
| `brainstorm` | `cp-new-project`, `cp-new-milestone`, `cp-plan-phase` Step 3.5 | PROJECT.md, MILESTONE-CONTEXT.md, phase intent | Design intent (Context / Decision / Alternatives Considered / Consequences) | `milestones/{slug}/DESIGN.md`, `phases/{NN-slug}/DESIGN.md` |
| `plan` | `cp-plan-phase`, `cp-quick` | Phase DESIGN.md + roadmap row | Plan body (task list, acceptance criteria) | `phases/{NN-slug}/{phase}-{plan}-PLAN.md`, `quick/*/PLAN.md` |
| `execute` | `cp-execute-phase`, `cp-quick` | PLAN.md + DESIGN.md (read-only) | Code changes + commit history + free-text outcome | Provider commits to git; cp writes `SUMMARY.md` with required `key-decisions` |
| `review` | `cp-execute-phase` Step 4.5 (opt-in) | Diff of execute step | Findings, pivots, rejected approaches | Appended to `phases/{NN-slug}/REVIEW-LOG.md` |
| `finish` / `worktree` / `tdd` / `debug` / `verify` | Various | Role-specific | Role-specific | Folded into SUMMARY notes; no dedicated file |

Only `brainstorm`, `plan`, and `execute` are required. Missing roles fall
back to inline `manual` prompts written into the command markdown
(soft-dependency principle #3).

### The return path (what cp captures back)

This is the half of the contract that's easy to miss. When SP runs a
brainstorm or planning session, it produces a *lot* of context that would
otherwise vanish when the LLM session ends. cp's command markdown forces a
small handful of structured extractions before the user is allowed to move
on:

1. **`brainstorm` → DESIGN.md.** After the provider returns, cp prompts:
   *"Capture the design intent in the milestone/phase DESIGN.md using the
   template (Context / Decision / Alternatives Considered / Consequences)."*
   The template lives at `templates/DESIGN.md`. Empty DESIGN.md files are
   tolerated but flagged by `cp status` (v0.8 deferred).
2. **`plan` → phase directory.** The aggregator discovers DESIGN.md by phase
   directory at roll-up time; no PLAN.md back-link is required today.
   A frontmatter `phases:` back-link array on milestone DESIGN.md is a
   v0.8 deferred item.
3. **`execute` → SUMMARY.md `key-decisions`.** Required key (validated by
   `lib/milestone.js::writeSummary`, surfaced via `cp write-summary` which
   exits 2 on missing). Forces the executor to record any deviation from
   the plan, surprise discoveries, or design-affecting choices made
   mid-execute. This is the audit trail.
4. **`execute` (+ optional `review`) → REVIEW-LOG.md.** Append-only,
   marker-anchored (`<!-- REVIEW-LOG-ENTRIES-BELOW -->`). Each entry is
   timestamped (`## YYYY-MM-DD HH:MM — Plan NN-MM Task N — <reviewer-role>`)
   and the aggregator counts entries to populate `reviewCount` in the
   milestone roll-up. Nothing is ever rewritten.
5. **`cp-complete-milestone`** promotes phase DESIGNs into the milestone
   DESIGN.md roll-up (`phaseDesignRefs` / `reviewLogRefs` / `reviewCount`
   in `lib/milestone.js::aggregateSummaries`), then archives the milestone
   into `MILESTONES.md`.

The net effect: a stateless LLM picking up this repo six months later can
reconstruct *what was decided, why, what was tried and rejected, and what
changed during execution* — without re-reading the original SP session
transcript (which is gone).

### Provider resolution

At runtime `lib/provider.js` walks `config.json → cp.providers`, runs the
provider's `detect` block (any-of paths / glob / command exit code) against
the current repo, and resolves each role to a concrete skill name. The
default config ships an `superpowers` provider, an `echo` test provider, and
a `manual` fallback. See [writing-providers.md](writing-providers.md) for
the schema, and `docs/superpowers/specs/2026-05-20-generic-provider-harness-detection-design.md`
for why detection is generic instead of SP-hardcoded.

### Worked example — `/cp-new-milestone "add OAuth login"`

1. **cp** reads `PROJECT.md`, creates `milestones/add-oauth-login/`, writes
   a stub `MILESTONE-CONTEXT.md` with the user's intent.
2. **cp** resolves role `brainstorm` → SP `brainstorming` skill → invokes it
   with MILESTONE-CONTEXT.md as the seed.
3. **SP** runs its own clarifying-questions / 2-3-approaches / design loop
   and emits a spec under `docs/superpowers/specs/`.
4. **cp** prompts the user to copy the agreed Context / Decision / Alternatives
   Considered / Consequences into `milestones/add-oauth-login/DESIGN.md`
   (template-driven; not optional).
5. **cp** updates `ROADMAP.md` with the new milestone + phase list derived
   from the design's "Components" section, updates `STATE.md`, and commits.

The user now has *both* a freeform SP spec (rich, conversational) *and* a
canonical cp DESIGN.md (structured, queryable, survives session loss). The
v0.7 milestone hardened this contract; see
`docs/superpowers/specs/2026-05-20-v0-7-design-capture-design.md`.

## What we explicitly do NOT do

- We don't review code. (Provider's `review` skill does that.)
- We don't run tests. (Provider's execute skill does that.)
- We don't write the actual plan tasks. (Provider's `plan` skill does that.)
- We don't enforce TDD or branch policy. (Provider's skills do that.)
- We don't track requirements traceability with REQ-IDs. (Light decisions
  table in PROJECT.md is enough.)
