---
title: Replace quick-PLAN.md with DESIGN.md + STATE.md pair
one-liner: cp-quick now uses DESIGN+STATE artifact shape, matching milestone-phases.
what-shipped: "Removed templates/quick-PLAN.md. Added templates/quick-DESIGN.md (goal/approach/done-when) and templates/quick-STATE.md (current-status/last-activity). Rewrote commands/cp/quick.md: dropped invoke-plan-skill step, added collaborative DESIGN fill-in (Step 4), kept --full opt-in for heavyweight planner."
key-decisions:
  - DESIGN.md is the contract, STATE.md is the journal, SUMMARY.md closes the loop - same shape as milestone-phases for easy promotion later.
  - Quick tasks default to skipping the heavyweight plan skill; --full re-enables it as opt-in.
  - STATE.md is updated during execution (not just at end) so quick-resume can pick up mid-flight without losing progress.
  - Discovered bin/commands/quick.js does NOT exist - cp-quick is purely a skill, so 51-02 reduced to a templates+skill refactor.
key-files:
  - templates/quick-DESIGN.md
  - templates/quick-STATE.md
  - commands/cp/quick.md
phase: 51
plan: 51-02
completed: 2026-05-26
end-commit: 93d255c2c2e108037acd1363641af4ccd72eb95f
---
# Summary 51-02

Plan 51-02 completed.
