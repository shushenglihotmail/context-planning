'use strict';

/**
 * lib/runtime.js — stateful wave-walker that drives a workflow run end-to-end.
 *
 * For each wave it emits an instruction string for the running agent to consume,
 * then advances state when the agent reports completion. Wires all three binding
 * tiers: milestone, phase, and custom.
 *
 * Open question resolutions (documented per DESIGN.md ask):
 *   - markPhaseComplete accepts summaryText as an argument. The CLI (Phase 41)
 *     reads from stdin and passes it through. Default documented here.
 *   - dryRun: true is implemented on startRun as specified.
 *   - Module named runtime.js (not wave-walker.js) as decided.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const workflow = require('./workflow');
const custom = require('./custom');
const lifecycle = require('./lifecycle');
const paths = require('./paths');
const provider = require('./provider');

// ---------- private helpers ----------

/**
 * Resolve projectDir from opts, defaulting to process.cwd().
 * @param {object} [opts]
 * @returns {string}
 */
function resolveProjectDir(opts) {
  return path.resolve((opts && opts.projectDir) || process.cwd());
}

/**
 * Extract the current time from opts.now or use a new Date.
 * @param {object} [opts]
 * @returns {Date}
 */
function nowFrom(opts) {
  return (opts && opts.now instanceof Date) ? opts.now : new Date();
}

/**
 * Return true if nameOrPath looks like a file-system path (has a separator or
 * ends with .yaml / .yml), so loadTemplate treats it as an explicit path.
 * @param {string} nameOrPath
 * @returns {boolean}
 */
function isPathLike(nameOrPath) {
  return /[/\\]/.test(nameOrPath) || /\.ya?ml$/i.test(nameOrPath);
}

/**
 * Resolve a template name-or-path to an absolute file path.
 * @param {string} nameOrPath
 * @param {string} projectDir
 * @returns {string}
 */
function resolveTemplatePath(nameOrPath, projectDir) {
  if (isPathLike(nameOrPath)) {
    return path.resolve(projectDir, nameOrPath);
  }
  return workflow.resolveTemplate(nameOrPath, {projectDir});
}

/**
 * Linear topological sort of template phases — returns phase objects in
 * dependency order (not wave groupings).
 * @param {Array} phases
 * @returns {Array}
 */
function flatTopoSort(phases) {
  const idToPhase = new Map();
  const indegree = new Map();
  const dependents = new Map();
  for (const p of phases) {
    idToPhase.set(p.id, p);
    indegree.set(p.id, 0);
    dependents.set(p.id, []);
  }
  for (const p of phases) {
    const deps = Array.isArray(p.depends_on) ? p.depends_on : [];
    for (const dep of deps) {
      indegree.set(p.id, indegree.get(p.id) + 1);
      dependents.get(dep).push(p.id);
    }
  }
  const queue = phases
    .filter(function(p) { return indegree.get(p.id) === 0; })
    .map(function(p) { return p.id; });
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(idToPhase.get(id));
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return order;
}

/**
 * Find the next available integer phase number by scanning .planning/phases/.
 * @param {string} projectDir
 * @returns {number}
 */
