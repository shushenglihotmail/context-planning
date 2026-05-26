# Roadmap: context-planning

## Overview

<!-- One paragraph: the journey from here to shipped. -->

## Phases

<details>
<summary>✅ v0.9 Onboarding (Phases 1-35) — SHIPPED 2026-05-21</summary>

<details>
<summary>✅ v0.8 Consistency (Phases 1-31) — SHIPPED 2026-05-21</summary>

<details>
<summary>✅ v0.7 Design Capture (Phases 1-16) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.6 Quality Wave (Phases 1-15) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.5 — Generic provider/harness detection (Phases 1-10) — SHIPPED 2026-05-20</summary>

<details>
<summary>✅ v0.4 — Polish & Capture (Phases 1-5) — SHIPPED 2026-05-20</summary>

<!--
  Milestone heading shape (parsed by lib/milestone.js findMilestoneInRoadmap):
    ### 🚧 v0.1 — name (In Progress)     (active)
    ### 📋 v0.2 — name (Planned)          (queued)
    ### ✅ v0.1 — name (Shipped YYYY-MM-DD) — wraps a <details> block after close-out

  Phase heading shape (must follow a milestone heading):
    ### Phase 1: name
    ### Phase 2.1: name    (decimal = urgent insert between integers)

  After /cp-complete-milestone the milestone heading is replaced with a collapsed
  <details><summary>...</summary>...</details> block; phase headings remain inside.

  Start your first milestone with:
    cp scaffold-milestone "v0.1 — <your milestone name>"
    cp scaffold-phase 1 --name "<phase name>" --plans <count>
-->


### Phase 1: cp-capture command

Plans:
- [x] 01-01: `lib/inbox.js` pure helpers + `test/unit-inbox.js` (45 assertions)
- [x] 01-02: `cp capture` + `cp inbox` CLI handlers in `bin/cp.js`
- [x] 01-03: `/cp-capture` slash command + `templates/INBOX.md`

### Phase 2: Status-line hook

Plans:
- [x] 02-01: `cmdStatusline` handler in `bin/cp.js` with token format `%M %P %D %N %B`
- [x] 02-02: `test/unit-statusline.js` (28 assertions) — silent-outside-project invariant + color gating

### Phase 1.5: Map codebase

Plans:
- [x] 1.5-01: `lib/codebase-mapper.js` + 7 template stubs in `templates/codebase/`
- [x] 1.5-02: `cp scaffold-codebase` + `cp codebase-status` CLI handlers
- [x] 1.5-03: `/cp-map-codebase` slash command with 4-agent parallel dispatch protocol

### Phase 3: Cursor + Aider installers

Plans:
- [x] 03-01: `install/cursor.js` with `buildRule()` frontmatter synthesis
- [x] 03-02: `install/aider.js` with `buildContextBriefing()` + `patchAiderConfig()` + `test/unit-installers.js` (50 assertions)

### Phase 4: git worktree integration

Plans:
- [x] 04-01: `lib/worktree.js` (~190 LOC) + `bin/cp.js cmdWorktree{Create,List,Remove}` + `test/unit-worktree.js` (56 assertions)

### Phase 5: Dogfood hotfix

Plans:
- [x] 05-01: `install/aider.js` → switch to `yaml` parser + auto-migrate legacy fenced blocks (+8 test assertions)
- [x] 05-02: `lib/worktree.js` → extract `runGitWorktreeAdd/Remove` + `listGitWorktrees` from `bin/cp.js` (+6 test assertions)

</details>

### Phase 6: Schema + detection core

Plans:
- [x] 06-01: Schema v2 in templates/config.json + lib/detect.js with expandRoot + detectProviderAtAnyHarness + detectAllInstalled
- [x] 06-02: Slim lib/provider.js — move existsAnywhere/detectProvider to detect.js, rewire resolveSkill, re-export for back-compat
- [x] 06-03: test/unit-detect.js — 6 host fixtures, ~40 assertions covering expandRoot + detection + legacy back-compat

### Phase 7: cp doctor rewrite

