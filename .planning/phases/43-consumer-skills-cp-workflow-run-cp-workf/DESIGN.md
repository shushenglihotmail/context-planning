---
phase: "43"
milestone: v1.1 Workflow Skills
status: accepted
created: 2026-05-25
updated: 2026-05-25
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
---

# Design: Phase 43: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume

## Status

Accepted on 2026-05-25.

## Context

This is the first execution phase of v1.1 Workflow Skills. Per the
milestone DESIGN at `.planning/milestones/v1-1-workflow-skills/DESIGN.md`,
v1.1 ships five new `cp-workflow-*` agent skills + refactors `cp-quick`
and `cp-autonomous` to shims. Phase 43 delivers the **consumer** subset
— the three skills users invoke to drive an existing workflow:

1. `cp-workflow-run` — start any workflow and drive it to completion
   (the meat of v1.1; everything else orbits this one)
2. `cp-workflow-list` — discoverability; "what workflows can I run?"
3. `cp-workflow-resume` — resume / retry / inspect existing runs

Creator skills (`cp-workflow-new`, `cp-workflow-import`) are phase 44.
Shim refactors are phase 45.

**Installer discovery is automatic.** Both `install/copilot.js` and
`install/claude.js` iterate `commands/cp/*.md` via
`common.listCommandFiles(pluginRoot)`; adding a new skill is literally
dropping a markdown file into `commands/cp/`. No installer code change
is required for this phase — only test-side assertions that the new
files show up.

## Decision

Add three new skill files under `commands/cp/`, each following the
existing frontmatter + body convention used by `commands/cp/quick.md`,
`commands/cp/autonomous.md`, etc. Each skill is a pure consumer of the
v1.0 `cp run` / `cp workflow` CLI surface. Zero changes to `lib/` or
`bin/`.

| Plan | Surface | Source |
|---|---|---|
| 43-01 | `commands/cp/workflow-run.md` | new skill body, ~150–200 lines |
| 43-02 | `commands/cp/workflow-list.md` | new skill body, ~40–60 lines |
| 43-03 | `commands/cp/workflow-resume.md` | new skill body, ~80–100 lines |
| 43-04 | `test/unit-installers.js` (update) + `test/integration-workflow-skills.js` (new) | test additions |

All three skills follow the v0.5 `cp doctor`-aware pattern: they call
`npx cp doctor` early to discover provider/role mappings rather than
hardcoding `superpowers`. This keeps them portable across providers
(superpowers, manual, echo-provider, future).

## Consequences

### Positive
- Users get the conventional "verb-shaped" agent surface they expect
  from cp's other skill families (cp-new-milestone, cp-plan-phase,
  cp-execute-phase, cp-complete-milestone).
- `cp-workflow-list` directly answers the "how do I discover what's
  available?" question the user raised after Q1 of the brainstorm.
- `cp-workflow-run` becomes the single integration point that phases
  45 (`cp-quick`, `cp-autonomous` shims) will delegate to — landing it
  first de-risks phase 45.
- Adding a skill is now "drop a markdown file"; the installer auto-pickup
  pattern gets validated by phase 43-04's installer test update.

### Negative
- `cp-workflow-run` has to encode the wave loop in markdown
  (parse stdout → dispatch → mark-complete → repeat). Markdown is fine
  for prose-driven LLM instructions but verbose for control flow. We
  accept this; the alternative (moving the loop into `bin/`) would
  duplicate logic that already lives in `cp run`.

### Neutral
- Three new agent surfaces, ~3 new SKILL.md files in users' `.github/skills/`
  (or `~/.copilot/skills/` for user-scoped installs) after they next run
  `cplan install copilot` or `cplan update`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Agent CLI (Copilot CLI / Claude Code)                  │
