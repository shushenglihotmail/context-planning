---
milestone_slug: "v1-10-skill-routing-verify-gate"
milestone: v1.10 Skill Routing & Verify Gate
status: accepted
created: 2026-06-02
updated: 2026-06-02
deciders: [shushengli]
supersedes: []
superseded_by: null
---

# Design: v1.10 Skill Routing & Verify Gate

## Status

Accepted on 2026-06-02. Full spec: `docs/superpowers/specs/2026-06-02-v1.10-skill-routing-verify-gate-design.md`.

## Context

Downstream consumer's v4.7 milestone retrospective surfaced 7 friction items.
Triage against current `lib/` code in this session identified **2 real bugs**
and 3 verified non-bugs:

**Real (this milestone fixes):**
1. `lib/provider.js#resolveSkill` checks provider install but not per-skill
   `SKILL.md` existence → silent runtime routing failures + per-wave
   `(inline-fallback)` attestation noise.
2. `templates/workflows/milestone.yaml` review phase is prose-only — the
   code-review agent reads code but never runs it. A runtime `TypeError`
   shipped to `main` with full attestation because no objective execution
   gate existed at the wave boundary.

**Non-bugs (no work):**
- STATE.md auto-rollover — already fixed v1.9.0 Bug C (commit `92d14a9`).
- Empty `finalize` prompt — by-design (`kind: scaffold`).
- Auto-staging `.planning/` — per-project policy.

## Decision

Add a per-skill availability check with explicit opt-in fuzzy matching
(parens-sigil syntax) and a five-step resolution chain. Insert a new
`verify` scaffold phase before `review` in the milestone workflow that
runs real test commands and exits non-zero on failure, with `depends_on`
wiring so review cannot run until tests pass.

## Consequences

### Positive
- Silent skill misses become loud at workflow start (one consolidated diagnostic, not per-wave noise).
- Runtime crashes can no longer ship with full attestation — `kind: scaffold` verify cannot be fake-attested past.
- Authors can opt into fuzzy matching per skill slot without affecting strict-match neighbors.
- Manual provider becomes a real autonomous fallback (not just a config label).

### Negative
- New YAML sigil syntax to teach (`(skill-name)`).
- New CLI subcommand (`cp run-verify`) to maintain.
- Modest workflow-start overhead: O(unique-skills) stat calls (~3-5 typical).

### Neutral
- Fuzzy matching is opt-in only; strict behavior is unchanged for existing workflows.
- Verify gate is opt-out (`behavior.verify: false` / `--skip-verify`) for prose-only milestones.

---

## Architecture

```
cp run milestone <name>
  └─ runtime expands template → static phase DAG
       └─ diagnostic pass: walk DAG, collect (role, skill) pairs
            └─ per pair: resolution chain (sigil-fuzzy → exact → manual → dispatch → bare)
                 └─ emit ONE diagnostic block (✓/ℹ/⚠) before wave 1
       └─ execute wave-by-wave; each phase carries its resolved skill+prompt
            └─ verify wave: cp run-verify <slug>
                 ├─ reads behavior.test_command from .planning/config.json
                 ├─ auto-detect chain: npm test → pytest → cargo test → go test ./...
                 └─ non-zero exit fails the wave → review wave blocked by depends_on
```

## Components

| Component | Purpose | Public interface | Dependencies |
|---|---|---|---|
| `lib/provider.js` | parens-sigil parser, role-filtered token-overlap fuzzy matcher, per-skill `SKILL.md` stat, manual prompt loader | `resolveSkill(name, role) → {kind, ...}` | filesystem, provider config |
| `lib/runtime.js` | workflow-start diagnostic aggregator, resolution-chain wiring, subagent-dispatch directive emission | (engine internals) | `lib/provider.js`, phase DAG |
| `lib/verify.js` | test-command auto-detect, exec wrapper, exit-code propagation | `runVerify(slug, opts) → exitCode` | child_process, `.planning/config.json` |
| `bin/commands/run-verify.js` | CLI entry for `cp run-verify` | `cp run-verify <slug>` | `lib/verify.js` |
| `templates/workflows/milestone.yaml` | DAG shape: insert `verify` before `review` | (data only) | (none) |

## Data Flow

See Architecture diagram above. Resolution chain runs once per unique
`(role, skill_name)` at workflow start; results are cached for the
duration of the run. Verify phase is a scaffold (real CLI exec) — no
LLM in the loop, output streamed verbatim to the user.

