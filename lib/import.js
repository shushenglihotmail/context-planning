'use strict';

/**
 * cp gsd-import — read-only audit of any planning directory.
 *
 * Inspects a project root and reports:
 *   - Whether `.planning/` is GSD-shape, cp-aware, both, or neither
 *   - Sentinel presence (research/, todos/, REQUIREMENTS.md, etc.)
 *   - Phase / plan / summary inventory cross-referenced against ROADMAP.md
 *   - Frontmatter parse health of every PLAN.md and SUMMARY.md
 *   - What `cp init` would do if --apply were passed (additive only)
 *
 * Everything here is pure read-only — never writes a byte. The CLI wrapper
 * decides whether to fall through to `cmdInit` based on --apply.
 */

const fs = require('fs');
const path = require('path');

const compat = require('./gsd-compat');
const provider = require('./provider');
const roadmap = require('./roadmap');
const paths = require('./paths');
const fm = require('./frontmatter');

const SHARED_REQUIRED = [
  '.planning/PROJECT.md',
  '.planning/ROADMAP.md',
  '.planning/STATE.md',
];
const SHARED_OPTIONAL = [
  '.planning/MILESTONES.md',
  '.planning/MILESTONE-CONTEXT.md',
  '.planning/config.json',
];

/**
 * Run the audit. Returns a structured report object — never throws on bad
 * project state (corrupt YAML, missing files), but records each problem in
 * `issues`.
 */