│                                                          │
│  user typing → /cp-workflow-run debug "login-bug"       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  commands/cp/workflow-run.md  (NEW — plan 43-01)   │ │
│  │     Step 1: parse argv                              │ │
│  │     Step 2: resolve provider via `cp doctor`        │ │
│  │     Step 3: shell out: `cp run <wf> <name>`         │ │
│  │     Step 4: parse stdout → extract Wave N prompt    │ │
│  │     Step 5: dispatch to role skill                  │ │
│  │     Step 6: generate summary, mark-complete         │ │
│  │     Step 7: loop until status==complete             │ │
│  └────────────────────┬───────────────────────────────┘ │
│                       │                                  │
│  ┌────────────────────┼───────────────────────────────┐ │
│  │  commands/cp/workflow-list.md  (NEW — plan 43-02)  │ │
│  │     Step 1: shell out: `cp workflow ls --json`     │ │
│  │     Step 2: format as table for user               │ │
│  │     Step 3: if argv has name → `cp workflow show`  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  commands/cp/workflow-resume.md (NEW — plan 43-03) │ │
│  │     Step 1: parse argv: [slug] [--retry <phase>]   │ │
│  │     Step 2: if no slug → `cp run status` list      │ │
│  │     Step 3: if --retry → `cp run retry <slug> <p>` │ │
│  │     Step 4: else → `cp run resume <slug>`          │ │
│  │     Step 5: hand off to workflow-run wave loop     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         │ shell out (no API change)
                         ▼
              cp run / cp workflow CLI (v1.0, frozen)
                         │
                         ▼
              .planning/runs/<slug>/STATE
