'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot, planningDir } = require('../../lib/paths');
const lifecycle = require('../../lib/lifecycle');

function run(args = []) {
  let format = null;
  let json = false;
  let noColor = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--no-color') noColor = true;
    else if (a === '--format') {
      format = args[++i];
      if (format == null) { console.error('--format requires a value'); process.exit(2); }
    } else { console.error(`unknown option: ${a}`); process.exit(2); }
  }

  // Stay silent outside a cp/git project. Used in shell prompts — must never
  // emit noise that breaks PS1.
  let root;
  try { root = repoRoot(); }
  catch { process.exit(0); }
  const planning = planningDir(root);
  if (!fs.existsSync(path.join(planning, 'ROADMAP.md'))) process.exit(0);

  let r;
  try { r = lifecycle.statusReport(root); }
  catch { process.exit(0); }
  if (!r.ok) process.exit(0);

  // Compute the active phase: first phase with done < total. Fall back to
  // last phase if all done.
  let activePhase = r.phases.find((p) => p.done < p.total);
  if (!activePhase && r.phases.length > 0) activePhase = r.phases[r.phases.length - 1];

  const phaseLabel = activePhase
    ? `${String(activePhase.num).padStart(2, '0')}-${activePhase.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
    : null;
  const doneTotal = activePhase ? `${activePhase.done}/${activePhase.total}` : null;
  const nextId = r.nextPlan ? r.nextPlan.planId : null;

  // Try to grab the current git branch (best-effort, silent on failure).
  let branch = '';
  try {
    branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { branch = ''; }

  if (json) {
    console.log(JSON.stringify({
      milestone: r.milestone,
      milestoneStatus: r.milestoneStatus,
      phase: activePhase ? { num: activePhase.num, name: activePhase.name, label: phaseLabel, done: activePhase.done, total: activePhase.total } : null,
      nextPlan: r.nextPlan,
      branch,
    }, null, 2));
    return;
  }

  // Color helpers (ANSI). Detection is conservative: only emit when stdout
  // is a TTY AND --no-color was NOT passed AND NO_COLOR env is unset.
  const useColor = !noColor && process.stdout.isTTY && !process.env.NO_COLOR;
  const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  const dim = (s) => c('2', s);
  const bold = (s) => c('1', s);
  const cyan = (s) => c('36', s);
  const green = (s) => c('32', s);
  const yellow = (s) => c('33', s);

  // Custom format support: %M %P %D %N %B tokens.
  if (format) {
    const out = format
      .replace(/%M/g, r.milestone || '')
      .replace(/%P/g, phaseLabel || '')
      .replace(/%D/g, doneTotal || '')
      .replace(/%N/g, nextId || '')
      .replace(/%B/g, branch || '');
    console.log(out);
    return;
  }

  // Default format. Examples:
  //   cp ▸ v0.4 ▸ 02-mvp 1/3 → 02-02
  //   cp ▸ v0.4 ▸ ✓ done
  //   cp ▸ (no milestone)
  const arrow = dim('▸');
  const prefix = bold(cyan('cp'));
  if (!r.milestone) {
    console.log(`${prefix} ${arrow} ${dim('(no milestone)')}`);
    return;
  }
  const mPart = green(r.milestone);
  if (!activePhase) {
    console.log(`${prefix} ${arrow} ${mPart}`);
    return;
  }
  const phasePart = activePhase.done >= activePhase.total
    ? `${green('✓')} ${dim('done')}`
    : `${yellow(phaseLabel)} ${dim(doneTotal)}${nextId ? ' ' + arrow + ' ' + cyan(nextId) : ''}`;
  console.log(`${prefix} ${arrow} ${mPart} ${arrow} ${phasePart}`);
}

module.exports = { name: 'statusline', run };
