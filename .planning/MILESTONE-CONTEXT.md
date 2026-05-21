# MILESTONE-CONTEXT — v0.9 Onboarding

Transient brainstorm transcript. Promoted into the milestone DESIGN.md
appendix at `cp complete-milestone` time, then deleted from the tree.

## Origin

This milestone was scoped via conversational design with the user during the
v0.8 ship-out session (2026-05-21). The triggering question was: *"if I have
a repo with gsd installed, … can I just start using cp commands to continue
drive it?"* That opened a deeper UX audit of all the ways a new user lands
on cp.

## Q&A — the four onboarding paths

> **U:** Customer could have several start paths:
> 1. no code yet, simple — run `/cp-new-project`.
> 2. existing repo, existing code, need map existing code — run
>    `/cp-map-codebase`, it should auto-init project if not inited. The old
>    behavior `cp init` then `cp-map-codebase` is bad, people expect quick
>    and simple start. One-command start is preferred.
> 3. existing repo, existing code and gsd state docs — run `cp init` then
>    `cp gsd-import`. 2 commands is OK since this is less common.
> 4. existing repo, existing code and cp state docs but old version of cp —
>    run what command?

**Resolved:**
| Case | Right command |
|---|---|
| 1 | `/cp-new-project` (already correct) |
| 2 | `/cp-map-codebase` — **needs change in v0.9** to auto-init |
| 3 | `cp init && cp gsd-import` (intentional 2-step, well-served today) |
| 4 | **new `cp update` command** (introduced in v0.9) |

## Q&A — what does the upgrade command do?

> **U:** Does cp upgrade rerun npm to upgrade cp package or just upgrade cp
> configuration docs?

First-round answer recommended **per-repo only**, no npm — citing sudo
surprises, package-manager neutrality, chicken-and-egg with loaded binary,
and convention from `terraform init -upgrade`, `rails app:update`, etc.

> **U:** Does gsd upgrade do the same? Only update cp document, but not cp
> binaries?

Investigation of `~/.copilot/get-shit-done/workflows/update.md` showed GSD
does the **opposite**: `/gsd-update` runs
`npx -y --package=get-shit-done-cc@latest -- get-shit-done-cc --global`,
which **fetches AND installs** in one shot. The `npx` trick sidesteps every
concern of the first-round answer:

| First-round concern | How `npx` mitigates it |
|---|---|
| sudo prompts | `npx` writes to per-user cache, no `/usr/local` |
| chicken-and-egg | the running thing is a markdown skill firing a subprocess; it exits before the new binary "matters" |
| package-manager neutrality | npx ships with Node — universal |
| race / partial write | npx caches by exact version, installer is atomic per-runtime config dir |

> **U:** Most people prefer one-line command, so I agree gsd update
> behavior, can we do the same? Also should change name to "cp update" not
> upgrade.

**Resolved (LOCKED):**
- Command name: `cp update` (matches `/gsd-update`).
- Documented one-liner:
  ```
  npx -y --package=context-planning@latest -- cp update
  ```
- Standalone `cp update` (when binary already current) does per-repo
  refresh only: `cp install <harness> --force`, `cp config refresh`,
  SHA-backfill migration if crossing 0.8 boundary, `cp audit --fix`,
  summary.

## Synthesised scope

Four phases (32–35), confirmed with user before scaffolding:

- **32 — map-codebase auto-init** (case 2 win)
- **33 — `cp update` command** (case 4 win; 2 plans expected: subcommand
  + docs/skill wiring)
- **34 — README onboarding decision matrix** (surfaces all 4 paths)
- **35 — DESIGN.md lifecycle polish** (inbox #1, v0.7 leftover — promote
  per-phase DESIGN.md from "scaffolded but mostly empty" to "first-class
  capture step" alongside SUMMARY)

## Inbox items consumed by this milestone

- #1 (per-phase DESIGN.md template) → phase 35
- #2 (map-codebase auto-init) → phase 32
- #3 / #5 / #6 / #7 (cp update design iterations) → phase 33
- #4 (README decision matrix) → phase 34

## What's NOT in scope

- No new harness installers (Aider/Cursor/Claude/Copilot only).
- No knowledge-graph layer (per PROJECT.md "Out of Scope").
- No multi-runtime install matrix (`cp update --sync` was GSD-specific).
- No `cp downgrade` (rare enough; user can `npm install -g ...@<version>`).
