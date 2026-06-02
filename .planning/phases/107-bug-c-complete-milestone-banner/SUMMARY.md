Bug C complete via SDD.

Commit: 92d14a9 fix(complete-milestone): regenerate STATE.md after archive (Bug C)

Note: state.regenerate(root) call landed in prior commit 8ba274b; 92d14a9 added the missing try/catch stderr warning so regen failure surfaces without blocking exit 0.

Files: lib/lifecycle.js (+4/-2), test/unit-lifecycle.js (+36)

Tests: 2 new sections covering success (banner refresh: Phase: -, Status: Idle) and failure (regen throws → stderr warning, ok: true). Full npm test green.

Reviews: Spec+quality (Haiku) approved on first pass. Verified Bug A regex widening (h4 acceptance) does not regress this path — fixture has no <details> blocks or h4 phases.