Plans:
- [x] 07-01: Rewrite cmdDoctor in bin/cp.js — sectioned output (harnesses → providers → configured → roles), --json and --quiet flags
- [x] 07-02: test/dryrun-doctor.js — ~25 assertions covering sectioned output, --json shape, --quiet, exit codes

### Phase 8: Auto-heal merge + cp config refresh

Plans:
- [x] 08-01: lib/merge.js with mergeCpDefaults + loadConfig auto-write + cp config refresh command
- [x] 08-02: test/unit-merge.js + test/dryrun-config-refresh.js — ~75 assertions covering merge rules + brownfield fixtures

### Phase 9: Echo-provider stub + installer

Plans:
- [x] 09-01: echo-provider installer (cp install echo-provider --local) + SKILL.md stub
- [x] 09-02: End-to-end verification: install echo-provider, switch workflow_provider, cp doctor shows all roles → echo

### Phase 10: Migration docs + CHANGELOG

Plans:
- [x] 10-01: docs/MIGRATION-v0.5.md + CHANGELOG v0.5.0 + README badge update + version bump to 0.5.0

</details>

### Phase 11: Command decomposition

Plans:
- [x] 11-01: TBD
- [x] 11-02: TBD
- [x] 11-03: TBD

### Phase 12: Dual-binary cplan + cp alias

Plans:
- [x] 12-01: TBD
- [x] 12-02: TBD

### Phase 13: GitHub Actions CI

Plans:
- [x] 13-01: TBD
- [x] 13-02: TBD

### Phase 14: Coverage with c8

Plans:
- [x] 14-01: TBD
- [x] 14-02: TBD

### Phase 15: Docs + v0.6.0 release

Plans:
- [x] 15-01: TBD

</details>

### Phase 16: design capture infrastructure

Plans:
- [x] 16-01: TBD
- [x] 16-02: TBD
- [x] 16-03: TBD

</details>

### Phase 17: SHA pinning foundation

Plans:
- [x] 17-01: TBD
- [x] 17-02: TBD

### Phase 18: Auto key-files at write-time

Plans:
- [x] 18-01: TBD
- [x] 18-02: TBD

### Phase 19: File-existence hard-block

Plans:
- [x] 19-01: TBD

### Phase 20: Derived STATE.md

Plans:
- [x] 20-01: TBD
- [x] 20-02: TBD

### Phase 21: Plan-time expected-key-files

Plans:
- [x] 21-01: TBD
- [x] 21-02: TBD

### Phase 22: scaffold-phase prior-summary check

Plans:
- [x] 22-01: TBD

### Phase 23: complete-milestone audit gate

Plans:
- [x] 23-01: TBD

### Phase 24: cplan audit detection

Plans:
- [x] 24-01: TBD
- [x] 24-02: TBD
- [x] 24-03: TBD

### Phase 25: cplan audit --fix loop

Plans:
- [x] 25-01: TBD
- [x] 25-02: TBD

### Phase 26: Repair commands

Plans:
- [x] 26-01: TBD
- [x] 26-02: TBD
- [x] 26-03: TBD

### Phase 27: Pre-commit hook smart shim

Plans:
- [x] 27-01: TBD
- [x] 27-02: TBD

### Phase 28: Post-commit hook tick auto

Plans:
- [x] 28-01: TBD

### Phase 29: CI template + backfill

Plans:
- [x] 29-01: TBD
- [x] 29-02: TBD

### Phase 30: Agent literacy injection

Plans:
- [x] 30-01: TBD
- [x] 30-02: TBD

### Phase 31: Docs + v0.8.0 release

Plans:
- [x] 31-01: TBD
- [x] 31-02: TBD

</details>

### Phase 32: map-codebase auto-init

Plans:
- [x] 32-01: TBD

### Phase 33: cp update command

Plans:
- [x] 33-01: TBD
- [x] 33-02: TBD

### Phase 34: README onboarding decision matrix

Plans:
- [x] 34-01: TBD

### Phase 35: DESIGN.md lifecycle polish

Plans:
- [x] 35-01: TBD

</details>

<details>
<summary>✅ v0.10 Autonomy (Phases 36-38) — SHIPPED 2026-05-21</summary>

### Phase 36: cp autonomous CLI + lib helper

