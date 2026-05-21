'use strict';

const pkg = require('../../package.json');

function usage() {
  console.log(`cp v${pkg.version} — context-planning CLI (invocable as \`cplan\` or \`cp\`)

Usage:
  cp install <harness>            Install into a harness (copilot | claude | cursor | aider)
  cp install --hooks [--force]    Install cp git hooks (pre-commit, post-commit) into git repo
  cp install --uninstall-hooks    Remove cp-owned git hooks
  cp install --ci [--force]       Install GitHub Actions audit workflow (.github/workflows/cp-audit.yml)
  cp init                         Scaffold .planning/ in this repo
  cp gsd-import [--root <dir>] [--json] [--apply]
                                  Read-only audit of any planning project
                                  (--apply runs \`cp init\` after the audit)
  cp doctor [--json] [--quiet]    Show resolved config, provider status, GSD compat
  cp status [--json]              Show "you are here": current milestone, phase, next plan
  cp tick <plan-id> [--undo] [--no-commit]
                                  Mark a plan done in ROADMAP + phase PLAN.md
                                  (idempotent; commits unless --no-commit)
  cp write-summary <plan-id> --from <json-file> [--body <md-file>] [--overwrite]
                                  Write {NN-MM}-SUMMARY.md with validated frontmatter
                                  (normalises snake_case -> kebab-case aliases)
  cp scaffold-milestone <name> [--planned] [--no-commit] [--dry-run]
                                  Add \`### 🚧 <name> (In Progress)\` heading to ROADMAP
                                  (use --planned for \`### 📋 <name> (Planned)\`)
  cp scaffold-phase <N> --name <name> [--plans <count>] [--milestone <name>]
                                      [--force] [--continue]
                                  Add \`### Phase N: <name>\` under active milestone +
                                  create .planning/phases/{NN-slug}/PLAN.md.
                                  Refuses if phase N-1 has ticked plans without
                                  SUMMARY.md (--force silently overrides;
                                  --continue bypasses and adds a "Continues from"
                                  note to the new PLAN.md; v0.8 P6/P10).
  cp scaffold-codebase [--force] [--no-commit] [--dry-run]
                                  Create .planning/codebase/ with 7 stub docs
                                  (STACK, INTEGRATIONS, ARCHITECTURE, STRUCTURE,
                                  CONVENTIONS, TESTING, CONCERNS). Filled by
                                  \`/cp-map-codebase\`.
  cp codebase-status [--json]     Inventory .planning/codebase/ — which docs
                                  exist, line counts, which still look like stubs
  cp capture <text>               Append a free-form item to .planning/INBOX.md
                                  with a timestamp (use \`/cp-capture\` to triage)
  cp inbox [--json] [--all] [--tick <N> [--note <dest>]]
                                  List open items (default) or all; --tick N moves
                                  open item N to Triaged (optionally with a note like
                                  --note "quick:rename-version-flag")
  cp statusline [--format <fmt>] [--json] [--no-color]
                                  Print a one-line prompt-friendly status string
                                  (for shell PS1, Starship, tmux, etc). Silent
                                  outside a cp project. Format tokens: %M
                                  (milestone), %P (phase), %D (done/total),
                                  %N (next plan id), %B (branch).
  cp worktree create <name> [--branch <b>] [--from <base>] [--path <dir>] [--phase <N>] [--no-create]
  cp worktree list [--json]
  cp worktree remove <slug> [--force]
                                  Manage cp-tracked git worktrees. \`create\`
                                  runs \`git worktree add <path> -b cp/<slug>\`
                                  and records it in .planning/WORKTREES.md.
                                  Delegates to the configured provider's
                                  worktree skill when --use-provider is set
                                  (Superpowers: using-git-worktrees).
  cp complete-milestone [<name>] [--dry-run] [--no-commit] [--json]
                       [--no-audit] [--audit-warn]
                                  Full milestone close-out (verify, aggregate digest,
                                  collapse in ROADMAP, clear context, reset STATE, commit).
                                  Runs cp audit as a gate: refuses on HIGH (always)
                                  and MEDIUM (unless --audit-warn). --no-audit
                                  bypasses the gate (override notice on stderr).
  cp state regen [--dry-run] [--quiet]
                                  Regenerate derived block of STATE.md from
                                  ROADMAP + phase tree. Run after pulling
                                  colleagues' commits or hand-editing ROADMAP.
  cp audit [--json] [--strict] [--milestone <name>] [--phase <N>] [--quiet]
                                  Read-only drift sweep (v0.8 Tier 3 detect).
                                  Reports findings with severity / location /
                                  fix. Exit 0 clean, 1 LOW/MED, 2 HIGH or strict.
  cp audit --fix [--max N] [--severity high|medium|all] [--dry-run]
                                  Classify + auto-fix loop (v0.8 Tier 3 repair).
                                  One atomic commit per fix, --max caps fixes
                                  (default 5). Exit 0 all clean, 1 any failed,
                                  2 manual findings remain.
  cp reconcile <phaseNum> [--infer-shas] [--accept] [--plan NN-MM]
                          [--dry-run] [--json] [--no-commit]
                                  Repair drift for a phase (v0.8 P10).
                                  --infer-shas fills missing base-commit
                                  and end-commit from git log. --accept
                                  rewrites expected-key-files from SUMMARY
                                  (destructive). One atomic commit per change.
  cp supersede <planId> --by <newPlanId> [--reason "<text>"]
                        [--dry-run] [--json] [--no-commit]
                                  Mark plan as superseded ([~] checkbox) and
                                  append "Superseded by" note to PLAN.md (P10).
  cp deviate <phaseNum> --summary "<text>" [--reason "<text>"]
                        [--dry-run] [--json] [--no-commit]
                                  Append a dated \`## Deviation\` block to
                                  phase PLAN.md (P10).
  cp config get [<key>]           Print a cp.<key> value (or whole cp block)
  cp config set <key> <value>     Update a cp.<key> value
  cp config refresh [--dry-run]   Merge upstream defaults into your project config
  cp version                      Print version
  cp help                         Show this message
`);
}

module.exports = usage;
