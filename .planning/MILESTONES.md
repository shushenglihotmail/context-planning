# Project Milestones: context-planning

<!-- Entries in reverse chronological order — newest first.
     Append a block via /cp-complete-milestone. -->

<!-- Template per milestone:

## v[X.Y] [Name] (Shipped: YYYY-MM-DD)

**Delivered:** [One sentence describing what shipped]

**Phases completed:** [X-Y] ([Z] plans total)

**Key accomplishments:**
- [Major achievement 1]
- [Major achievement 2]
- [Major achievement 3]

**Stats:**
- [X] files created/modified
- [Y] lines of code (primary language)
- [Z] phases, [N] plans

**Git range:** `feat(XX-XX)` → `feat(YY-YY)`

**What's next:** [Brief description of next milestone goals]

---
-->

## v0.4 — Polish & Capture  — shipped 2026-05-20

**Phases:** 1-5    **Plans:** 13    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`

## v0.5 — Generic provider/harness detection  — shipped 2026-05-20

**Phases:** 1-10    **Plans:** 23    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`

## v0.6 Quality Wave  — shipped 2026-05-20

**Phases:** 1-15    **Plans:** 33    **Duration:** —

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`
- Phase 11: Command decomposition — see `.planning/phases/11-command-decomposition/`
- Phase 12: Dual-binary cplan + cp alias — see `.planning/phases/12-dual-binary-cplan-cp-alias/`
- Phase 13: GitHub Actions CI — see `.planning/phases/13-github-actions-ci/`
- Phase 14: Coverage with c8 — see `.planning/phases/14-coverage-with-c8/`
- Phase 15: Docs + v0.6.0 release — see `.planning/phases/15-docs-v0-6-0-release/`

## v0.7 Design Capture  — shipped 2026-05-20

**Phases:** 1-16    **Plans:** 36    **Duration:** —

**Subsystems touched:** design

**Key decisions:**
- Inbox writes stay as pure file-IO helpers that return action lists so higher-level commands can apply atomic changes safely.  _(phase 1)_
- cp capture and cp inbox use timestamped inbox entries plus scoped path-based commits so triage stays audit-friendly.  _(phase 1)_
- The slash flow and seeded INBOX template share a fixed destination vocabulary so human and CLI triage follow the same routing model.  _(phase 1)_
- The statusline stays silent outside cp projects while exposing tokenized text and JSON output inside a planning repo.  _(phase 2)_
- ANSI styling is gated on TTY and NO_COLOR so the statusline remains safe for prompts, logs, and tests.  _(phase 2)_
- Codebase mapping always scaffolds the same seven docs and distinguishes stub versus filled files with a heuristic check.  _(phase 1.5)_
- Codebase mapping ships through dedicated scaffold-codebase and codebase-status CLIs with an explicit force flag for clobbering.  _(phase 1.5)_
- cp map-codebase fans out to four specialized sub-agents that write docs directly to keep orchestrator context small.  _(phase 1.5)_
- The Cursor installer synthesizes rule files and an ambient alwaysApply context file instead of shipping static copies.  _(phase 3)_
- The Aider installer writes one shared CP-CONTEXT briefing plus per-command files and patches config read blocks automatically.  _(phase 3)_
- Worktrees live as sibling directories tracked in WORKTREES.md with cp-slug branch defaults and optional provider integration.  _(phase 4)_
- Aider config edits switched from regex block replacement to YAML parse-stringify so existing read entries survive migration.  _(phase 5)_
- All worktree shell-outs moved into lib helpers so bin handlers stay as thin dispatch layers.  _(phase 5)_
- Provider detection moved to a v2 harness schema with plugin shape metadata and a centralized lib-detect implementation.  _(phase 6)_
- lib provider resolution now delegates to detect.js while keeping back-compat exports intact.  _(phase 6)_
- Claude detection uses flat plugin_roots semantics and the new detect behavior is locked down with dedicated unit coverage.  _(phase 6)_
- cp doctor became a sectioned diagnostic with JSON and quiet modes instead of a single free-form report.  _(phase 7)_
- Doctor output contracts are enforced with dedicated dry-run coverage for human output, JSON, quiet mode, and exit codes.  _(phase 7)_
- Config loading now auto-heals brownfield defaults through mergeCpDefaults and exposes a manual cp config refresh escape hatch.  _(phase 8)_
- Merge behavior is pinned down with brownfield, idempotency, and dry-run tests before config refresh writes user files.  _(phase 8)_
- The echo-provider installs as a sentinel-backed stub under .planning providers so schema paths can be tested without real integrations.  _(phase 9)_
- Provider-schema generality was proven by switching workflow_provider to echo-provider and verifying all nine roles end to end.  _(phase 9)_
- The v0.5.0 release ships with a paired changelog and migration guide so schema changes are documented alongside the version bump.  _(phase 10)_
- The first extraction wave moved core handlers into bin commands modules behind registry-first dispatch while preserving legacy fall-through.  _(phase 11)_
- Command decomposition continued until every remaining CLI action had its own dedicated handler module in the registry.  _(phase 11)_
- bin cp became a thin dispatcher while keeping public exports stable for tests and external require callers.  _(phase 11)_
- The package bin map now ships both cplan and cp so Windows users can avoid PowerShell conflicts without losing the old name.  _(phase 12)_
- Docs, help text, and doctor output treat cplan as the canonical name while preserving cp as a supported alias.  _(phase 12)_
- CI runs a cross-platform GitHub Actions matrix on Ubuntu and Windows across Node 20 and 22 to catch environment-specific regressions.  _(phase 13)_
- Windows path handling normalizes real paths so worktree and statusline checks survive short-path behavior on GitHub runners.  _(phase 13)_
- c8 became the single coverage tool with enforced 85 line and 75 branch thresholds wired into npm scripts.  _(phase 14)_
- Coverage enforcement runs as a dedicated CI job after the test matrix and publishes the report as an artifact.  _(phase 14)_
- The v0.6.0 release was cut as one coordinated changelog, version bump, git tag, and GitHub release update.  _(phase 15)_
- Union ADR + SP-brainstorm template (single file, both tiers, tier-key substitution)  _(phase 16)_
- scaffoldPhase emits 3 actions: ROADMAP + PLAN + DESIGN  _(phase 16)_
- scaffoldMilestone creates milestones/<slug>/DESIGN.md  _(phase 16)_
- aggregateSummaries adds phaseDesignRefs[] deduped per phase  _(phase 16)_
- MILESTONE-CONTEXT.md promoted to milestone DESIGN.md atomically at complete-milestone, then deleted  _(phase 16)_
- Append-only REVIEW-LOG.md with marker anchor  _(phase 16)_
- scaffoldPhase emits 4th action (REVIEW-LOG.md)  _(phase 16)_
- Regex /^##\s+\d{4}-\d{2}-\d{2}/gm counts entries  _(phase 16)_
- cp-execute-phase Step 4.5 instructs orchestrator (skill-level, no upstream SP code changes)  _(phase 16)_
- writeSummary throws ValidationError (name+code) on empty key-decisions  _(phase 16)_
- Exact error message includes Unicode greater-or-equal so users can grep  _(phase 16)_
- CLI exit code 2 for input-validation (distinct from 1 for runtime errors)  _(phase 16)_
- Backfilled 33 existing SUMMARYs to satisfy new constraint  _(phase 16)_

**Phase summaries:**
- Phase 1: cp-capture command — see `.planning/phases/01-cp-capture-command/`
- Phase 2: Status-line hook — see `.planning/phases/02-status-line-hook/`
- Phase 1.5: Map codebase — see `.planning/phases/1.5-map-codebase/`
- Phase 3: Cursor + Aider installers — see `.planning/phases/03-cursor-aider-installers/`
- Phase 4: git worktree integration — see `.planning/phases/04-git-worktree-integration/`
- Phase 5: Dogfood hotfix — see `.planning/phases/05-dogfood-hotfix/`
- Phase 6: Schema + detection core — see `.planning/phases/06-schema-detection-core/`
- Phase 7: cp doctor rewrite — see `.planning/phases/07-cp-doctor-rewrite/`
- Phase 8: Auto-heal merge + cp config refresh — see `.planning/phases/08-auto-heal-merge-cp-config-refresh/`
- Phase 9: Echo-provider stub + installer — see `.planning/phases/09-echo-provider-stub-installer/`
- Phase 10: Migration docs + CHANGELOG — see `.planning/phases/10-migration-docs-changelog/`
- Phase 11: Command decomposition — see `.planning/phases/11-command-decomposition/`
- Phase 12: Dual-binary cplan + cp alias — see `.planning/phases/12-dual-binary-cplan-cp-alias/`
- Phase 13: GitHub Actions CI — see `.planning/phases/13-github-actions-ci/`
- Phase 14: Coverage with c8 — see `.planning/phases/14-coverage-with-c8/`
- Phase 15: Docs + v0.6.0 release — see `.planning/phases/15-docs-v0-6-0-release/`
- Phase 16: design capture infrastructure — see `.planning/phases/16-design-capture-infrastructure/`