Plans:
- [x] 36-01: TBD

### Phase 37: /cp-autonomous slash skill

Plans:
- [x] 37-01: TBD

### Phase 38: Docs + v0.10.0 release

Plans:
- [x] 38-01: TBD

</details>

<details>
<summary>✅ v0.10.1 Collapse-aware milestone close (Phases 39-39) — SHIPPED 2026-05-22</summary>

### Phase 39: collapse-aware-complete-milestone

Plans:
- [x] 39-01: TBD

</details>

<details>
<summary>✅ v1.0 Workflow Engine (Phases 40-42) — SHIPPED 2026-05-25</summary>

### Phase 40: Core engine + custom tier

Plans:
- [x] 40-01: TBD
- [x] 40-02: TBD
- [x] 40-03: TBD

### Phase 41: CLI surface + built-in templates + AI authoring

Plans:
- [x] 41-01: TBD
- [x] 41-02: TBD
- [x] 41-03: TBD

### Phase 42: Docs + v1.0.0 release

Plans:
- [x] 42-01: TBD

</details>

<details>
<summary>✅ v1.1 Workflow Skills (Phases 43-48) — SHIPPED 2026-05-25</summary>

### Phase 43: Consumer skills: cp-workflow-run, cp-workflow-list, cp-workflow-resume

Plans:
- [x] 43-01: `commands/cp/workflow-run.md` — generic workflow driver skill (argv parse, doctor role resolution, `cp run`, wave loop, smart-gate stop, final report)
- [x] 43-02: `commands/cp/workflow-list.md` — discoverability skill (list mode via `cp workflow ls --json`, show mode via `cp workflow show <name>`)
- [x] 43-03: `commands/cp/workflow-resume.md` — resume/retry/abandon skill (enumeration, resume, --retry, --abandon modes; delegates wave-loop to cp-workflow-run)
- [x] 43-04: Tests — extend `test/unit-installers.js` (+6 assertions) and add `test/integration-workflow-skills.js` (~15 assertions) wired into `package.json` `test` chain

### Phase 44: Creator skills: cp-workflow-new, cp-workflow-customize (+ cp workflow export)

Plans:
- [x] 44-01: `cp workflow export <name>` CLI command — thin convenience over `cp workflow show` with default destination + `--as <new-name>` rename. Unit tests.
- [x] 44-02: `commands/cp/workflow-new.md` skill — drives `cp workflow new --from <built-in>` for "I want a fresh blank template" path.
- [x] 44-03: `commands/cp/workflow-customize.md` skill — drives the export → edit → import round-trip in one skill (replaces previously-planned cp-workflow-import skill).
- [x] 44-04: Tests — installer auto-pickup for both new skills + integration test exercising export → import round-trip end-to-end.

### Phase 46: Docs + MIGRATION-v1.1.md + v1.1.0 release

Plans:
- [x] 46-01: README.md + docs/ updates — document 5 new `cp-workflow-*` agent skills and new `cp workflow export` CLI subcommand.
- [x] 46-02: MIGRATION-v1.1.md (new file) + CHANGELOG.md v1.1.0 entry — explain v1.0 → v1.1 delta, what's new, what's deferred, discovery path for new skills.
- [x] 46-03: Version bump to 1.1.0, full `npm test` green, `git tag v1.1.0`, `npm publish`. **Paused** during execution to expand v1.1 scope — see Phase 47. Resumes after Phase 47 + docs refresh in Phase 48.

### Phase 47: Complete CLI-verb-to-agent-skill coverage + `cp workflow inspect`

Closes the remaining gap from v1.1's "every write-side workflow CLI verb has a slash skill" goal: standalone agent skills for the 6 read-side/utility verbs (import, export, validate, show, diagram, brainstorm) plus a new `cp workflow inspect` CLI that shows the template YAML alongside the deduced wave order, with its own `/cp-workflow-inspect` agent skill.

