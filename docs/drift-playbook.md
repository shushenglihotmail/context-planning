# Drift defense playbook (v0.8)

> *"How do I keep what the .planning/ docs claim in sync with what my
> codebase actually does?"*

`cp` v0.8 ships a complete drift-defense stack so the answer is:
**prevent → detect → repair**, in that order. Each layer is opt-in
and composable.

---

## Why drift happens

`cp`'s state docs (`PROJECT.md`, `ROADMAP.md`, `STATE.md`, per-phase
`PLAN.md` / `SUMMARY.md`) are written by humans (or AI agents) and live
alongside source code that may diverge for any of these reasons:

- A plan ticked but no summary written ("forgot the `cp write-summary`").
- A summary written but ROADMAP checkbox never ticked.
- Plan `expected-key-files` lists files the implementation never touched.
- A pre-v0.8 phase has no `base-commit` / `end-commit` SHA in its YAML
  frontmatter (these fields are new in v0.7+).
- A milestone got rescoped mid-flight and a plan was silently dropped
  instead of being marked superseded.
- `STATE.md`'s "current focus" line is stale because the user moved on
  without running `cp progress`.

Without defense, all of these are *invisible* — the docs look fine,
the code looks fine, but they tell different stories.

---

## Layer 1 — Detect: `cp audit`

`cp audit` is the entry point. It runs 9 consistency checks and reports
findings ranked by severity (LOW / MEDIUM / HIGH).

```bash
cp audit                 # human-readable, all severities
cp audit --severity high # only blockers; use this in CI
cp audit --json          # for tools / dashboards
```

### The 9 checks

| Check id | Severity | What it catches |
|---|---|---|
| `state-stale` | LOW | `STATE.md` doesn't match latest ticked plan |
| `summary-without-tick` | LOW | SUMMARY.md exists but ROADMAP checkbox unticked |
| `ticked-without-summary` | **HIGH** | Plan ticked but no SUMMARY.md written |
| `missing-base-commit` | MEDIUM | PLAN.md frontmatter lacks `base-commit` |
| `missing-end-commit` | MEDIUM | SUMMARY.md frontmatter lacks `end-commit` |
| `invalid-base-commit` | MEDIUM | `base-commit` SHA not in git history |
| `expected-vs-actual-drift` | MEDIUM | PLAN's `expected-key-files` ≠ SUMMARY's actual files |
| `phase-without-design` | LOW | Phase dir lacks DESIGN.md (v0.7+ convention) |
| `roadmap-orphan-phase` | MEDIUM | Phase dir on disk has no ROADMAP entry |

### When to run

- **Before shipping** — `cp audit --severity high` in your release script.
- **After long execution sessions** — drift accumulates over hours of
  agent work; audit at session-end is cheap insurance.
- **At project handoff** — onboarding a new contributor; clean audit
  proves the docs are trustworthy.
- **When suspicious** — anytime you ask yourself "is this still
  accurate?", run audit.

---

## Layer 2 — Repair: the verb family

Each finding maps to a repair verb. Use `cp audit --fix` for the safe
auto-fixers; reach for the manual verbs for the rest.

### Auto-fix (safe)

```bash
cp audit --fix
```

Handles four finding classes via atomic commits:

- `state-stale` → regenerates `STATE.md` from ROADMAP + last commit.
- `summary-without-tick` → ticks the ROADMAP checkbox.
- `missing-base-commit` → backfills via `git log -n 1 -- <plan-files>`.
- `missing-end-commit` → backfills via `git log -n 1 -- <summary-files>`.

Each fix is its own commit (subject: `cp(audit-fix): <finding-id> ...`),
so you can review the diff and `git revert` granularly if needed.

### Manual repair (intentional)

#### `cp reconcile <phase> --infer-shas`

Single-phase SHA backfill. Use when audit shows
`missing-base-commit` / `missing-end-commit` / `invalid-base-commit`
for one phase and you want to inspect the inferred SHAs before
committing:

```bash
cp reconcile 5 --infer-shas --dry-run   # preview
cp reconcile 5 --infer-shas             # commit per op
cp reconcile 5 --infer-shas --no-commit # all at once, then commit manually
```

#### `cp reconcile --all --infer-shas`

Bulk SHA backfill for every phase in the project. Use **once** when
upgrading a pre-v0.7 project to v0.8:

```bash
cp reconcile --all --infer-shas --no-commit
git add -A && git commit -m "cp: backfill v0.8 SHAs"
```

For pre-v0.8 projects where `.planning/` was committed en-masse, the
inferer correctly reports the bulk-import commit as the file's first
appearance — semantically not "when the plan was developed" but
*accurately* the file's git history. The collision pattern is
self-documenting.

#### `cp reconcile <phase> --accept` ⚠ destructive

Rewrites the plan's `expected-key-files` to match the SUMMARY's actual
key-files. **This means the plan now matches the code, not the other
way around.** Use ONLY when the plan's intent CHANGED and the actual
implementation is now correct:

```bash
# Safe: preview first
cp reconcile 5 --accept --dry-run
# Then commit if you really mean it
cp reconcile 5 --accept
```

If the right answer is instead "the code is wrong, the plan stands",
do NOT use `--accept`. Fix the code and ship a follow-up SUMMARY.

#### `cp supersede <planId> --by <newPlanId> --reason "..."`

Mark a plan as `[~]` (superseded) when its scope moved to a different
plan. Preferred over silently re-doing the work in a new plan — it
leaves an auditable trail of *why* the old plan was abandoned:

```bash
cp supersede 03-02 --by 04-01 --reason "rescoped from auth-only to auth+session"
```

#### `cp deviate <phaseNum> --summary "..." --reason "..."`

Record a one-off deviation when implementation diverged but the plan
itself still stands (e.g. you discovered a better library mid-implement
and used it instead of the one PLAN.md specified):

```bash
cp deviate 5 --summary "used redis instead of memcached" --reason "redis already in stack"
```

This appends to a `DEVIATIONS.md` log in the phase dir, *not* to
`SUMMARY.md` — it's a side-channel that auditors can read.

#### `cp scaffold-phase N --continue`

For when a phase has incomplete work that needs to carry forward into
phase `N+1` (instead of being marked failed). Skips the prior-summary
gate AND stamps a `Continues from: phase N-1` note in the new PLAN.md
for traceability.

---

## Layer 3 — Prevent: hooks & CI

Once your repo is clean (audit reports zero HIGH findings), turn on
prevention so it stays that way.

### `cp install --hooks`

Installs a *smart-shim* pre-commit + post-commit pair under
`.git/hooks/`. The shim:

1. Walks up for `.planning/STATE.md` markers (so monorepos with
   multiple cp projects work).
2. Dispatches per project according to its
   `.planning/config.json` → `cp.behavior.pre_commit` setting:
   - `off` — no gate (the shim is installed but no-ops)
   - `audit-high` (default) — block commit if `cp audit --severity high` fails
   - `audit-any` — block commit on ANY finding

```bash
cp install --hooks         # install (refuses if user-owned hook exists)
cp install --hooks --force # clobber user-owned hooks
cp install --uninstall-hooks
```

#### `behavior.post_commit: tick-auto` (advanced)

Opt-in: after each commit, if the subject matches
`cp(NN-MM[-slug]): ...` AND the commit touched ALL of plan `NN-MM`'s
`expected-key-files`, the hook auto-ticks the plan and amends a
trailing `cp: tick plan NN-MM` commit. Off by default — it subtly
mutates history. To enable:

```bash
cp config set behavior.post_commit tick-auto
```

### `cp install --ci`

Installs `.github/workflows/cp-audit.yml` that runs
`cp audit --severity high` on every PR. Fetches full git history
(`fetch-depth: 0`) so SHA-based checks work:

```bash
cp install --ci   # refuses if user-owned workflow exists
cp install --ci --force
```

The sentinel comment `# cp:ci v1` marks the file as cp-owned; users
who hand-edit lose ownership protection.

---

## Migration: bringing a pre-v0.8 project up to spec

```bash
# 1. Backfill SHAs everywhere
cp reconcile --all --infer-shas --no-commit
git add -A && git commit -m "cp: backfill v0.8 SHAs"

# 2. Audit — should now show only LOW + maybe a few MEDIUM
cp audit

# 3. Auto-fix the safe stuff
cp audit --fix

# 4. Inspect what's left, repair manually with the verb family
cp audit --severity high   # MUST be empty before next step
cp audit --severity medium # decide case-by-case

# 5. Turn on prevention
cp install --hooks
cp install --ci   # if this repo uses GitHub Actions
git add -A && git commit -m "cp: enable v0.8 drift defense"
```

---

## Quick reference

| If audit shows… | Run… |
|---|---|
| `state-stale` | `cp audit --fix` (or `cp state regen`) |
| `summary-without-tick` | `cp audit --fix` (or `cp tick <planId>`) |
| `ticked-without-summary` | `cp write-summary <planId> --from <json>` |
| `missing-base-commit` | `cp audit --fix` (or `cp reconcile <phase> --infer-shas`) |
| `missing-end-commit` | `cp audit --fix` (or `cp reconcile <phase> --infer-shas`) |
| `invalid-base-commit` | `cp reconcile <phase> --infer-shas` |
| `expected-vs-actual-drift` | review; if intent shifted, `cp reconcile <phase> --accept` |
| `phase-without-design` | author `DESIGN.md` in the phase dir |
| `roadmap-orphan-phase` | add ROADMAP entry, or delete the orphan phase dir |
| many findings at once | `cp reconcile --all --infer-shas` then `cp audit --fix` |

---

## See also

- `cp audit --help` — full check descriptions + severity model
- `cp reconcile --help` — single-phase and bulk modes
- `CHANGELOG.md` — what landed in each v0.8.x release
- `templates/agent-instructions.md` — the literacy block injected into
  AI harness prompts
