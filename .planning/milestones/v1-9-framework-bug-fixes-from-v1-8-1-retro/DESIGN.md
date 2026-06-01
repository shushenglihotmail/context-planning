---
milestone_slug: "v1-9-framework-bug-fixes-from-v1-8-1-retro"
milestone: v1.9 Framework Bug Fixes from v1.8.1 Retro
status: accepted
created: 2026-06-01
updated: 2026-06-01
deciders: [shushenglihotmail]
supersedes: []
superseded_by: null
---

# Design: v1.9 Framework Bug Fixes from v1.8.1 Retro

## Status

Accepted on 2026-06-01.

## Context

After v1.8.1 shipped, the sibling repo `WCCT-Copilot` ran the
`composition` workflow end-to-end against cp v1.8.1. The driving agent
later authored a postmortem flagging two self-inflicted issues
(no superpowers skill invocation, no fan-out for an inherently
sequential chain) and we extracted six additional issues that point at
real cp framework gaps rather than agent discipline:

- **A** — `lib/roadmap.js` regexes require exact `###` Phase headings.
  GSD-imported or hand-edited roadmaps can drift to `####`, making the
  phase invisible to `listPhases()` and triggering false
  `phase-no-roadmap` audit findings.
- **B** — `cp write-summary` validates file existence by scraping
  path-shaped tokens (`src/...ps1`, etc.) out of PLAN.md body. False
  positives forced the WCCT agent to systematically pass
  `--no-file-check`, silencing the gate entirely.
- **C** — `cp complete-milestone` does not rewrite the
  `<!-- cp:current-focus -->` banner in STATE.md. Users must manually
  run `cp state regen` after closing a milestone or the banner shows
  stale data.
- **D** — `cp doctor` warns when a phase has both short-form `PLAN.md`
  and long-form `NN-MM-...-PLAN.md`, but there is no auto-fix. Manual
  cleanup is error-prone.
- **E** — `cp audit` has no rule that detects sham REVIEW-LOG entries.
  In the WCCT retro three REVIEW-LOGs read "approved on first pass"
  with no real reviewer; this went unflagged.
- **F** — cp has no mechanism for the harness LLM to attest that it
  actually loaded the resolved skill. A workflow phase whose execute
  role resolves to `superpowers/subagent-driven-development` can be
  silently fulfilled by inline paraphrase, and cp has no signal.

Project constraints carried from v1.8 (and reaffirmed):

- **GSD round-trip compatibility** must remain clean — `cp gsd-import`
  on a cp-mutated project must return no diff.
- **No external services** — local-only, zero telemetry.
- **Node-only runtime** — `bin/` and `lib/` stay zero-deps; test deps OK.

## Decision

Ship v1.9.0 (minor bump) addressing all six bugs as six atomic phases,
each a single commit with tests. Sequencing: phases 1–4 sequential;
phases 5 and 6 may run as a parallel wave if the workflow planner
supports it, otherwise sequential.

Both new audit rules (E `sham-review-log`, F
`skill-resolved-but-not-loaded`) ship **always-on at MEDIUM severity**,
matching the existing `phase-no-roadmap` rule. The Bug-A scanner fix
ships as **scanner-only** — no auto-normalization, no informational
warning — to keep the patch minimal and predictable.

## Consequences

### Positive
- Drift gates that today require human inspection (sham REVIEW-LOG,
  skill bypass) become machine-detectable via `cp audit`.
- The four small papercuts (A, B, C, D) stop forcing users to learn
  workarounds (`--no-file-check`, manual `cp state regen`, manual
  long-form deletion).
- The framework gains a structured attestation channel (Bug F) that
  future workflows can extend (e.g. for review skills, gate skills).

### Negative
- Bug F bumps the schema of `.run-state/<workflow-slug>/<phase>.json`.
  Back-compat path: missing `invoked_skill` field is treated as
  `<unrecorded>` and produces a MEDIUM warning, not an error, so
  in-flight v1.8.x workflows do not break.
