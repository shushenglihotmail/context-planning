# MILESTONE-CONTEXT — v0.8 Consistency (brainstorm transcript)

Captured: 2026-05-21
Status: ACTIVE (will be promoted into `.planning/milestones/v0-8-consistency/DESIGN.md`
as "Brainstorm transcript" appendix at `cp complete-milestone`, then deleted.)

---

## Origin

User question: *"what does the best way to make sure project codes be
consistence with project cp state?"*

User clarified:
- Don't care about "phase X complete but no tests added" gating.
- Concerned specifically about **inconsistency between what plan/state doc
  claims and what code implements**.
- Wants both **detection** and **fix** capabilities.

User then escalated:
- *"Add audit command is good to detect. But how do we fix drift, how do we
  prevent drift?"*

After laying out the prevent/detect/repair layered model:
- *"I want full consistency coverage, prevent, detect, repair. is a better?"*

→ Confirmed full milestone scope. Launched `/cp-new-milestone` skill.

---

## Pre-brainstorm classification — 6 drift causes

| # | Type | Example |
|---|---|---|
| 1 | Forgetful executor | PLAN says lib/foo.js created; SUMMARY's key-files omits it |
| 2 | Stale STATE | STATE.md says Phase 11 but ROADMAP shows Phase 16 done |
| 3 | Manual file ops outside cp | User edits .planning/PROJECT.md directly without committing/ticking |
| 4 | Plan-execute mismatch | PLAN says implement X in foo.js; SUMMARY says implemented X in bar.js with no deviation note |
| 5 | Cross-phase contamination | Phase 11 SUMMARY claims a file created in Phase 12 |
| 6 | Skipped commands | scaffold-phase 13 without write-summary 12 |
| (later added) 7 | Close-time lies | complete-milestone accepts collapse despite deleted key-files |
| (later added) 8 | Agent unscoped changes | AI agent edits files without wrapping in cp scaffold-phase/write-summary |
| (later added) 9 | Post-commit forgetfulness | User git-commits directly; SUMMARY never updated |

---

## Pre-brainstorm mechanism catalog (12 mechanisms)

| ID | Mechanism | Layer | Tier |
|---|---|---|---|
| P1 | SHA pinning (`base-commit`/`end-commit` frontmatter) | Prevent | 1 |
| P2 | Auto key-files at write-time | Prevent | 1 |
| P3 | File-existence hard-block | Prevent | 1 |
| P4 | Derived STATE.md | Prevent | 1 |
| P5 | Plan-time expected-key-files | Prevent | 2 |
| P6 | scaffold-phase prior-summary check | Prevent | 2 |
| P7 | complete-milestone audit gate | Prevent | 2 |
| P8 | `cplan audit` detection | Detect | 3 |
| P9 | `cplan audit --fix` (GSD-mimic loop) | Repair | 3 |
| P10 | 4 repair commands (reconcile/scaffold --continue/supersede/deviate) | Repair | 3 |
| P11 | Agent literacy injection (CP_BLOCK extension) | Prevent | 3 |
| P12 | Git hooks (pre-commit + post-commit smart shim) | Prevent | 3 |

---

## Brainstorm Q&A

### Q1 — Backward compatibility for SHA pinning

**Q:** SHA pinning (P1) is the foundation. How should we handle existing
phases without `base-commit`/`end-commit` in their frontmatter?

**Options presented:**
- (a) Forward-only — pre-v0.8 phases stay un-pinned; audit only checks new phases.
- (b) Auto-backfill on first audit run — `cplan audit` infers SHAs from `git log`.
- (c) Migration command — explicit `cplan migrate --infer-shas`.
- (d) Hybrid: forward-only by default + opt-in backfill.

**User chose:** (d) HYBRID.

**Refinement:** Backfill should be **scopable** (per-milestone or per-phase)
not all-or-nothing. Should have two modes:
- `--mode best-effort` (default) — uses `git log --before=<SUMMARY-mtime>` timestamps
- `--mode accurate` — parses commit messages for `cp(NN-MM):` prefix convention

**Resolved:** `cplan reconcile --infer-shas [--milestone <id>|--phase <N>|--all]`
with `--mode best-effort|accurate`.

---

### Q2 — Auto key-files UX (P2)

**Q:** When `cp write-summary` auto-fills `key-files` from
`git diff base..end --name-only`, what's the default behavior?

**Options presented:**
- (a) Always silent fill, opt-out with `--no-auto-key-files`.
- (b) Always prompt user to confirm proposed list.
- (c) Silent fill but emit a one-line notice.
- (d) Two flags: `--auto-key-files` (silent fill, default) + `--no-auto-key-files`.

**User chose:** (d) TWO FLAGS.

**Refinement added:** one-line stdout notice on auto-fill (so user knows it
happened without confirmation prompt).

**Resolved:** Default silent fill, `--no-auto-key-files` to opt out, one-line
"✓ key-files auto-filled (N files)" notice on stdout.

---

### Q3 — `audit --fix` UX

**Q:** What's the UX of `cplan audit --fix`?

User said: *"mimic GSD."*

**Action taken:** Read `~/.copilot/get-shit-done/workflows/audit-fix.md`,
adapted the 6-step pattern:

1. **parse-args** — `--max N` (default 5), `--severity high|medium|all`,
   `--dry-run`, `--interactive`.
2. **run-audit** — invoke `cplan audit` to produce findings.
3. **classify** — each finding tagged auto-fixable / manual-only / skip.
   - Auto-fixable signals: specific file ref, single-file change,
     forgotten-file, phantom-file with clear delete/add resolution.
   - Manual-only signals: ambiguous, design-change required, multi-file
     refactor, "consider" / "evaluate" language.
   - **When uncertain, classify as manual-only** (strict default, per GSD).