Plans:
- [x] 47-01: `cp workflow inspect <name> [--json]` CLI subcommand — combines `show` output with computed wave-by-wave decomposition from `lib/workflow.js#computeWaves`; dryrun-cli tests.
- [x] 47-02: 7 new agent skills under `commands/cp/`: workflow-import, workflow-export, workflow-validate, workflow-show, workflow-diagram, workflow-brainstorm, workflow-inspect; installer + integration tests extended.
- [x] 47-03: README + MIGRATION-v1.1.md + CHANGELOG amendments documenting the expanded surface (12 total `cp-workflow-*` skills, 2 new CLI verbs).

### Phase 48: Resume v1.1.0 release (re-tag, publish, push)

Plans:
- [x] 48-01: Re-run full `npm test`, re-create `git tag v1.1.0`, `npm publish` (handle OTP interactively), `git push origin main && git push origin v1.1.0`.

</details>

### 🚧 v1.2 Unified Phase Model (In Progress)

### Phase 49: Foundations + tier files + persist primitives

Plans:
- [x] 49-01: `lib/types.js` — define the `Phase` JSDoc typedef + `validatePhase(obj)` runtime check; ship `test/unit-types.js` (~20 assertions).
- [x] 49-02: `lib/milestone.js` — `readPhases(roadmapMd)` returning `Phase[]` for all ROADMAP shapes + milestone-tier DESIGN.md/STATE.md scaffolding; ship `test/unit-milestone-reader.js` (~30 assertions).
- [x] 49-03: `lib/workflow.js` — `phasesFromTemplate(template)` returning unified `Phase[]` with `parent`/`after`/`persist`/`max_children` fields; parity against built-in templates (~25 assertions).
- [x] 49-04: `lib/persist.js` — fold-into-DESIGN.md helper + section dedupe; rename `persist_output:` → `persist:` (default `false`) with deprecation-warning alias; ship `test/unit-persist.js` (~20 assertions).

### Phase 50: Fan-out runtime (parent: field, sibling pairing, max_children, 1-level limit)

Plans:
- [x] 50-01: Workflow YAML schema extension — `parent:`, child-level `after:`, `max_children:` (default 20), `min_children:` (default 1); validation rules (parent must exist, no grandchildren, max ≥ min).
- [x] 50-02: `lib/fanout.js` — expand child phases over parent's structured list output; pairwise sibling dep resolver; subtree-wait semantics for top-level deps on a parent.
- [x] 50-03: Runtime agent contract — list-output prompt shaping ("produce up to N items"); enforce count ≤ max_children (error if exceeded); enforce count ≥ min_children.
- [x] 50-04: Integration tests against a new built-in `dev-v2` template using fan-out (~25 assertions).

### Phase 51: CLI shims + deprecate cp-plan-phase

Plans:
- [x] 51-01: Refactor `bin/commands/autonomous.js` — for each pending milestone-phase, call `cp run <workflow>`; drop cp-plan-phase invocations.
- [ ] 51-02: Refactor `bin/commands/quick.js` — scaffold `quick/<slug>/{DESIGN.md, STATE.md}`; remove quick-PLAN.md path; update cp-quick skill.
- [ ] 51-03: Collapse `.planning/custom/` into `.planning/quick/`; alias `binds_to: custom` → quick; read-only back-compat for both old roots with deprecation warning.
- [ ] 51-04: Deprecate `cp-plan-phase` skill (one-line nudge to `cp run dev` or configured workflow); audit and update other cp-* skills that referenced it as a prereq.
- [ ] 51-05: Smart-gate + scope/argv parity tests for both autonomous and quick (~50 assertions).

### Phase 52: Docs + MIGRATION-v1.2.md + v1.2.0 release

Plans:
- [ ] 52-01: MIGRATION-v1.2.md — persist rename, custom→quick collapse, cp-plan-phase removal, parent:/after:/max_children: schema, fold-into-DESIGN behavior.
- [ ] 52-02: CHANGELOG.md + README.md updates (workflow YAML examples with new schema; new tier-file storage diagram; updated CLI table).
- [ ] 52-03: Bump package.json to 1.2.0; commit; tag v1.2.0; publish to npm.

## Progress

**Execution Order:**
Phases execute in numeric order (decimal phases like 2.1 are urgent inserts between integers).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| *(none yet — run `cp scaffold-phase 1 --name <name> --plans <count>`)* | | | | |