- Bug E may produce findings in existing projects whose workflows
  legitimately ran with `orchestrator (inline)` reviews. Mitigation:
  the rule only fires when the resolved execute skill is on a known
  reviewer-bearing allowlist (initially
  `superpowers/subagent-driven-development` and
  `superpowers/requesting-code-review`).
- Bug B narrows the meaning of `--no-file-check` from "skip all path
  validation" to "skip the (smaller) frontmatter validation too" and
  emits a deprecation warning, surfacing a small UX nudge for any
  scripts that pass the flag.

### Neutral
- Six new test fixtures land under `test/dryrun-*` and existing test
  files are extended in place. No new test runner; npm test still uses
  the existing harness.
- CHANGELOG gains one entry per phase plus a release line for 1.9.0.

---

## Architecture

The fixes touch four layers of cp; nothing is rearchitected.

```
                     +----------------------------+
                     | bin/commands/*.js          |
                     |  - write-summary  (B)      |
                     |  - complete-milestone (C)  |
                     |  - doctor (D)              |
                     |  - mark-complete (F)       |
                     +-------------+--------------+
                                   |
                                   v
   +--------------------+   +------+-------+   +---------------------+
   | lib/roadmap.js (A) |   | lib/state.js |   | lib/workflow-runner |
   |  listPhases regex  |   |  regenerate  |   |  prompt builder (F) |
   +--------------------+   +------+-------+   +----------+----------+
                                   |                      |
                                   v                      v
                            +------+----------------------+------+
                            | lib/audit.js                       |
                            |  + sham-review-log         (E)     |
                            |  + skill-resolved-but-not-loaded(F)|
                            |  ~ phase-no-roadmap msg    (A)     |
                            +------------------------------------+
```

## Components

| Unit | Purpose | Public interface | Depends on |
|---|---|---|---|
| `lib/roadmap.js` | Phase discovery in ROADMAP.md | `listPhases(root) → []`, `listCollapsedPhaseNums(root) → []` | fs, regex |
| `lib/milestone.js` | Milestone tier ops including `writeSummary` | `writeSummary(root, planId, data, opts)` | `lib/state.js`, fs |
| `lib/state.js` | STATE.md banner regen | `regenerate(root)` | `lib/roadmap.js`, fs |
| `lib/audit.js` | Audit rule registry & runner | `runAudit(root, opts)` | `lib/roadmap.js`, fs |
| `lib/audit-fix.js` | Auto-fix dispatchers | `fixDualPlan(root)` (new) | fs |
| `lib/workflow-runner.js` | Per-phase prompt builder, mark-complete state | `runWorkflow`, `markComplete` | run-state JSON, workflow YAML |
| `bin/commands/*` | CLI surfaces; thin orchestrators | yargs handlers | corresponding lib/ |

## Data Flow

**Bug F end-to-end:**
```
workflow YAML resolves skill → workflow-runner appends attestation
contract to prompt → harness LLM completes phase → user pipes summary
to `cp run mark-complete` → mark-complete parses
`invoked_skill: <name>` block from stdin → writes to
.run-state/<slug>/<phase>.json → `cp audit` cross-references run-state
against resolved skill → emits skill-resolved-but-not-loaded MEDIUM
if mismatch.
```

**Bug E end-to-end:**
```
`cp audit` walks completed phase dirs → for each phase, loads workflow
YAML to find resolved execute skill → if skill in reviewer-bearing
allowlist, opens REVIEW-LOG.md → parses entries → if zero entries or
every entry's reviewer is empty/null/`orchestrator (inline)`/`self`,
emits sham-review-log MEDIUM.
```

## Error Handling

- `lib/roadmap.js` regex change is purely additive; no new error paths.
- `lib/milestone.writeSummary`: when `expected_files:` frontmatter is
  absent, validation is a no-op (logs at DEBUG level, never errors).
  `--no-file-check` still works but prints a deprecation warning to
  stderr.
- `lib/state.regenerate` called from `complete-milestone`: wrapped in
  try/catch; failure logs at WARN but does not roll back the close.
