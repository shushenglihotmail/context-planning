# context-planning (`cp`)

A lightweight, **stateful context-management plugin** for AI coding agents.

`cp` owns the *planning state* (milestones → phases → tasks, all recorded in markdown
files inside `.planning/`) but delegates the actual *development workflow* to a
configurable provider — by default, [Superpowers](https://github.com/obra/superpowers).

> Think of it as: **GSD's brain (state docs), Superpowers' hands (workflow skills)**.

## Why?

- **GSD** has excellent stateful context management — `PROJECT.md`, `ROADMAP.md`,
  `STATE.md`, phase directories — that makes work resumable across sessions and
  keeps stateless LLMs grounded. But its workflow pipeline is heavy: 60+ commands,
  30+ specialized subagents, multi-stage gated pipelines.
- **Superpowers** has a tight, fast workflow: brainstorm → plan → execute (with
  subagent-driven development and TDD enforcement) → review → ship. But it
  doesn't track multi-week project state.
- **`cp`** stitches them together: small command surface (~8 commands), the same
  beloved `.planning/` state docs, and every "do the work" step hands off to
  whatever workflow provider you have installed.

## Quickstart

```bash
# 1. Install cp into your AI harness of choice
cp install copilot     # GitHub Copilot CLI    (.github/skills/cp/)
cp install claude      # Claude Code            (.claude/commands/cp/, .claude/agents/)

# 2. Make sure Superpowers (or another provider) is installed in the same harness.
#    See https://github.com/obra/superpowers

# 3. In your project, start a new project or milestone
/cp-new-project                    # greenfield
/cp-new-milestone "v1.1 Notifications"   # brownfield

# 4. Drive each phase
/cp-plan-phase 1
/cp-execute-phase 1

# 5. Or one-off tasks
/cp-quick "fix the flaky login test"
```

## Command Surface

| Command | What it does |
|---|---|
| `/cp-new-project`        | Scaffold `.planning/`, hand off to provider's `brainstorm` skill to fill PROJECT.md, then break into phases |
| `/cp-new-milestone <name>` | Same flow for a new milestone on top of an existing project |
| `/cp-plan-phase <N>`     | Create the phase dir, call provider's `plan` skill, save `PLAN.md` |
| `/cp-execute-phase <N>`  | Hand `PLAN.md` to provider's `execute` skill; on success, tick ROADMAP, write `SUMMARY.md`, update STATE.md |
| `/cp-quick <task>`       | Lightweight ad-hoc task with PLAN + SUMMARY but no phase/roadmap baggage |
| `/cp-progress`           | "You are here — next is X" |
| `/cp-resume`             | Restore from `.continue-here.md` + STATE.md |
| `/cp-complete-milestone` | Archive, collapse the milestone in ROADMAP.md |

## State Layer

```
.planning/
├── PROJECT.md                       # Living what/why/requirements/constraints/decisions
├── ROADMAP.md                       # Milestones → phases → plans tree with checkboxes
├── STATE.md                         # <100-line "you are here" digest
├── MILESTONES.md                    # Archive of shipped milestones (GSD-compatible)
├── MILESTONE-CONTEXT.md             # Transient: current milestone spec (deleted on close)
├── config.json                      # Shared GSD+cp config (cp settings under `cp:` key)
├── phases/
│   └── 01-foundation/
│       ├── 01-01-PLAN.md            # GSD-shape: {phase}-{plan}-PLAN.md
│       └── 01-01-SUMMARY.md
├── quick/
│   └── 20260519-fix-login-test/
│       ├── PLAN.md
│       └── SUMMARY.md
└── .continue-here.md                # written when work pauses (inside phase dir)
```

## Provider Abstraction

`cp` calls workflow providers by **role**, not by name. The default
`.planning/config.json` includes both GSD's settings AND a `cp:` block:

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "workflow": { ... },               // GSD-compatible top-level keys
  "gates": { ... },
  "cp": {                            // cp-specific island
    "workflow_provider": "superpowers",
    "providers": {
      "superpowers": {
        "skills": {
          "brainstorm": "brainstorming",
          "plan":       "writing-plans",
          "execute":    "subagent-driven-development",
          "review":     "requesting-code-review",
          "finish":     "finishing-a-development-branch",
          "worktree":   "using-git-worktrees",
          "tdd":        "test-driven-development"
        }
      },
      "manual": { "skills": {} }
    },
    "behavior": {
      "atomic_commits": true,
      "fall_back_to_manual_if_provider_missing": true,
      "gsd_compat_mode": true
    }
  }
}
```

Swap providers with `cp config set workflow_provider <name>`. Missing skills
→ `cp` warns and falls back to the inline `manual` provider.

See [docs/writing-providers.md](docs/writing-providers.md) for the contract.

## GSD compatibility

`cp` is a **drop-in superset** of [get-shit-done](https://github.com/gsd-build/get-shit-done):

- **Same filenames** — `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `MILESTONES.md`,
  `MILESTONE-CONTEXT.md`, `phases/{NN-slug}/{phase}-{plan}-PLAN.md` and
  `-SUMMARY.md`, `quick/{YYYYMMDD-slug}/PLAN.md`.
- **Same frontmatter** — PLAN.md has `wave`, `depends_on`, `requirements`,
  `must_haves.*`; SUMMARY.md has the dependency graph (`requires` /
  `provides` / `affects`), `subsystem`, `tags`, `tech-stack`, `key-files`.
- **Same config file** — `.planning/config.json`. cp keys live under the
  top-level `cp:` block; GSD ignores unknown keys, so both tools coexist.
- **You can switch back to GSD at any time.** `cp` only ADDS to `.planning/`
  (config block, milestone bullets, ticked checkboxes). It never rewrites
  GSD-shaped files in incompatible ways.
- Run `cp doctor` to see the compatibility report for the current repo.

> **Status:** while cp is under active development, format parity with GSD
> is a hard contract. Long-term, cp may evolve its own conventions, but
> only after we've documented a migration path.

## Status

**v0.1.0 — early alpha.** Vertical slice for GitHub Copilot CLI:
`new-project`, `new-milestone`, `plan-phase`, `execute-phase`, `quick`.
Claude Code installer, full command set, and `manual` provider follow.

## Credits

- State-management patterns forked and stripped down from
  [get-shit-done](https://github.com/gsd-build/get-shit-done) by TÂCHES.
- Workflow provider model designed around
  [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent.

MIT.
