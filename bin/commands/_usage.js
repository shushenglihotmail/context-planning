'use strict';

const pkg = require('../../package.json');

function usage() {
  console.log(`cp v${pkg.version} — context-planning CLI (invocable as \`cplan\` or \`cp\`)

Usage:
  cp install <harness>            Install into a harness (copilot | claude | cursor | aider)
                                  Default: per-repo wiring (writes to .github/,
                                  .claude/, .cursor/, .aider/ in the current repo;
                                  cp walks up from cwd to find .git / package.json).
  cp install <harness> --repo <path>
                                  Per-repo install targeting <path> from any cwd
                                  (mutually exclusive with --global).
  cp install <harness> --global   Install at user-home scope (~/.copilot, ~/.claude,
                                  ~/.cursor, ~/.aider). Result: /cp-* commands
                                  visible in every repo on this machine for that
                                  harness. Still per-harness — run once per harness.
  cp install --hooks [--repo <path>] [--force]
                                  Install cp git hooks (pre-commit, post-commit) into git repo
  cp install --uninstall-hooks [--repo <path>]
                                  Remove cp-owned git hooks
  cp install --ci [--repo <path>] [--force]
                                  Install GitHub Actions audit workflow (.github/workflows/cp-audit.yml)
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
  cp reconcile --all      [--infer-shas|--accept] [--dry-run] [--json] [--no-commit]
  cp reconcile --phase <range> [--infer-shas|--accept] [--dry-run] [--json] [--no-commit]
                                  Repair drift for a phase, all phases, or a
                                  range (v0.8 P10/P9). --infer-shas fills
                                  missing base-commit + end-commit from git
                                  log. --accept rewrites expected-key-files
                                  from SUMMARY (destructive). One atomic
                                  commit per change. <range>: 5, 5-8, 5..8,
                                  5,7,9, 5,7-9.
  cp supersede <planId> --by <newPlanId> [--reason "<text>"]
                        [--dry-run] [--json] [--no-commit]
                                  Mark plan as superseded ([~] checkbox) and
                                  append "Superseded by" note to PLAN.md (P10).
  cp deviate <phaseNum> --summary "<text>" [--reason "<text>"]
                        [--dry-run] [--json] [--no-commit]
                                  Append a dated \`## Deviation\` block to
                                  phase PLAN.md (P10).
  cp update [--dry-run | --check] [--quiet] [--json]
                                  Refresh per-repo cp state (skill files,
                                  config defaults, drift fixes) after a
                                  version bump. Documented invocation:
                                  \`npx -y --package=context-planning@latest -- cp update\`.
                                  --check exits 1 if anything would change.
  cp autonomous [START] [--scope=phase|N|N-M|milestone]
                        [--check] [--json] [--quiet]
                                  Walk pending phases of the active milestone
                                  autonomously (v0.10). Bounded to a single
                                  milestone. Smart-gated on test/audit/deviation;
                                  stops via \`.planning/.continue-here.md\`.
                                  Bare CLI is most useful with --check;
                                  /cp-autonomous slash skill drives the full loop.
  cp run <workflow> [name] [--plan-only] [--projectDir <path>]
  cp run resume <slug> [--projectDir <path>]
  cp run retry <slug> <phase-id> [--projectDir <path>]
  cp run abandon <slug> [--yes] [--projectDir <path>]
  cp run mark-complete <slug> <phase-id> [--projectDir <path>]
  cp run status [slug] [--json] [--projectDir <path>]
                                  Run and manage workflow template instances.
                                  \`cp run <workflow> [name]\` starts a new run
                                  (--plan-only prints waves without mutating state).
                                  \`cp run status\` lists all active runs.
                                  See \`cp run --help\` for full sub-command details.
  cp workflow ls [--json]         List all templates (built-in + project).
  cp workflow show <name>         Print a template's YAML body to stdout.
  cp workflow validate <name-or-path> [--strict]
                                  Validate a template (errors/warnings to stderr).
                                  Exit 2 on errors; --strict also exits 2 on warnings.
  cp workflow diagram <name-or-path> [--format mermaid]
                                  Emit a Mermaid flowchart to stdout.
  cp workflow inspect <name-or-path> [--json]
                                  Show template YAML plus the deduced wave-by-wave
                                  execution sequence (parallel phase groupings).
                                  --json   Machine-readable form.
  cp workflow init                Create .planning/workflows/ directory.
  cp workflow new <name> [--from <built-in>] [--force]
                                  Scaffold a new template file (stub or from built-in).
  cp workflow import <path> [--name <override>] [--force]
                                  Validate + copy an external template into .planning/workflows/.
  cp workflow brainstorm [--workflow <name>] [--out <path>]
                                  Emit a brainstorm context for designing a new workflow.
                                  Delegates to the configured provider skill or prints a
                                  guided prompt (manual fallback). Exit 0.
                                  See \`cp workflow --help\` for full sub-command details.
  cp phase-template ls [--json]   List phase templates (built-in + project).
  cp phase-template show <name>   Print a phase template's YAML to stdout.
  cp phase-template new <name> [--from <built-in>] [--force]
                                  Scaffold a new phase template file.
  cp workflow-template ls [--json]
                                  List workflow templates (built-in + project).
  cp workflow-template show <name>
                                  Print a workflow template's YAML to stdout.
  cp workflow-template new <name> [--from <built-in>] [--force]
                                  Scaffold a new workflow template file.
  cp config get [<key>]           Print a cp.<key> value (or whole cp block)
  cp config set <key> <value>     Update a cp.<key> value
  cp config refresh [--dry-run]   Merge upstream defaults into your project config
  cp version                      Print version
  cp help                         Show this message
`);
}

module.exports = usage;