- `cp doctor --fix-dual-plan`: deletes long-form file only after
  confirming short-form `PLAN.md` exists and is non-empty. Each
  deletion logged with the path.
- Bug F: missing attestation in stdin is back-compat (`<unrecorded>`),
  malformed YAML in attestation block logs WARN and treats as
  `<unrecorded>`. No phase-completion blocking.
- Bug E: REVIEW-LOG parse errors degrade to "rule did not run"; the
  rule emits an INFO note rather than spuriously failing.

## Testing Strategy

- **Unit-style dryrun tests** extended in place (`test/dryrun-*.js`).
  No new test runner.
- **Per bug**:
  - A: fixture with `#### Phase 8:` heading, assert listPhases finds it
    and audit yields zero `phase-no-roadmap` findings.
  - B: fixture PLAN.md whose body mentions `src/foo.ps1` (does not
    exist on disk) but whose frontmatter lists `expected_files:
    [README.md]` (exists). Assert writeSummary succeeds without
    `--no-file-check`.
  - C: fixture milestone with stale banner, run complete-milestone,
    assert banner cleared.
  - D: fixture phase with both PLAN.md and `01-01-foo-PLAN.md`, run
    `cp doctor --fix-dual-plan`, assert long-form deleted and short-form
    intact.
  - E: fixture workflow with phase whose execute skill is
    `superpowers/subagent-driven-development` and an empty REVIEW-LOG.
    Assert audit emits sham-review-log MEDIUM.
  - F: fixture workflow phase whose mark-complete stdin omits
    `invoked_skill`, then second fixture with `invoked_skill: none`,
    then third with `invoked_skill: <correct skill>`. Assert audit
    behavior in all three cases.
- **Regression**: `npm test` between every phase commit; final
  `cp audit` against this project's own `.planning/` to ensure no new
  findings on cp itself.

## Alternatives Considered

### Option A — Treat all six as a 1.8.2 patch

**Pros:** Smaller user-visible blast radius; semver-quiet release.

**Cons:** Bug F introduces a new attestation contract and schema
field that's a user-visible behavior change. Bug E adds a new audit
rule that can fail `cp audit --strict` in projects that previously
passed. Both are minor-version behavior, not patch.

**Verdict:** rejected; ship as 1.9.0.

### Option B — Drop Bug E (sham REVIEW-LOG) as too opinionated

**Pros:** Avoids any chance of false positives in solo-dev projects.

**Cons:** Bug E is the only check that catches the original WCCT
symptom directly. Mitigated by reviewer-bearing-skill allowlist.

**Verdict:** rejected; kept with allowlist mitigation.

### Option C — Skip Bug F; rely on Bug E plus human review

**Pros:** No schema bump, no prompt-contract noise.

**Cons:** Bug E does not catch brainstorming/non-reviewer bypass.
Coverage matrix in user-facing design showed F closes a real gap.

**Verdict:** rejected; F included.

## Open Questions

- [ ] Should the reviewer-bearing allowlist for Bug E be configurable
      per-project, or hardcoded for v1.9.0 and revisited in v1.10?
      Working assumption: hardcoded for now, configurability deferred.
- [ ] Does `cp run mark-complete` already read stdin, or does Bug F
      need a new stdin handler? To be confirmed in Phase 6 planning.

## References

- `.planning/milestones/v1-8-1-implicit-attach/SUMMARY.md` — prior
  milestone closeout.
- WCCT-Copilot retro (verbatim pasted by user 2026-06-01).
- `lib/roadmap.js`, `lib/audit.js`, `bin/commands/write-summary.js`,
  `bin/commands/complete-milestone.js`, `bin/commands/doctor.js`,
  `lib/workflow-runner.js`, `lib/audit-fix.js`, `lib/state.js`,
  `lib/milestone.js` — files touched.
- Earlier session checkpoints:
  `002-mapping-cp-framework-bug-fixes.md`,
  `001-closing-v1-8-milestone-startin.md`.
