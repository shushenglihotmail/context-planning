---
# Tier marker: cp scaffold substitutes one of:
#   phase: ""     (for phase-tier DESIGN.md)
#   milestone_slug: "v0-9-onboarding"  (for milestone-tier DESIGN.md)
milestone_slug: "v0-9-onboarding"
milestone: v0.9 Onboarding
status: accepted
created: 2026-05-21
updated: 2026-05-21
deciders: [shushengli]
supersedes: []
superseded_by: null
---

# Design: v0.9 Onboarding

## Status

Accepted on 2026-05-21 (scope locked after conversational design with
shushengli during v0.8 ship-out; brainstorm transcript preserved in
`.planning/MILESTONE-CONTEXT.md` until milestone close).

## Context

cp v0.8 shipped the full prevent/detect/repair drift stack and proved the
plugin's value-prop end-to-end. The user discovery question that opened
this milestone — *"can I just install cp on an existing repo and start
driving?"* — exposed a uniformly bad first-30-seconds experience for
three of the four ways a user lands on cp:

| Case | Today | Pain |
|---|---|---|
| 1. Greenfield (no code) | `/cp-new-project` | ✓ Works |
| 2. Existing code, no planning | `cp init && /cp-map-codebase` | 2 commands when 1 would do |
| 3. Existing code + GSD docs | `cp init && cp gsd-import` | OK — uncommon enough that 2 is fine |
| 4. Existing cp + version bump | (no documented command) | Forces the user to remember `npm install -g context-planning && cp install <harness> --force && cp config refresh && cp reconcile --all --infer-shas && cp audit --fix` |

Constraints driving the design:
- **Quick start matters.** First-impression friction kills adoption.
- **Don't break the cases that already work.** Case 1 and case 3 are
  fine; v0.9 must not regress them.
- **Match user mental models.** Users coming from GSD expect a
  `/cp-update` that behaves like `/gsd-update`.
- **No new harnesses, no new providers.** Pure UX milestone.

## Decision

Ship four focused phases that close the onboarding gaps for cases 2 and 4
and make all four paths discoverable from the README.

1. **Phase 32 — `cp map-codebase` auto-init.** When `.planning/` is
   missing, `cp map-codebase` runs `cp init` itself (with an explicit
   notice, not silently), then proceeds with mapping. Case 2 becomes a
   one-command start.

2. **Phase 33 — `cp update` command.** New CLI subcommand. Standalone, it
   does per-repo state refresh: harness detection, `cp install <harness>
   --force`, `cp config refresh`, SHA backfill for pre-0.8 phases, and
   `cp audit --fix`. The **documented invocation** in the README and the
   `/cp-update` skill is the npx-fronted one-liner that matches GSD:

   ```
   npx -y --package=context-planning@latest -- cp update
   ```

   That single command fetches the latest cp package via npx (per-user
   cache, no sudo, package-manager-neutral) and runs the new `cp update`
   subcommand against the current repo.

3. **Phase 34 — README onboarding decision matrix.** Add an explicit
   "Choose your starting path" section near the top of the README, with
   one row per case (1/2/3/4) and the exact command to run.

