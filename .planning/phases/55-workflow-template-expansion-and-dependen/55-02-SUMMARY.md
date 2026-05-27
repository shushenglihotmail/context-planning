---
plan-id: 55-02
status: done
title: Workflow-template expander
key-files:
  - lib/workflow-template-expand.js
  - test/unit-workflow-template-expand.js
key-decisions:
  - Prefix every materialized id with <groupId>--
  - Rewrite internal after/depends_on edges with prefix; leave external refs alone
  - "Wrapper after: prepended to entry phases; exit-phase ids returned for outer rewriter"
  - MAX_DEPTH=3 chain cap; empty group is an error
phase: 55
plan: 55-02
completed: 2026-05-27
end-commit: 439fbb00cbbd0211799131fd6ef3f09a058152ac
---
# Summary 55-02

Plan 55-02 completed.