```

## Components

### Plan 43-01 — `commands/cp/workflow-run.md`

**Frontmatter:**
```yaml
---
name: cp-workflow-run
description: Drive any cp workflow to completion. Wraps `cp run <workflow> <name>` + the mark-complete wave loop. Generic over all built-in and custom workflows.
argument-hint: "<workflow> [<name>] [--plan-only] [--scope=...] [--check]"
requires: []
---
```

**Body sections (mirroring `commands/cp/autonomous.md` structure):**

1. **Step 1 — Parse arguments**
   - Required positional: `WORKFLOW` (the template name).
   - Optional positional: `NAME` (custom-tier run slug; required for
     milestone- and phase-bound workflows).
   - Flags: `--plan-only` (preview only, no state mutation),
     `--scope=phase|<N>|<N-M>|milestone` (passed through to outer loop),
     `--check` (preview waves, exit before executing).
   - If `WORKFLOW` missing → instruct user to run `cp-workflow-list`
     to see options.

2. **Step 2 — Validate workflow exists**
   - Shell: `cp workflow validate <WORKFLOW> --strict`
   - On error: print stderr, suggest `cp-workflow-list`, stop.

3. **Step 3 — Resolve provider via doctor**
   - Shell: `cp doctor` (parse the "Roles → resolved skill" block)
   - Cache role→skill mappings for use in step 6.
   - If a required role has no resolved skill → warn user, ask whether
     to continue with manual fallback.

4. **Step 4 — Start the run**
   - Shell: `cp run <WORKFLOW> <NAME>` (or `--plan-only` if user flag).
   - Capture slug from stderr (line matches `slug:\s+(\S+)`).
   - First wave prompt arrives on stdout (until `---` separator).

5. **Step 5 — Wave loop**
   - Parse the emitted wave block: phase id, role, model hint, prompt
     body.
   - For each phase in the wave:
     - Resolve role → provider skill via cached mapping from Step 3.
     - Invoke that skill with the prompt as input.
     - On success: collect output → `SUMMARY.md` content.
     - On smart-gate failure (test fail, audit HIGH, executor
       deviation): stop the loop, write
       `.planning/.continue-here.md`, surface to user.
   - Shell: `cp run mark-complete <slug> <phase-id> < summary.md`
     - Parse next wave from stdout, or detect "run complete" sentinel.
   - Loop until complete.

6. **Step 6 — Report**
   - On success: print summary table — slug, total waves completed,
     final status, links to `.planning/runs/<slug>/`.
   - On stop: print stop reason + path to `.planning/.continue-here.md`
     + suggest `/cp-workflow-resume <slug>`.

**Smart-gate semantics:** identical to `cp-autonomous` today. Stop on
the first failed `npm test`, the first HIGH finding from
`cp audit --json`, or any executor-skill output containing the
deviation sentinel.

**Argv contract for `--scope`:** parsed identically to `cp-autonomous`
so the phase 45 shim is trivial.

### Plan 43-02 — `commands/cp/workflow-list.md`

**Frontmatter:**
```yaml
---
name: cp-workflow-list
description: List available workflow templates (built-in + project). Pass a name to show that template's YAML.
argument-hint: "[<name>]"
requires: []
---
```

**Body:**

1. **Step 1 — Parse arguments**
   - Optional positional: `NAME`. If absent → list mode. If present →
     show mode.

2. **Step 2 (list mode)** — Shell: `cp workflow ls --json`. Render as
   table: name | source (built-in / project) | binds_to | description
   (first line of template prose, if present).

3. **Step 2 (show mode)** — Shell: `cp workflow show <NAME>`. Print
   YAML verbatim with brief framing: "Template `<NAME>` — paste
   this YAML or invoke with `/cp-workflow-run <NAME> <run-name>`."

4. **Step 3 — Suggest next action**
   - List mode: "Pick one with `/cp-workflow-run <name>` or inspect
     details with `/cp-workflow-list <name>`."
   - Show mode: "Run it with `/cp-workflow-run <NAME> <run-name>` or
     scaffold a copy with `/cp-workflow-new my-copy --from <NAME>`."

### Plan 43-03 — `commands/cp/workflow-resume.md`

**Frontmatter:**
```yaml
---
name: cp-workflow-resume
description: Resume, retry, or inspect an existing workflow run. Lists active runs when invoked with no slug.
argument-hint: "[<slug>] [--retry <phase-id>] [--abandon]"
requires: []
---
```

**Body:**

1. **Step 1 — Parse arguments**
   - Optional positional: `SLUG`. If absent → enumeration mode.
   - Optional flags: `--retry <phase-id>`, `--abandon`.

2. **Step 2 (enumeration mode)** — Shell: `cp run status --json`.
   Render as table: slug | workflow | binding | current_wave | status |
   started. Suggest: "Pick one with `/cp-workflow-resume <slug>`."

3. **Step 3 (resume mode)** — Shell: `cp run status <SLUG> --json` to
   sanity-check the run exists; then:
   - If `--abandon`: shell `cp run abandon <SLUG> --yes`, confirm.
   - Else if `--retry <phase-id>`: shell `cp run retry <SLUG>
     <phase-id>`, then enter the wave loop (delegate to logic
     equivalent to plan 43-01 Steps 5–6).
   - Else: shell `cp run resume <SLUG>` to get current wave prompt,
     then enter the wave loop.

4. **Step 4 — Loop and report**
   - Identical semantics to plan 43-01's wave loop. **Decision:** the
     wave-loop instructions are inlined in `workflow-run.md` only.
     `workflow-resume.md` instructs the agent to "follow the same
     wave loop as documented in `cp-workflow-run` from Step 5 onward."
     Avoids duplication; agents reading both skills see one source of
     truth.

### Plan 43-04 — `test/unit-installers.js` update + `test/integration-workflow-skills.js`

**Update `test/unit-installers.js`** (existing file) — add 3 new
assertions inside the "copilot installer writes one SKILL.md per
commands/cp/*.md" block (and the analogous claude block):

```javascript
assert(written.includes('cp-workflow-run'), 'cp-workflow-run skill installed');
assert(written.includes('cp-workflow-list'), 'cp-workflow-list skill installed');
assert(written.includes('cp-workflow-resume'), 'cp-workflow-resume skill installed');
```

**New `test/integration-workflow-skills.js`** — end-to-end smoke that
exercises the CLI path the skills depend on (cannot exercise the skill
markdown bodies directly without a live LLM):

- Scaffold a fresh temp cp project.
- `cp run quick "smoke-test"` → assert STATE created, wave 1 prompt
  printed.
- Pipe a synthetic summary → `cp run mark-complete smoke-test discuss`
  → assert wave 2 prompt emitted.
- Repeat for execute + verify waves.
- Assert final `cp run status smoke-test --json` shows
  `status: complete`, all 3 phases in completed list.
- `cp run status --json` → assert smoke-test appears in active-runs
  list as complete.
- `cp run abandon` flow on a fresh second run → assert status flips to
  `abandoned`.

Coverage target: ~15 new assertions. Wired into the `test` script in
`package.json` after `integration-run-cli.js`.

## Data Flow

```
User in agent CLI
    │
    │ "/cp-workflow-run debug 'login-bug'"
    ▼
Agent loads commands/cp/workflow-run.md (auto-installed)
    │
    │ Step 2: shell `cp workflow validate debug --strict`
    │ Step 3: shell `cp doctor` → role map
    │ Step 4: shell `cp run debug 'login-bug'`
    │   stderr: "slug: login-bug"
    │   stdout: "Wave 1 of 5\nPhase: reproduce\nrole: planner\nprompt: ..."
    ▼
Agent parses stdout (Step 5)
    │
    │ for phase in wave:
    │   resolve role 'planner' → 'superpowers/writing-plans'
    │   invoke that skill with prompt
    │   collect output → summary.md
    │   shell `cp run mark-complete login-bug reproduce < summary.md`
    │   stdout: "Wave 2 of 5\nPhase: hypothesize\n..."
    │
    └─▶ loop until "run complete" sentinel
    ▼
