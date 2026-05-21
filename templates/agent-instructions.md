# Drift defense (v0.8) — agent literacy

The following text is injected into every harness's instruction block by
`install/common.js#buildDriftDefenseBlock()`. Keep wording harness-agnostic
(refer to verbs as `cp <verb>`, not `/cp-<verb>`).

---

## Drift defense (v0.8)

`cp` ships a three-layer drift-defense stack (prevent / detect / repair)
so the *codebase* stays consistent with the *plan/state docs*. Surface
these verbs proactively when the situation calls for them — don't wait
for the user to remember they exist.

- **`cp audit`** — detect drift. Run it: (a) before shipping, (b) after
  a long execution session, (c) when the user mentions "out of date"
  or "missing", (d) when a phase plan claims something the codebase
  doesn't have.
- **`cp audit --fix`** — auto-repair the safe drift classes:
  `state-stale`, `summary-without-tick`, `missing-base-commit`,
  `missing-end-commit`. Use when audit shows mostly auto-fixable
  findings; the user can review the atomic commits afterward.
- **`cp reconcile <phase> --infer-shas`** — backfill base/end SHAs from
  git log for a specific phase. Use when importing a pre-v0.8 project
  or when audit highlights SHA-related MEDIUM findings for one phase.
- **`cp reconcile --all --infer-shas`** — same, but for every phase at
  once (typically a single "migration" commit after upgrading from
  v0.7 or earlier).
- **`cp reconcile <phase> --accept`** — destructive: rewrite
  `expected-key-files` to match the actual SUMMARY key-files. Use only
  when the plan's intent CHANGED and the actual files are now correct.
- **`cp supersede <planId> --by <newPlanId> --reason "..."`** — mark a
  plan as `[~]` (superseded) when its scope moved to a different plan.
  Preferred over silently re-doing the same work in a new plan.
- **`cp deviate <phaseNum> --summary "..." --reason "..."`** — record a
  one-off deviation from PLAN.md when implementation diverged but the
  plan still stands. Keeps an auditable trail without restructuring.
- **`cp scaffold-phase N --continue`** — bypass the prior-phase summary
  gate AND stamp a `Continues from: phase N-1` note in the new PLAN.md.
  Use when you need to carry forward incomplete work transparently.

## Enforcement (opt-in)

- **`cp install --hooks`** — install pre-commit (HIGH audit gate by
  default) and post-commit (`tick-auto` if `behavior.post_commit` is set
  to `"tick-auto"`). Suggest after the first `cp audit` shows clean.
- **`cp install --ci`** — install a GitHub Actions workflow that runs
  `cp audit --severity high` on every PR. Suggest at project init or
  when adding `cp` to a repo with existing CI.

## Quick-reference: when audit findings appear

| Finding id | Suggest |
|---|---|
| `state-stale` | `cp state regen` (auto-fixable by `cp audit --fix`) |
| `summary-without-tick` | `cp tick <planId>` (auto-fixable) |
| `missing-base-commit` | `cp reconcile <phase> --infer-shas` (auto-fixable) |
| `missing-end-commit` | `cp reconcile <phase> --infer-shas` (auto-fixable) |
| `ticked-without-summary` | `cp write-summary <planId> --from ...` (HIGH, manual) |
| `expected-vs-actual-drift` | `cp reconcile <phase> --accept` (destructive, MEDIUM, manual) |
| `phase-without-design` | author DESIGN.md (LOW) |