function audit(root) {
  const report = {
    root,
    planning: { present: false, path: paths.planningDir(root) },
    classification: 'unknown',
    cpAware: false,
    gsdProject: false,
    sentinels: { gsd: {}, shared: {} },
    config: { present: false, parseable: false, hasCpBlock: false, gsdKeys: [] },
    phases: [],
    quickTasks: [],
    activeMilestone: null,
    provider: { configured: null, installed: null, fallback: null },
    issues: [],
    recommendation: null,
    plan: { wouldCreate: [], wouldModify: [], wouldDelete: [] },
  };

  // ---------- planning dir presence ----------
  report.planning.present = compat.hasPlanning(root);
  if (!report.planning.present) {
    report.classification = 'no-planning';
    report.recommendation =
      `No .planning/ directory at ${root}. ` +
      `Run \`cp init\` to scaffold one (creates PROJECT.md / ROADMAP.md / STATE.md / MILESTONES.md / config.json).`;
    report.plan.wouldCreate = [
      '.planning/',
      '.planning/phases/',
      '.planning/quick/',
      '.planning/PROJECT.md',
      '.planning/ROADMAP.md',
      '.planning/STATE.md',
      '.planning/MILESTONES.md',
      '.planning/config.json',
    ];
    return report;
  }

  // ---------- sentinels ----------
  for (const s of compat.GSD_SENTINELS) {
    report.sentinels.gsd[s] = fs.existsSync(path.join(root, s));
  }
  for (const s of [...SHARED_REQUIRED, ...SHARED_OPTIONAL]) {
    report.sentinels.shared[s] = fs.existsSync(path.join(root, s));
  }
  report.gsdProject = compat.isGsdProject(root);

  // ---------- config.json ----------
  const cfgPath = path.join(root, '.planning', 'config.json');
  if (fs.existsSync(cfgPath)) {
    report.config.present = true;
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      report.config.parseable = true;
      report.config.hasCpBlock = !!(raw && typeof raw === 'object' && raw.cp);
      report.config.gsdKeys = Object.keys(raw || {}).filter((k) => k !== 'cp').sort();
      report.cpAware = report.config.hasCpBlock;
    } catch (e) {
      report.config.parseable = false;
      report.issues.push({
        severity: 'error',
        kind: 'config-parse',
        message: `config.json is not valid JSON: ${e.message}`,
      });
    }
  }

  // ---------- required shared files ----------
  for (const rel of SHARED_REQUIRED) {
    if (!report.sentinels.shared[rel]) {
      report.issues.push({
        severity: 'warn',
        kind: 'missing-shared',
        message: `Required state file missing: ${rel}`,
      });
    }
  }

  // ---------- active milestone ----------
  if (report.sentinels.shared['.planning/MILESTONE-CONTEXT.md']) {
    const mcPath = path.join(root, '.planning', 'MILESTONE-CONTEXT.md');
    const text = fs.readFileSync(mcPath, 'utf8');
    const titleMatch = text.match(/^#\s+Milestone Context:\s*(.+)$/m) || text.match(/^#\s+(.+)$/m);
    const statusMatch = text.match(/\*\*Status\*\*:\s*(.+)$/m);
    report.activeMilestone = {
      file: '.planning/MILESTONE-CONTEXT.md',
      name: titleMatch ? titleMatch[1].trim() : '(unknown)',
      status: statusMatch ? statusMatch[1].trim() : '(unknown)',
    };
  }

  // ---------- phases on disk ----------
  const diskPhases = compat.scanPhases(root);
  const planByPhase = {}; // numKey -> [{file, frontmatter, parseError, expectedId}]
  const summaryByPhase = {};

  for (const p of diskPhases) {
    const prefixMatch = p.name.match(/^([\d.]+)-/);
    const phaseNum = prefixMatch ? prefixMatch[1].replace(/^0+(?=\d)/, '') || prefixMatch[1] : null;
    const normNum = phaseNum ? String(parseFloat(phaseNum) === parseInt(phaseNum, 10) && !phaseNum.includes('.') ? parseInt(phaseNum, 10) : phaseNum) : null;
    planByPhase[normNum] = [];
    summaryByPhase[normNum] = [];

    if (p.hasShortPlan || p.hasShortSummary) {
      report.issues.push({
        severity: 'warn',
        kind: 'short-form-name',
        phase: p.name,
        message: `Phase ${p.name} has short-form PLAN.md/SUMMARY.md (GSD expects {phase}-{plan}-PLAN.md). cp will read both, but GSD won't see the short form.`,
      });
    }

    for (const f of p.planFiles) {
      const idMatch = f.match(/^([\d.]+-\d+)-PLAN\.md$/);
      const id = idMatch ? idMatch[1] : null;
      const full = path.join(p.path, f);
      let frontmatter = null;
      let parseError = null;
      try {
        const parsed = fm.parse(fs.readFileSync(full, 'utf8'));
        frontmatter = parsed.frontmatter || null;
        parseError = parsed.parseError || null;
      } catch (e) {
        parseError = e.message;
      }
      if (parseError) {
        report.issues.push({
          severity: 'error',
          kind: 'frontmatter-parse',
          file: path.relative(root, full).replace(/\\/g, '/'),
          message: `Frontmatter parse failed: ${parseError}`,
        });
      }
      planByPhase[normNum].push({ file: f, id, frontmatter, parseError });
    }

    for (const f of p.summaryFiles) {
      const idMatch = f.match(/^([\d.]+-\d+)-SUMMARY\.md$/);
      const id = idMatch ? idMatch[1] : null;
      const full = path.join(p.path, f);
      let frontmatter = null;
      let parseError = null;
      try {
        const parsed = fm.parse(fs.readFileSync(full, 'utf8'));
        frontmatter = parsed.frontmatter || null;
        parseError = parsed.parseError || null;
      } catch (e) {
        parseError = e.message;
      }
      if (parseError) {
        report.issues.push({
          severity: 'error',
          kind: 'frontmatter-parse',
          file: path.relative(root, full).replace(/\\/g, '/'),
          message: `Frontmatter parse failed: ${parseError}`,
        });
      }
      summaryByPhase[normNum].push({ file: f, id, frontmatter, parseError });
    }

    report.phases.push({
      dir: p.name,
      num: normNum,
      planCount: p.planFiles.length,
      summaryCount: p.summaryFiles.length,
      shortFormPresent: p.hasShortPlan || p.hasShortSummary,
    });
  }

  // ---------- cross-check against ROADMAP.md ----------
  const roadmapPath = path.join(root, '.planning', 'ROADMAP.md');
  let roadmapPhases = [];
  if (fs.existsSync(roadmapPath)) {
    try {
      const content = roadmap.read(roadmapPath);
      roadmapPhases = roadmap.listPhases(content);
    } catch (e) {
      report.issues.push({
        severity: 'error',
        kind: 'roadmap-parse',
        message: `ROADMAP.md unreadable: ${e.message}`,
      });
    }
  }

  // ROADMAP phases not present as a dir on disk:
  for (const rp of roadmapPhases) {
    const onDisk = report.phases.find((dp) => dp.num === rp.num);
    if (!onDisk) {
      report.issues.push({
        severity: 'info',
        kind: 'roadmap-only-phase',
        phase: rp.num,
        message: `Phase ${rp.num} (${rp.name}) is in ROADMAP.md but has no .planning/phases/ dir yet (run \`cp plan-phase ${rp.num}\` to create one).`,
      });
    } else {
      // Per-plan cross-check.
      for (const pl of rp.plans) {
        const planOnDisk = planByPhase[rp.num] && planByPhase[rp.num].find((x) => x.id === pl.id);
        const summaryOnDisk = summaryByPhase[rp.num] && summaryByPhase[rp.num].find((x) => x.id === pl.id);
        if (!planOnDisk) {
          report.issues.push({
            severity: 'warn',
            kind: 'roadmap-plan-no-file',
            phase: rp.num,
            plan: pl.id,
            message: `ROADMAP plan ${pl.id} has no ${pl.id}-PLAN.md on disk.`,
          });
        }
        if (pl.done && !summaryOnDisk) {
          report.issues.push({
            severity: 'warn',
            kind: 'done-plan-no-summary',
            phase: rp.num,
            plan: pl.id,
            message: `ROADMAP plan ${pl.id} is checked done but has no ${pl.id}-SUMMARY.md.`,
          });
        }
      }
    }
  }

  // Disk phases not in ROADMAP:
  for (const dp of report.phases) {
    if (!roadmapPhases.find((rp) => rp.num === dp.num)) {
      report.issues.push({
        severity: 'info',
        kind: 'orphan-phase-dir',
        phase: dp.num,
        message: `Phase dir ${dp.dir} exists but ROADMAP.md has no \`### Phase ${dp.num}:\` entry.`,
      });
    }
  }

  // Plan files whose id doesn't match the phase dir prefix:
  for (const dp of report.phases) {
    const plans = planByPhase[dp.num] || [];
    for (const pl of plans) {
      if (pl.id && !pl.id.startsWith(dp.num + '-') && !pl.id.startsWith(paths.padPhaseNum(dp.num) + '-')) {
        report.issues.push({
          severity: 'warn',
          kind: 'plan-id-prefix-mismatch',
          phase: dp.num,
          plan: pl.id,
          file: `${dp.dir}/${pl.file}`,
          message: `Plan file ${pl.file} sits in phase ${dp.num} but its id (${pl.id}) doesn't share the phase prefix.`,
        });
      }
    }
  }

  // ---------- quick tasks ----------
  const quickDir = path.join(root, '.planning', 'quick');
  if (fs.existsSync(quickDir)) {
    for (const entry of fs.readdirSync(quickDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(quickDir, entry.name);
      const files = fs.readdirSync(dir);
      report.quickTasks.push({
        slug: entry.name,
        hasPlan: files.includes('PLAN.md'),
        hasSummary: files.includes('SUMMARY.md'),
      });
    }
  }

  // ---------- provider resolution ----------
  try {
    const cfg = report.config.parseable
      ? JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      : provider.loadDefaults();
    if (!cfg.cp) cfg.cp = provider.loadDefaults().cp;
    const configured = provider.cpGet(cfg, 'workflow_provider', 'superpowers');
    const det = provider.detectProvider(cfg, configured);
    report.provider.configured = configured;
    report.provider.installed = det.installed;
    if (!det.installed) {
      const manual = provider.detectProvider(cfg, 'manual');
      report.provider.fallback = manual.installed ? 'manual' : null;
    }
  } catch (e) {
    report.issues.push({
      severity: 'info',
      kind: 'provider-resolve',
      message: `Provider resolution skipped: ${e.message}`,
    });
  }

  // ---------- classification ----------
  if (report.cpAware && report.gsdProject) {
    report.classification = 'cp-aware-gsd-superset';
  } else if (report.cpAware) {
    report.classification = 'cp-aware';
  } else if (report.gsdProject) {
    report.classification = 'pure-gsd';
  } else if (report.sentinels.shared['.planning/config.json'] || SHARED_REQUIRED.some((s) => report.sentinels.shared[s])) {
    report.classification = 'planning-shaped-foreign';
  } else {
    report.classification = 'empty-planning';
  }

  // ---------- plan what `cp init` would do ----------
  for (const rel of [
    '.planning/PROJECT.md',
    '.planning/ROADMAP.md',
    '.planning/STATE.md',
    '.planning/MILESTONES.md',
  ]) {
    if (!report.sentinels.shared[rel]) report.plan.wouldCreate.push(rel);
  }
  if (!report.config.present) {
    report.plan.wouldCreate.push('.planning/config.json');
  } else if (!report.config.hasCpBlock && report.config.parseable) {
    report.plan.wouldModify.push('.planning/config.json (add `cp` block; GSD keys preserved)');
  }
  for (const d of ['.planning/phases', '.planning/quick']) {
    if (!fs.existsSync(path.join(root, d))) report.plan.wouldCreate.push(d + '/');
  }

  // ---------- recommendation ----------
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  if (report.classification === 'cp-aware-gsd-superset' || report.classification === 'cp-aware') {
    report.recommendation = errors > 0
      ? `Already cp-aware, but ${errors} parse error(s) need attention before cp can drive workflows safely.`
      : `Already cp-aware. Nothing to import. Run \`cp doctor\` for live provider status.`;
  } else if (report.classification === 'pure-gsd' || report.classification === 'planning-shaped-foreign') {
    const changes = report.plan.wouldCreate.length + report.plan.wouldModify.length;
    report.recommendation = changes === 0
      ? `GSD-shape project; nothing to import (no missing files, no \`cp\` block needed).`
      : `GSD-shape project. \`cp init\` would make ${changes} additive change(s) — no GSD files would be rewritten. Re-run with --apply to perform the import.`;
  } else if (report.classification === 'empty-planning') {
    report.recommendation = `Empty .planning/ — run \`cp init\` (or pass --apply) to scaffold the standard files.`;
  } else {
    report.recommendation = `No recommendation.`;
  }

  return report;
}

/**
 * Render a report to a human-readable multi-line string.
 */
function render(report) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push(`cp gsd-import — audit of ${report.root}`);
  push('='.repeat(Math.min(78, 17 + report.root.length)));
  push('');
  push(`Planning dir:    ${report.planning.present ? 'present' : 'MISSING'} (${report.planning.path})`);
  push(`Classification:  ${prettyClass(report.classification)}`);
  push(`cp-aware:        ${tick(report.cpAware)}`);
  push(`GSD sentinels:   ${report.gsdProject ? 'detected' : 'none'}`);

  if (!report.planning.present) {
    push('');
    push('Plan if you run `cp init`:');
    for (const f of report.plan.wouldCreate) push(`  + ${f}`);
    push('');
    push(`Recommendation:`);
    for (const l of wrap(report.recommendation, 76)) push(`  ${l}`);
    return lines.join('\n') + '\n';
  }

  // Shared / GSD sentinel inventory
  push('');
  push(`Shared files (used by both cp and GSD):`);
  for (const rel of [...SHARED_REQUIRED, ...SHARED_OPTIONAL]) {
    push(`  ${tickFile(report.sentinels.shared[rel])} ${rel}`);
  }
  push('');
  push(`GSD-only sentinels:`);
  for (const rel of compat.GSD_SENTINELS) {
    push(`  ${tickFile(report.sentinels.gsd[rel])} ${rel}`);
  }

  // config.json detail
  push('');
  if (report.config.present) {
    push(`config.json:     parseable=${tick(report.config.parseable)}  cp-block=${tick(report.config.hasCpBlock)}`);
    if (report.config.parseable && report.config.gsdKeys.length > 0) {
      push(`  GSD keys preserved: ${report.config.gsdKeys.join(', ')}`);
    }
  } else {
    push(`config.json:     not present`);
  }

  // Phases inventory
  push('');
  push(`Phases on disk (${report.phases.length}):`);
  if (report.phases.length === 0) {
    push('  — none');
  } else {
    const maxDir = Math.max(...report.phases.map((p) => p.dir.length));
    for (const p of report.phases) {
      const flag = p.shortFormPresent ? '  [short-form!]' : '';
      push(`  ${p.dir.padEnd(maxDir)}  ${p.planCount} plan(s), ${p.summaryCount} summary(ies)${flag}`);
    }
  }

  // Quick tasks
  if (report.quickTasks.length > 0) {
    push('');
    push(`Quick tasks (${report.quickTasks.length}):`);
    for (const q of report.quickTasks) {
      const bits = [];
      if (q.hasPlan) bits.push('PLAN');
      if (q.hasSummary) bits.push('SUMMARY');
      push(`  ${q.slug}  [${bits.join(', ') || 'empty'}]`);
    }
  }

  // Active milestone
  if (report.activeMilestone) {
    push('');
    push(`Active milestone (MILESTONE-CONTEXT.md):`);
    push(`  name:    ${report.activeMilestone.name}`);
    push(`  status:  ${report.activeMilestone.status}`);
  }

  // Provider
  if (report.provider.configured) {
    push('');
    push(`Workflow provider:`);
    const installed = report.provider.installed ? 'installed' : 'NOT installed';
    push(`  configured: ${report.provider.configured} (${installed})`);
    if (!report.provider.installed) {
      push(`  fallback:   ${report.provider.fallback || '(none — provider commands will fail)'}`);
    }
  }

  // Issues
  push('');
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warns = report.issues.filter((i) => i.severity === 'warn');
  const infos = report.issues.filter((i) => i.severity === 'info');
  push(`Issues: ${report.issues.length} (errors: ${errors.length}, warnings: ${warns.length}, info: ${infos.length})`);
  for (const i of [...errors, ...warns, ...infos]) {
    const tag = i.severity === 'error' ? '✗' : i.severity === 'warn' ? '!' : 'i';
    push(`  ${tag} [${i.kind}] ${i.message}`);
  }

  // Plan
  push('');
  push(`Plan if you run \`cp init\` (or this command with --apply):`);
  if (report.plan.wouldCreate.length === 0 && report.plan.wouldModify.length === 0) {
    push(`  (no changes; everything already in place)`);
  } else {
    for (const f of report.plan.wouldCreate) push(`  + create   ${f}`);
    for (const f of report.plan.wouldModify) push(`  ~ modify   ${f}`);
  }

  // Recommendation
  push('');
  push(`Recommendation:`);
  for (const l of wrap(report.recommendation, 76)) push(`  ${l}`);

  return lines.join('\n') + '\n';
}

function prettyClass(c) {
  return {
    'no-planning': 'no .planning/ directory',
    'empty-planning': 'empty .planning/ (no state files yet)',
    'planning-shaped-foreign': 'planning-shaped (not GSD, not cp-aware)',
    'pure-gsd': 'pure GSD project',
    'cp-aware': 'cp-aware (no GSD sentinels)',
    'cp-aware-gsd-superset': 'cp-aware GSD superset (both)',
    unknown: 'unknown',
  }[c] || c;
}

function tick(b) {
  return b ? '✓' : '✗';
}
function tickFile(b) {
  return b ? '✓' : '·';
}
function wrap(text, width) {
  const out = [];
  const words = String(text).split(/\s+/);
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      if (line) out.push(line);
      line = w;
    } else {
      line = (line ? line + ' ' : '') + w;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Convenience exit code: 0 = clean / nothing-to-do, 1 = errors, 2 = changes-pending */
function exitCode(report) {
  if (report.issues.some((i) => i.severity === 'error')) return 1;
  if (report.plan.wouldCreate.length + report.plan.wouldModify.length > 0) return 2;
  return 0;
}

module.exports = { audit, render, exitCode };