Agent reports to user (Step 6)
    │
    │ "Run login-bug complete. 5/5 waves. Summary: .planning/runs/login-bug/"
```

## Error Handling

| Failure | Surface | Skill response |
|---|---|---|
| `cp workflow validate` fails | stderr + exit 2 | Print errors, suggest `cp-workflow-list`, stop |
| `cp run` template not found | stderr + exit 3 | Print stderr, suggest `cp-workflow-list`, stop |
| Milestone-bound workflow with no run name | stderr + exit 2 | Skill asks user for name, retries |
| Role-skill not resolved (manual provider) | doctor warning | Skill asks user if they want manual fallback per phase, or abort |
| `npm test` fails during a wave | non-zero exit from test invocation | Smart-gate: stop, write `.continue-here.md`, surface to user |
| `cp audit --json` reports HIGH | JSON output | Smart-gate: stop, surface findings, suggest `/cp-audit-fix` |
| Executor skill output contains deviation sentinel | text match | Smart-gate: stop, write `.continue-here.md`, surface to user |
| `cp run mark-complete` fails (e.g. wrong phase id) | stderr + exit 4 | Skill prints stderr, asks user to resolve manually |

All smart-gate exits are recoverable: the user resolves the underlying
issue, then invokes `/cp-workflow-resume <slug>` to pick up.

## Testing Strategy

**Unit (in scope this phase):**
- Extend `test/unit-installers.js` with 6 new assertions (3 skills × 2
  installers) verifying the new skill files land in their respective
  install targets.

**Integration (in scope this phase):**
- New `test/integration-workflow-skills.js` exercises the CLI surface
  the skills depend on. ~15 assertions. Does NOT spawn an LLM — that's
  out of scope for cp's test suite.

**Dry-run:**
- Already exist (`test/dryrun-run-cli.js`, `test/dryrun-workflow-cli.js`
  from phase 41-03). No additions needed.

**Manual smoke (post-phase, before phase 44 starts):**
- In a real Copilot CLI session: `/cp-workflow-list` then
  `/cp-workflow-run quick "test"` end-to-end. Verify the wave loop
  works, summaries land, status flips. Capture findings in REVIEW-LOG.md.

**Coverage target:** maintain v1.0 baseline (85% lines / 75% branches).
Net new code is tests + markdown; coverage should rise slightly.

## Alternatives Considered

### Option A — Combine list + resume into a single `cp-workflow` skill with subcommands

**Pros:** fewer skill files; mirrors `cp workflow` CLI shape.

**Cons:** violates the established cp skill convention (one verb per
skill); worse discoverability in agent UIs that surface skills
alphabetically; argv parsing in markdown is brittle.

**Verdict:** rejected (same reasoning as the milestone-level Option A
rejection).

### Option B — Embed the wave-loop instructions inline in all three skills

**Pros:** each skill is self-contained; no cross-skill reference.

**Cons:** ~150 lines of wave-loop markdown duplicated 3×; future
edits (e.g. adding a new smart-gate condition) must land in 3 places.

**Verdict:** rejected. `workflow-run.md` owns the wave-loop section;
`workflow-resume.md` references it explicitly.

### Option C — Skip `cp-workflow-list`; rely on `cp workflow ls` in terminal

**Pros:** smaller scope; one fewer skill.

**Cons:** directly contradicts the user's explicit Q1 follow-up request
("should have a list workflow command as well so that customer knows
what workflow available"). Defeats the discoverability goal of v1.1.

**Verdict:** rejected.

## Open Questions

- [ ] (none — all design decisions captured in the milestone DESIGN
  and brainstorm transcript)

## References

- Milestone DESIGN — `.planning/milestones/v1-1-workflow-skills/DESIGN.md`
- Existing skill convention examples — `commands/cp/quick.md`,
  `commands/cp/autonomous.md`, `commands/cp/execute-phase.md`
- Installer auto-pickup — `install/common.js#listCommandFiles`,
  `install/copilot.js:30`, `install/claude.js:40`
- v1.0 CLI being wrapped — `bin/commands/run.js`, `bin/commands/workflow.js`
- Existing CLI dryrun tests (reused) — `test/dryrun-run-cli.js`,
  `test/dryrun-workflow-cli.js`, `test/integration-run-cli.js`