## Error Handling

| Failure | Behavior |
|---|---|
| Skill missing at runtime (post-diagnostic) | Cannot happen — diagnostic surfaces at start. |
| Fuzzy match: no candidates ≥ 0.5 | Fall through to manual provider; diagnostic shows `⚠` + `cp config set` hint. |
| `cp run-verify`: no test command detected | WARN + exit 0 (do not block; user opts in via `behavior.test_command`). |
| `cp run-verify`: test command fails | Exit non-zero → scaffold wave fails → review blocked → user sees real CLI output. |
| Sigil malformed (unclosed paren, nested) | Parser throws at workflow start with line number. |

## Testing Strategy

- **Unit (`lib/provider.js`):** parens-sigil parser boundary cases; fuzzy matcher token-overlap + role filter + tiebreak determinism; per-skill stat (present/absent/symlink).
- **Unit (`lib/verify.js`):** auto-detect chain priority; exec exit-code propagation; opt-out paths.
- **Integration (`lib/runtime.js`):** each resolution-chain layer hits expected fallback on synthetic fixture; workflow-start diagnostic snapshot.
- **Integration (`templates/workflows/milestone.yaml`):** full milestone run on a synthetic fixture; verify blocks review on test failure; `--skip-verify` works.

## Alternatives Considered

### Option A — Whole-property fuzzy flag (`review_skill_fuzzy: true`)

**Pros:** No new sigil syntax.

**Cons:** Doesn't scale to multi-skill phases — would force one parallel
property per slot. Not generic.

**Verdict:** Rejected. In-place sigil scales naturally.

### Option B — Glob-style sigil (`*code-review*`)

**Pros:** Familiar to shell users.

**Cons:** Evokes pattern semantics — implies the user controls the match
shape. Actual algorithm is role-driven token overlap; glob is misleading.

**Verdict:** Rejected. Sigil is a *flag*, not a pattern.

### Option C — Bracket sigil (`[code-review]`)

**Pros:** Visually distinct.

**Cons:** `[` triggers YAML flow-sequence parsing — requires quoting.
Doubling (`[[…]]`) doesn't escape.

**Verdict:** Rejected. Parens-wrap chosen instead (100% YAML-safe).

### Option D — Run tests inside the review prompt (no new phase)

**Pros:** Zero new CLI surface.

**Cons:** Still LLM-in-the-loop — can be fake-attested past. Defeats the
whole point of objective verification.

**Verdict:** Rejected. `kind: scaffold` real CLI exec is non-negotiable.

## Open Questions

- [ ] Should `behavior.verify` default to `true` on first install, or
      stay opt-in via `cp config set` to avoid breaking existing repos
      without test scripts? (P4 decision.)

## References

- Full spec: `docs/superpowers/specs/2026-06-02-v1.10-skill-routing-verify-gate-design.md`
- Inbox seeds (superseded): `.planning/INBOX.md` entries #4 → #5 → #6 → #7 → #8
- Verified non-bug evidence: phase `107-bug-c-complete-milestone-banner/SUMMARY.md` (commit `92d14a9`)
- Origin: downstream consumer v4.7 milestone retrospective forwarded 2026-06-02


---

## Implementation deviation (post-hoc, recorded at v1.10.0 release)

**Deviation:** The role-filter mechanism (DESIGN: 'fuzzy matcher filters
candidates by `role:` frontmatter in each SKILL.md') was dropped.

**Reason:** Superpowers SKILL.md files have only `name:` and `description:`
frontmatter — there is no `role:` field to filter on. Verified against
the v1.10 SP catalog (14 skills, e.g. `brainstorming`, `writing-plans`,
`receiving-code-review`).

**What shipped instead:** Pure token-overlap fuzzy matching without role
filter. Tokenize hint + each candidate on `-`/`_`/whitespace; score
`matched_tokens / max(|hint|, |candidate|)` with bidirectional substring
match; threshold ≥ 0.5; tiebreak score-desc → length-asc → alpha-asc.
Deterministic; `(code-review)` against the SP catalog always picks
`receiving-code-review` (both candidates tie at 2/3, alpha-tiebreak wins).

**Future work:** If SP ever adds a `role:` frontmatter convention, the
filter can be layered back in without breaking existing fuzzy resolutions.