4. **present** — show classification table; require confirmation unless
   `--dry-run` or `--yes`.
5. **fix-loop** — for each auto-fixable up to `--max`:
   a. Spawn fix (invokes appropriate repair command per outcome).
   b. Run tests (`npm test` or configured).
   c. On pass → atomic commit `cp(NN-MM): {finding-id} {one-liner}`.
   d. On fail → revert commit, STOP loop, report.
6. **report** — fixed N of M, skipped K, failed at finding-ID (if any).

**Outcome mapping (the 4-outcome decision tree):**
- **A. Doc was wrong** → invoke `cplan reconcile <phase>` internally.
- **B. Work incomplete** → emit manual instruction
  "run `cplan scaffold-phase --continue`".
- **C. Decision changed** → emit manual instruction
  "run `cplan supersede <phase>`".
- **D. Intentional drift** → emit manual instruction
  "run `cplan deviate <phase>`".

Outcomes B/C/D are NEVER auto-fixed — they require human judgment.

---

### Q4 — v0.8 scope tier

**Q:** All 3 tiers in one milestone (12+ phases) vs split across multiple?

**User chose:** ALL 3 TIERS in v0.8.

Initial estimate: 12 phases. Grew to 15 after P11+P12 additions.

---

### Q5 — Agent strictness on unscoped requests (P11)

**Q:** When user makes an unscoped code-change request to the agent
(e.g. "fix this bug in lib/foo.js"), how should the agent behave?

**Options presented:**
1. Always suggest cp wrapper, never refuse.
2. Refuse if change-scope > N files; suggest cp wrapper.
3. Refuse for any code change in a cp project; require explicit cp scaffold-phase.

**User chose:** (1) — ALWAYS SUGGEST, NEVER REFUSE.

**Rationale:** User-hostile to refuse; hooks (P12) are the safety net.

---

### Q6 — Agent literacy install scope (P11)

**Q:** Where should the extended agent literacy block be installed?

**Options presented:**
1. Project-only by default, `--global` (or `--user`) flag for user-level.
2. Both project + user every time.
3. User-level only.

**User chose:** (1) — PROJECT-ONLY DEFAULT, `--user` opt-in.

**Refinement:** Add more principles about preventing the user from making
code changes outside cp wrapper. (Reflected in 8-rule agent state machine
in DESIGN.md Components / Phase 30.)

---

### Q7 — Hooks placement in monorepo

**User raised:** *"Suppose a repo has multiple projects. At repo root, I say
cp install copilot, will it install at .git folder? So all projects in this
repo will have it?"*

**Discovery:** `lib/paths.js::repoRoot()` walks up looking for `.git` OR
`.planning/` — first match wins. So per-cp-project for harness files & agent
block is already correct. But `.git/hooks/` is repo-level.

**Options presented:**
1. Smart shim at git root — one install per repo; shim discovers affected
   cp projects per commit and runs `cplan audit --staged` per project.
2. Refuse to install hooks in monorepo until user picks a project.
3. Install per-project hooks via husky/lefthook-style wrappers.

**User chose:** (1) — SMART SHIM AT GIT ROOT.

**Implementation plan (Phase 27):**
- New `bin/cp-hook.js` cross-platform Node shim.
- `.git/hooks/pre-commit` and `post-commit` both invoke this shim.
- Shim: `git diff --cached --name-only` (pre) or `git diff HEAD~1 HEAD --name-only` (post);
  per file, walk up to nearest `.planning/`; dedupe; run per affected cp project.
- Zero-overhead in single-cp-project repos.
- Silent exit 0 if no cp project touched.

---

## Recommended-defaults table (presented + approved as Section 3 in proposal)

| Default | Recommendation | Rationale |
|---|---|---|
| `audit --fix --max N` | 5 | GSD default; conservative |
| `complete-milestone` audit | block on HIGH, warn on MEDIUM/LOW | Strictest where it matters |
| `reconcile` is | standalone command, also internal | Composable |
| Agent literacy | always on after `cp install`, no flag | It IS the install |
| Post-commit `tick --auto` | silent on no-op, one-line on update | Don't spam every commit |
| Hooks scope | opt-in `--hooks` flag | Don't surprise v0.7 users |

User approved all 6 defaults in Section 3 sign-off.

---

## Section approvals (final proposal walkthrough, 2026-05-21)

| Section | Verdict |
|---|---|
| 1 — Goal & three-layer strategy | APPROVED |
| 2 — 12 mechanisms across 15 phases | APPROVED |
| 3 — Install model + monorepo + defaults | APPROVED ("write the design doc now") |

---

## Phase breakdown (final)

```
17 SHA pinning foundation                                    [Tier 1]
18 Auto key-files at write-time                              [Tier 1]
19 File-existence hard-block                                 [Tier 1]
20 Derived STATE.md                                          [Tier 1]
21 Plan-time expected-key-files                              [Tier 2]
22 scaffold-phase prior-summary check                        [Tier 2]
23 complete-milestone audit gate                             [Tier 2]
24 cplan audit detection                                     [Tier 3]
25 cplan audit --fix loop (GSD-mimic)                        [Tier 3]
26 Repair commands (reconcile/supersede/deviate/--continue)  [Tier 3]
27 Pre-commit hook (cplan audit --staged) — smart shim       [Tier 3]
28 Post-commit hook (cplan tick --auto)                      [Tier 3]
29 CI template + backfill helper (reconcile --infer-shas)    [Tier 3]
30 Agent literacy injection (8-rule state machine)           [Tier 3]
31 Docs (drift-playbook.md) + CHANGELOG + v0.8.0 release
```

Total: 15 phases, ~2200 LOC, ~270 new test assertions (750 → ~1020).