function nextPhaseNum(projectDir) {
  const phasesRoot = path.join(projectDir, '.planning', 'phases');
  if (!fs.existsSync(phasesRoot)) return 1;
  const entries = fs.readdirSync(phasesRoot);
  let max = 0;
  for (const e of entries) {
    const m = e.match(/^(\d+)-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * Return the absolute path to a milestone RUN.yaml.
 * @param {string} slug
 * @param {string} projectDir
 * @returns {string}
 */
function milestoneRunPath(slug, projectDir) {
  return path.join(projectDir, '.planning', 'milestones', slug, 'RUN.yaml');
}

/**
 * Read and parse a milestone RUN.yaml.
 * @param {string} slug
 * @param {string} projectDir
 * @returns {object}
 */
function readMilestoneRun(slug, projectDir) {
  const p = milestoneRunPath(slug, projectDir);
  if (!fs.existsSync(p)) throw new Error(`Run not found: ${slug}`);
  const parsed = yaml.parse(fs.readFileSync(p, 'utf8'));
  if (!parsed) throw new Error(`Run not found: ${slug}`);
  return parsed;
}

/**
 * Write a milestone RUN.yaml atomically.
 * @param {string} slug
 * @param {object} state
 * @param {string} projectDir
 */
function writeMilestoneRun(slug, state, projectDir) {
  lifecycle.writeFile(milestoneRunPath(slug, projectDir), yaml.stringify(state));
}

/**
 * Search phase dirs for a .workflow-runs/<slug>.yaml and return its path.
 * Returns null if not found.
 * @param {string} slug
 * @param {string} projectDir
 * @returns {string|null}
 */
function findPhaseRunPath(slug, projectDir) {
  const phasesRoot = path.join(projectDir, '.planning', 'phases');
  if (!fs.existsSync(phasesRoot)) return null;
  for (const entry of fs.readdirSync(phasesRoot)) {
    const p = path.join(phasesRoot, entry, '.workflow-runs', `${slug}.yaml`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Detect which binding tier owns the run and load its state.
 * Tries quick (custom) → phase → milestone in that order.
 * @param {string} slug
 * @param {object} [opts]
 * @returns {{ binding: string, state: object, runPath?: string, projectDir: string }}
 */
function resolveBinding(slug, opts) {
  const projectDir = resolveProjectDir(opts);
  // 1. quick (formerly 'custom' — readState transparently falls back to
  //    legacy .planning/custom/ for back-compat. 51-03.)
  try {
    const state = custom.readState(slug, {projectDir});
    if (state) return {binding: 'quick', state, projectDir};
  } catch (_) {}
  // 2. phase
  const phaseRunPath = findPhaseRunPath(slug, projectDir);
  if (phaseRunPath) {
    const state = yaml.parse(fs.readFileSync(phaseRunPath, 'utf8'));
    if (state) return {binding: 'phase', state, runPath: phaseRunPath, projectDir};
  }
  // 3. milestone
  try {
    const state = readMilestoneRun(slug, projectDir);
    if (state) return {binding: 'milestone', state, projectDir};
  } catch (_) {}
  throw new Error(`Run not found: ${slug}`);
}

/**
 * Parse the ## Constraints section from PROJECT.md.
 * @param {string} projectDir
 * @returns {string[]}
 */
function readConstraints(projectDir) {
  const mdPath = path.join(projectDir, '.planning', 'PROJECT.md');
  if (!fs.existsSync(mdPath)) return [];
  let content;
  try { content = fs.readFileSync(mdPath, 'utf8'); } catch (_) { return []; }
  const lines = content.split('\n');
  let inConstraints = false;
  const items = [];
  for (const line of lines) {
    if (/^##\s+Constraints\s*$/.test(line)) {
      inConstraints = true;
      continue;
    }
    if (inConstraints) {
      if (/^##\s+/.test(line)) break;
      const trimmed = line.trim();
      if (!trimmed) continue;
      const text = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (text) items.push(text);
    }
  }
  return items;
}

// ---------- public API ----------

/**
 * Resolve a phase's `skill:` field via the active workflow provider.
 *
 * Returns `{name, source}` where source is one of:
 *   - "absent"       — phase has no skill field
 *   - "routing-key"  — skill matched a routing key in the active provider's
 *                     skills map; name is the resolved provider skill name
 *                     (via provider.resolveSkill, which also handles the
 *                     fall-back-to-manual logic)
 *   - "pinned"       — skill is already a literal provider skill name (i.e.
 *                     it appears as a *value* in some provider's skills map);
 *                     used as-is, no lookup
 *   - "pass-through" — skill is neither a routing key nor a known literal;
 *                     emitted as-is. A warning is pushed to opts.warningsOut
 *                     if provided.
 *
 * @param {string|null|undefined} phaseSkill
 * @param {object} [opts] - { projectDir, warningsOut }
 * @returns {{name: (string|null), source: string}}
 */
function resolvePhaseSkill(phaseSkill, opts) {
  if (phaseSkill == null || phaseSkill === '') {
    return { name: null, source: 'absent' };
  }
  const projectDir = (opts && opts.projectDir) || process.cwd();
  let cfg;
  try {
    cfg = provider.loadConfig(projectDir);
  } catch (_e) {
    cfg = provider.loadDefaults();
  }
  const providers = (cfg && cfg.cp && cfg.cp.providers) || {};
  const activeName = (cfg && cfg.cp && cfg.cp.workflow_provider) || 'superpowers';
  const activeSkills = (providers[activeName] && providers[activeName].skills) || {};

  // Routing key under the active provider?
  if (Object.prototype.hasOwnProperty.call(activeSkills, phaseSkill)) {
    const resolved = provider.resolveSkill(phaseSkill, projectDir);
    const name = (resolved && resolved.skill) || phaseSkill;
    return { name, source: 'routing-key' };
  }

  // Literal/pinned skill name — appears as a value in any provider's map?
  for (const provName of Object.keys(providers)) {
    const skills = (providers[provName] && providers[provName].skills) || {};
    for (const k of Object.keys(skills)) {
      if (skills[k] === phaseSkill) {
        return { name: phaseSkill, source: 'pinned' };
      }
    }
  }

  // Unknown — pass through with a warning.
  if (opts && Array.isArray(opts.warningsOut)) {
    opts.warningsOut.push(
      `Unknown skill "${phaseSkill}" — not a routing key for provider "${activeName}" ` +
      `and not a registered provider skill name. Passing through as-is.`
    );
  }
  return { name: phaseSkill, source: 'pass-through' };
}

/**
 * Format the instruction string for a single wave.
 *
 * Format (per DESIGN.md contract):
 *   Global directives (apply to every phase of this workflow):
 *     Project constraints: ...
 *     Workflow principles: ...
 *   Wave N of M — K phase(s) to execute:
 *   [parallel] Dispatch ... (only when K > 1)
 *   Phase: <id>
 *     role:  ...
 *     ...
 *   When all phases in this wave are complete, run:
 *     cp run mark-complete <slug> <phase-id> < summary.md
 *
 * @param {object} template - loaded workflow template
 * @param {Array}  wave      - array of phase objects for this wave
 * @param {number} waveIndex - 0-based index
 * @param {object} [opts]   - { projectDir, slug, totalWaves }
 * @returns {string}
 */
function formatInstruction(template, wave, waveIndex, opts) {
  const projectDir = resolveProjectDir(opts);
  const slug = (opts && opts.slug != null) ? opts.slug : '(unknown-slug)';
  const totalWaves = (opts && opts.totalWaves != null) ? opts.totalWaves : 1;

  const constraints = readConstraints(projectDir);
  const principles = Array.isArray(template.principles) ? template.principles : [];

  const lines = [];

  // Global directives preamble (omit entirely when both absent)
  if (constraints.length > 0 || principles.length > 0) {
    lines.push('Global directives (apply to every phase of this workflow):');
    if (constraints.length > 0) {
      lines.push('  Project constraints:');
      for (let i = 0; i < constraints.length; i++) {
        lines.push(`    ${i + 1}. ${constraints[i]}`);
      }
    }
    if (principles.length > 0) {
      lines.push('  Workflow principles:');
      for (let i = 0; i < principles.length; i++) {
        lines.push(`    ${i + 1}. ${principles[i]}`);
      }
    }
    lines.push('');
  }

  // Wave header
  const waveNum = waveIndex + 1;
  const phaseCount = wave.length;
  lines.push(`Wave ${waveNum} of ${totalWaves} — ${phaseCount} phase(s) to execute:`);
  lines.push('');

  // v1.6 D2: one-time contract legend before per-phase blocks. The verb
  // "invoke" on the per-phase skill line carries an imperative; this
  // legend states once per wave what it means. Verbose mode keeps the
  // legacy `skill: <name> (source: …)` provenance for debugging instead.
  const verbose = !!(opts && opts.verbose);
  if (!verbose) {
    lines.push('[contract] For each phase below:');
    lines.push("  'invoke skill: <name>'  → call that skill via your harness's skill tool now;");
    lines.push('                            do NOT perform the phase inline.');
    lines.push("  'skill: (none)'         → no skill is routed; follow the prompt inline.");
    lines.push('');
    lines.push('  If the named skill is unavailable in your harness (not installed, not');
    lines.push('  loadable), fall back to inline execution using the prompt — and tell the');
    lines.push('  user which skill was missing so they can install it or adjust routing.');
    lines.push('');
  }

  // Parallel dispatch header (only when wave has >1 phase)
  if (phaseCount > 1) {
    lines.push(`[parallel] Dispatch the following ${phaseCount} phases concurrently using your harness's`);
    lines.push('           Task tool (subagents, multiple CLI instances — your choice):');
    lines.push('');
  }

  // Per-phase blocks
  const skillWarnings = [];
  for (const phase of wave) {
    const role = (phase.role != null) ? phase.role : '(absent)';
    const model = (phase.model != null) ? phase.model : '(absent)';
    const resolvedSkill = resolvePhaseSkill(phase.skill, {
      projectDir,
      warningsOut: skillWarnings,
    });
    let skillLine;
    if (verbose) {
      // Legacy provenance-annotated format for routing debugging.
      skillLine = resolvedSkill.source === 'absent'
        ? '(absent)'
        : `${resolvedSkill.name} (source: ${resolvedSkill.source})`;
    } else {
      // v1.6 D2 directive format (default).
      skillLine = resolvedSkill.source === 'absent'
        ? '(none)'
        : `${resolvedSkill.name}`;
    }
    const persist = (phase.persist_output != null) ? phase.persist_output : '(absent)';
    const promptText = (phase.prompt != null) ? String(phase.prompt) : '';

    lines.push(`Phase: ${phase.id}`);
    lines.push(`  role:  ${role}`);
    lines.push(`  model: ${model}`);
    if (!verbose && resolvedSkill.source !== 'absent') {
      lines.push(`  invoke skill: ${skillLine}`);
    } else {
      lines.push(`  skill: ${skillLine}`);
    }
    lines.push(`  persist_output: ${persist}`);
    lines.push('  prompt: |');

    const promptLines = promptText.split('\n');
    // Strip trailing empty string from trailing newline in YAML literal block
    if (promptLines.length > 0 && promptLines[promptLines.length - 1] === '') {
      promptLines.pop();
    }
    for (const pl of promptLines) {
      lines.push(`    ${pl}`);
    }
    lines.push('');
  }

  // Closing instruction (one line per phase)
  lines.push('When all phases in this wave are complete, run:');
  for (const phase of wave) {
    lines.push(`  cp run mark-complete ${slug} ${phase.id} < summary.md`);
  }

  // Surface skill-resolution warnings on stderr so workflow authors notice
  // typos in `skill:` fields. Silenced when opts.silenceWarnings is true
  // (used by tests).
  if (skillWarnings.length > 0 && !(opts && opts.silenceWarnings)) {
    for (const w of skillWarnings) {
      try { process.stderr.write(`! cp runtime: ${w}\n`); } catch (_e) { /* ignore */ }
    }
  }

  return lines.join('\n');
}

/**
 * Start a new workflow run.
 *
 * @param {string} templateNameOrPath
 * @param {object} [opts] - { name, projectDir, dryRun, now }
 * @returns {{ slug, binding, firstInstruction, template, waves }}
 */
function startRun(templateNameOrPath, opts) {
  const o = opts || {};
  const projectDir = resolveProjectDir(o);
  const now = nowFrom(o);

  // 1. Load and validate template
  const tpl = workflow.loadTemplate(templateNameOrPath, {projectDir});
  workflow.applyAutoInjectFinalize(tpl);
  const validation = workflow.validate(tpl);
  if (!validation.ok) {
    throw new Error(`Workflow template invalid: ${validation.errors.join('; ')}`);
  }
  for (const w of validation.warnings) {
    console.warn(`[cp runtime] ${w}`);
  }

  // 2. Compute waves
  const waves = workflow.computeWaves(tpl);

  // 3. Resolve template path for storage
  const resolvedPath = resolveTemplatePath(templateNameOrPath, projectDir);

  // 51-03: Normalize 'custom' alias to 'quick'. Workflow loader already does
  // this but be defensive against templates loaded outside the loader.
  let binding = tpl.meta.binds_to || 'quick';
  if (binding === 'custom') binding = 'quick';

  // Dry-run: compute everything, do NOT mutate state
  if (o.dryRun) {
    const drySlug = `${tpl.meta.workflow}-dryrun`;
    const wavesWithInstructions = waves.map(function(wave, i) {
      return {
        phases: wave,
        instruction: formatInstruction(tpl, wave, i, {projectDir, slug: drySlug, totalWaves: waves.length, verbose: o.verbose}),
      };
    });
    const firstInstruction = wavesWithInstructions.length > 0
      ? wavesWithInstructions[0].instruction
      : '';
    return {slug: drySlug, binding, firstInstruction, template: tpl, waves: wavesWithInstructions, dryRun: true};
  }

  let slug;

  if (binding === 'quick') {
    slug = custom.createRun(tpl.meta.workflow, o.name, {projectDir, now});
    custom.writeState(slug, {template_path: resolvedPath, current_wave: 0}, {projectDir, now});

  } else if (binding === 'milestone') {
    if (!o.name || typeof o.name !== 'string' || !o.name.trim()) {
      throw new Error('milestone binding requires opts.name — cannot scaffold a nameless milestone');
    }
    const msResult = lifecycle.scaffoldMilestone(projectDir, o.name);
    if (!msResult.ok) {
      if (msResult.reason === 'milestone-exists') {
        throw new Error(`Milestone already exists: ${o.name}. Use resumeRun(slug).`);
      }
      throw new Error(`scaffoldMilestone failed: ${msResult.reason}`);
    }

    slug = paths.milestoneSlug(o.name);

    // Scaffold phases in flat topo order (not wave order)
    const flatOrder = flatTopoSort(tpl.phases);
    const phaseNumByPhaseId = {};
    let phaseCounter = nextPhaseNum(projectDir);
    for (const phase of flatOrder) {
      const result = lifecycle.scaffoldPhase(projectDir, phaseCounter, {
        name: phase.id,
        force: true,
        milestone: o.name,
      });
      if (!result.ok) {
        throw new Error(`scaffoldPhase failed for ${phase.id}: ${result.reason}`);
      }
      phaseNumByPhaseId[phase.id] = phaseCounter;
      phaseCounter++;
    }

    // Write RUN.yaml into the milestone dir (created by scaffoldMilestone)
    const runState = {
      workflow: tpl.meta.workflow,
      slug,
      status: 'in-progress',
      binding: 'milestone',
      started: now.toISOString(),
      last_activity: now.toISOString(),
      current_wave: 0,
      completed: [],
      phaseNumByPhaseId,
      template_path: resolvedPath,
    };
    writeMilestoneRun(slug, runState, projectDir);

  } else if (binding === 'phase') {
    const status = lifecycle.statusReport(projectDir);
    if (!status || !status.ok) {
      throw new Error('phase binding requires an active phase; none found in STATE.md/ROADMAP.');
    }
    let activePhaseNum = null;
    if (status.nextPlan) {
      activePhaseNum = status.nextPlan.phaseNum;
    } else if (status.phases && status.phases.length > 0) {
      activePhaseNum = status.phases[status.phases.length - 1].num;
    }
    if (activePhaseNum === null || activePhaseNum === undefined) {
      throw new Error('phase binding requires an active phase; none found in STATE.md/ROADMAP.');
    }

    const phaseDirPath = paths.findPhaseDir(String(activePhaseNum), projectDir);
    if (!phaseDirPath) {
      throw new Error('phase binding requires an active phase; none found in STATE.md/ROADMAP.');
    }

    // Slug: <workflow>-phase<NN>-<HHMM>
    const paddedPhase = paths.padPhaseNum(String(activePhaseNum));
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    slug = `${tpl.meta.workflow}-phase${paddedPhase}-${hh}${mm}`;

    // Append workflow run section to phase's PLAN.md
    const planMdPath = path.join(phaseDirPath, 'PLAN.md');
    if (fs.existsSync(planMdPath)) {
      const existing = fs.readFileSync(planMdPath, 'utf8');
      const section = `\n## Workflow run: ${tpl.meta.workflow} (${slug})\n${now.toISOString()}\n`;
      lifecycle.writeFile(planMdPath, existing + section);
    }

    // Write RUN.yaml under .workflow-runs/
    const runPath = path.join(phaseDirPath, '.workflow-runs', `${slug}.yaml`);
    const runState = {
      workflow: tpl.meta.workflow,
      slug,
      status: 'in-progress',
      binding: 'phase',
      started: now.toISOString(),
      last_activity: now.toISOString(),
      current_wave: 0,
      completed: [],
      phaseNum: activePhaseNum,
      template_path: resolvedPath,
    };
    lifecycle.writeFile(runPath, yaml.stringify(runState));

  } else {
    throw new Error(`Unknown binding: ${binding}`);
  }

  const firstInstruction = formatInstruction(tpl, waves[0], 0, {
    projectDir, slug, totalWaves: waves.length, verbose: o.verbose,
  });
  return {slug, binding, firstInstruction, template: tpl, waves};
}

/**
 * Resume an in-progress run by looking up its state and re-emitting the
 * current wave's instruction.
 *
 * @param {string} slug
 * @param {object} [opts]
 * @returns {{ currentWave: number, instruction: string, template, binding }}
 */
function resumeRun(slug, opts) {
  const o = opts || {};
  const projectDir = resolveProjectDir(o);
  const bound = resolveBinding(slug, o);
  const {binding, state} = bound;

  const tpl = workflow.loadTemplate(state.template_path, {projectDir});
  workflow.applyAutoInjectFinalize(tpl);
  const waves = workflow.computeWaves(tpl);

  const currentWave = state.current_wave || 0;
  const waveIdx = Math.min(currentWave, waves.length - 1);
  const instruction = formatInstruction(tpl, waves[waveIdx], waveIdx, {
    projectDir, slug, totalWaves: waves.length, verbose: o.verbose,
  });

  return {currentWave, instruction, template: tpl, binding};
}

/**
 * Mark a phase as complete, write its summary, and advance the wave state
 * if all phases in the current wave are now done.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {string} summaryText - summary content (the CLI reads from stdin and passes here)
 * @param {object} [opts]
 * @returns {{ nextInstruction: string|null, doneAfter: boolean, wave: number }}
 */
function markPhaseComplete(slug, phaseId, summaryText, opts) {
  const o = opts || {};
  const projectDir = resolveProjectDir(o);
  const now = nowFrom(o);

  const bound = resolveBinding(slug, o);
  const {binding, state, runPath} = bound;

  const tpl = workflow.loadTemplate(state.template_path, {projectDir});
  workflow.applyAutoInjectFinalize(tpl);
  const waves = workflow.computeWaves(tpl);

  const currentWaveIdx = state.current_wave || 0;
  if (currentWaveIdx >= waves.length) {
    throw new Error(`Run is already complete (wave ${currentWaveIdx} >= total ${waves.length})`);
  }
  const currentWave = waves[currentWaveIdx];
  const waveIds = currentWave.map(function(p) { return p.id; });

  if (!waveIds.includes(phaseId)) {
    throw new Error(`Phase ${phaseId} not in current wave (current: ${waveIds.join(', ')})`);
  }

  if (binding === 'quick') {
    // writePhaseSummary also appends phaseId to completed[] in STATE.yaml
    custom.writePhaseSummary(slug, phaseId, summaryText, {projectDir, now});
    const updatedState = custom.readState(slug, {projectDir});
    const completed = Array.isArray(updatedState.completed) ? updatedState.completed : [];
    const waveComplete = waveIds.every(function(id) { return completed.includes(id); });

    if (waveComplete) {
      const nextWaveIdx = currentWaveIdx + 1;
      const isDone = nextWaveIdx >= waves.length;
      custom.writeState(slug, {
        current_wave: nextWaveIdx,
        status: isDone ? 'done' : 'in-progress',
      }, {projectDir, now});
      if (isDone) {
        return {nextInstruction: null, doneAfter: true, wave: currentWaveIdx};
      }
      const nextInstruction = formatInstruction(tpl, waves[nextWaveIdx], nextWaveIdx, {
        projectDir, slug, totalWaves: waves.length,
      });
      return {nextInstruction, doneAfter: false, wave: currentWaveIdx};
    }
    return {nextInstruction: null, doneAfter: false, wave: currentWaveIdx};

  } else if (binding === 'phase') {
    // runPath: .planning/phases/NN-name/.workflow-runs/slug.yaml
    const wfRunDir = path.dirname(runPath);
    const phaseDirPath = path.dirname(wfRunDir);
    const phaseSummaryPath = path.join(phaseDirPath, 'SUMMARY.md');

    let existingContent = '';
    try { existingContent = fs.readFileSync(phaseSummaryPath, 'utf8'); } catch (_) {}
    const summarySection =
      `\n## Workflow phase: ${phaseId} (run ${slug})\n\n${summaryText}\n`;
    lifecycle.writeFile(phaseSummaryPath, existingContent + summarySection);

    const completed = Array.isArray(state.completed) ? state.completed.slice() : [];
    if (!completed.includes(phaseId)) completed.push(phaseId);
    const waveComplete = waveIds.every(function(id) { return completed.includes(id); });
    const nextWaveIdx = waveComplete ? currentWaveIdx + 1 : currentWaveIdx;
    const isDone = waveComplete && nextWaveIdx >= waves.length;
    const updatedState = Object.assign({}, state, {
      completed,
      current_wave: nextWaveIdx,
      status: isDone ? 'done' : 'in-progress',
      last_activity: now.toISOString(),
    });
    lifecycle.writeFile(runPath, yaml.stringify(updatedState));

    if (waveComplete) {
      if (isDone) return {nextInstruction: null, doneAfter: true, wave: currentWaveIdx};
      const nextInstruction = formatInstruction(tpl, waves[nextWaveIdx], nextWaveIdx, {
        projectDir, slug, totalWaves: waves.length,
      });
      return {nextInstruction, doneAfter: false, wave: currentWaveIdx};
    }
    return {nextInstruction: null, doneAfter: false, wave: currentWaveIdx};

  } else {
    // milestone binding
    const phaseNumByPhaseId = state.phaseNumByPhaseId || {};
    const phaseNum = phaseNumByPhaseId[phaseId];
    if (phaseNum != null) {
      const phaseDirPath = paths.findPhaseDir(String(phaseNum), projectDir);
      if (phaseDirPath) {
        lifecycle.writeFile(path.join(phaseDirPath, 'SUMMARY.md'), summaryText);
      }
    }

    const completed = Array.isArray(state.completed) ? state.completed.slice() : [];
    if (!completed.includes(phaseId)) completed.push(phaseId);
    const waveComplete = waveIds.every(function(id) { return completed.includes(id); });
    const nextWaveIdx = waveComplete ? currentWaveIdx + 1 : currentWaveIdx;
    const isDone = waveComplete && nextWaveIdx >= waves.length;
    const updatedState = Object.assign({}, state, {
      completed,
      current_wave: nextWaveIdx,
      status: isDone ? 'done' : 'in-progress',
      last_activity: now.toISOString(),
    });
    writeMilestoneRun(slug, updatedState, projectDir);

    if (waveComplete) {
      if (isDone) return {nextInstruction: null, doneAfter: true, wave: currentWaveIdx};
      const nextInstruction = formatInstruction(tpl, waves[nextWaveIdx], nextWaveIdx, {
        projectDir, slug, totalWaves: waves.length,
      });
      return {nextInstruction, doneAfter: false, wave: currentWaveIdx};
    }
    return {nextInstruction: null, doneAfter: false, wave: currentWaveIdx};
  }
}

/**
 * Re-open a phase for retry: remove it from completed[], roll back
 * current_wave if needed, and re-emit the wave's instruction.
 *
 * @param {string} slug
 * @param {string} phaseId
 * @param {object} [opts]
 * @returns {{ instruction: string, wave: number }}
 */
function retryPhase(slug, phaseId, opts) {
  const o = opts || {};
  const projectDir = resolveProjectDir(o);
  const now = nowFrom(o);

  const bound = resolveBinding(slug, o);
  const {binding, state, runPath} = bound;

  const tpl = workflow.loadTemplate(state.template_path, {projectDir});
  workflow.applyAutoInjectFinalize(tpl);
  const waves = workflow.computeWaves(tpl);

  // Find which wave contains phaseId so we can roll back to it
  let phaseWaveIdx = -1;
  for (let i = 0; i < waves.length; i++) {
    if (waves[i].some(function(p) { return p.id === phaseId; })) {
      phaseWaveIdx = i;
      break;
    }
  }
  if (phaseWaveIdx === -1) {
    throw new Error(`Phase ${phaseId} not found in template ${state.template_path}`);
  }

  const currentWaveIdx = state.current_wave || 0;
  // If we have already advanced past this phase's wave, roll back
  const newWaveIdx = Math.min(currentWaveIdx, phaseWaveIdx);

  const completed = Array.isArray(state.completed)
    ? state.completed.filter(function(id) { return id !== phaseId; })
    : [];

  if (binding === 'quick') {
    custom.writeState(slug, {
      completed,
      current_wave: newWaveIdx,
      status: 'in-progress',
    }, {projectDir, now});
  } else if (binding === 'phase') {
    const updatedState = Object.assign({}, state, {
      completed,
      current_wave: newWaveIdx,
      status: 'in-progress',
      last_activity: now.toISOString(),
    });
    lifecycle.writeFile(runPath, yaml.stringify(updatedState));
  } else {
    const updatedState = Object.assign({}, state, {
      completed,
      current_wave: newWaveIdx,
      status: 'in-progress',
      last_activity: now.toISOString(),
    });
    writeMilestoneRun(slug, updatedState, projectDir);
  }

  const instruction = formatInstruction(tpl, waves[phaseWaveIdx], phaseWaveIdx, {
    projectDir, slug, totalWaves: waves.length,
  });
  return {instruction, wave: phaseWaveIdx};
}

/**
 * Mark a run as abandoned. For milestone binding, only the RUN.yaml is
 * touched — the milestone itself is left in-progress for the user to manage.
 *
 * @param {string} slug
 * @param {object} [opts]
 * @returns {{ status: 'abandoned' }}
 */
function abandonRun(slug, opts) {
  const o = opts || {};
  const projectDir = resolveProjectDir(o);
  const now = nowFrom(o);

  const bound = resolveBinding(slug, o);
  const {binding, state, runPath} = bound;

  if (binding === 'quick') {
    custom.writeState(slug, {status: 'abandoned'}, {projectDir, now});
  } else if (binding === 'phase') {
    const updatedState = Object.assign({}, state, {
      status: 'abandoned',
      last_activity: now.toISOString(),
    });
    lifecycle.writeFile(runPath, yaml.stringify(updatedState));
  } else {
    // milestone: touch only RUN.yaml, not the milestone heading in ROADMAP.md
    const updatedState = Object.assign({}, state, {
      status: 'abandoned',
      last_activity: now.toISOString(),
    });
    writeMilestoneRun(slug, updatedState, projectDir);
  }

  return {status: 'abandoned'};
}

module.exports = {
  startRun,
  resumeRun,
  markPhaseComplete,
  retryPhase,
  abandonRun,
  formatInstruction,
  resolvePhaseSkill,
};