4. **Phase 35 — DESIGN.md lifecycle polish.** Per-phase DESIGN.md is
   scaffolded today but rarely populated. Promote it to a first-class
   capture step so design intent survives milestone close consistently
   alongside SUMMARY.md. (Drains inbox #1, v0.7 leftover.)

## Consequences

### Positive
- Case 2 onboarding goes from 2 commands to 1.
- Case 4 onboarding goes from "no documented command" to a single npx
  one-liner — feature-equal with `/gsd-update`.
- README clarifies entry points; users don't have to grep skills to find
  the right starting verb.
- DESIGN.md becomes a real artifact instead of a scaffolded-and-empty
  stub.

### Negative
- `cp update` is a new surface to maintain across CLI, skill files, and
  README. Mitigation: keep the subcommand thin (delegates to existing
  install/config/audit verbs).
- npx-fronted invocations download on every run if the version isn't
  cached. Mitigation: this matches GSD's pattern; users who care can
  install globally.

### Neutral
- Phase 35 reshapes the design-capture lifecycle but does not change any
  user-facing command.

---

## Architecture

```
case 2 (existing code, no planning):
  /cp-map-codebase
       │
       ├── if .planning/ missing → cp init (with notice)
       └── existing codebase analysis (unchanged)

case 4 (existing cp, version bump):
  USER  →  npx -y --package=context-planning@latest -- cp update
                                                            │
                                                            ▼
                                          ┌──────────────────────────────┐
                                          │  cp update (new subcommand)  │
                                          │  1. detect harness           │
                                          │  2. cp install --force       │
                                          │  3. cp config refresh        │
                                          │  4. SHA backfill (if <0.8)   │
                                          │  5. cp audit --fix           │
                                          │  6. summary                  │
                                          └──────────────────────────────┘
```

## Components

- **`cp map-codebase` (modified)** — pre-check for `.planning/`, invoke
  `cp init` flow if missing, print explicit notice, continue.
- **`cp update` (new subcommand)** — lives in `commands/update.js` (or
  similar), delegates to existing `install`, `config refresh`, `reconcile`,
  `audit` verbs. Cross-version migration hooks keyed by previously-installed
  version (read from a small `.planning/.cp-version` file or from the
  config block).
- **`/cp-update` skill** — markdown file mirroring `/gsd-update`. Runs the
  `npx ...` one-liner and reports results. Installed by all four harness
  installers.
- **README onboarding section** — new top-of-file section with the
  4-row decision matrix.
- **DESIGN.md aggregator** — slight upgrade to `lib/aggregate-milestone.js`
  to pull per-phase DESIGN.md into milestone roll-up alongside SUMMARY.

## Data Flow

`cp update`:
1. Reads `.planning/config.json` for `cp.harness`.
2. Detects previously-installed cp version from `package.json`-of-binary
   (or fallback to `.planning/.cp-version`).
3. Invokes existing `install <harness> --force` (idempotent, force-overwrite).
4. Invokes existing `config refresh` (re-merges defaults).
5. If previously installed < 0.8, invokes `reconcile --all --infer-shas`.
6. Invokes `audit --fix` to clean up any drift introduced by the upgrade.
7. Writes new `.planning/.cp-version` = current.

## Error Handling

- If `.planning/` missing in `cp update` → suggest `cp init` and exit
  non-zero (don't auto-init for this command — too risky).
- If harness can't be detected → ask user via prompt or `--harness=X` arg.
- If `audit --fix` finds HIGH-severity issues that fix can't resolve →
  exit non-zero with the audit summary and links to repair verbs.

## Testing Strategy

- Unit: `cp update` orchestration with mocked install/config/audit.
- Integration: full upgrade simulation on a fixture repo that has
  pre-v0.8 phase shapes (no SHAs); verify SHA backfill runs.
- E2E: smoke test that the npx invocation form parses and dispatches
  correctly (don't actually call npm — mock the entrypoint).
- Idempotency: running `cp update` twice in a row must produce no diffs.

## Alternatives Considered

### Option A — `cp update` is per-repo only; users run `npm install -g` themselves

**Pros:** clean separation, no global side-effects, matches
`terraform init -upgrade` convention.

**Cons:** fails the user's stated preference ("most people prefer one-line
command"). Forces users to remember two steps in the right order.

**Verdict:** rejected after the GSD comparison surfaced `npx` as the
mitigation for every concern. See MILESTONE-CONTEXT.md "Q&A — what does
the upgrade command do?" for the full reasoning chain.

### Option B — Auto-init silently inside `cp map-codebase`

**Pros:** even less ceremony.

**Cons:** invisible side-effect; users don't learn the underlying primitive
and can't reason about what happened. Hard to debug failed maps that left
half-init'd `.planning/` behind.

**Verdict:** rejected. We auto-init but print a clear notice ("ℹ
.planning/ not found — initialising before mapping…").

### Option C — One unified `cp start` command that handles all 4 cases

**Pros:** maximally minimal surface.

**Cons:** behavior would have to branch on environment detection — high
risk of doing the wrong thing on edge cases (partial GSD docs, half-init
repos). Explicit per-case verbs are easier to reason about and document.

**Verdict:** rejected. Discoverability matters more than minimalism here.

## Open Questions

- [ ] Where does the previously-installed cp version live for cross-version
      migrations? Options: `.planning/.cp-version` file, `cp.installed_version`
      in `.planning/config.json`, or `node_modules/context-planning/package.json`
      sniff. Decide during phase 33 planning.
- [ ] Should `cp update` honour a `--check` flag that reports what would
      change without writing? (probably yes — cheap to add.)

## References

- `.planning/MILESTONE-CONTEXT.md` — verbatim brainstorm Q&A
- Inbox items #1–#7 (drained into this milestone)
- `~/.copilot/get-shit-done/workflows/update.md` — GSD's update workflow
  (reference architecture for the npx one-liner pattern)
- v0.8 Consistency milestone (MILESTONES.md) — prerequisite for the
  SHA-backfill migration logic in `cp update`
