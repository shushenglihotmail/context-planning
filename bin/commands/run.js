'use strict';

/**
 * cp run — thin CLI wrapper over lib/runtime.js + lib/custom.js.
 *
 * Dispatches to 6 sub-handlers:
 *   run <workflow> [name]   – start a new workflow run
 *   resume <slug>           – re-emit the current wave's instruction
 *   retry <slug> <phase>    – roll back a phase and re-emit its wave
 *   abandon <slug>          – mark a run abandoned (with confirm prompt)
 *   mark-complete <slug> <phase>  – mark a phase done, read summary from stdin
 *   status [slug]           – show one run or list all active runs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const yaml = require('yaml');
const runtime = require('../../lib/runtime');
const custom = require('../../lib/custom');
const wfLib = require('../../lib/workflow');

// ---------- help ----------

var USAGE = [
  'cp run <subcommand>',
  '',
  'Run and manage workflow template instances.',
  '',
  'Subcommands:',
  '  cp run <workflow> [name]              Start a new run.',
  '                                        --plan-only   Print waves without mutating state.',
  '                                        --verbose     Include skill `(source: …)` provenance.',
  '  cp run resume <slug>                  Resume a paused/in-progress run.',
  '                                        --verbose     Include skill `(source: …)` provenance.',
  '  cp run retry <slug> <phase-id>        Retry a phase (rolls back wave if needed).',
  '  cp run abandon <slug> [--yes]         Mark a run abandoned.',
  '  cp run mark-complete <slug> <phase-id>',
  '                                        Mark a phase complete. Reads summary from stdin:',
  '                                          cp run mark-complete <slug> <phase> < summary.md',
  '  cp run status [slug]                  Show one run\'s state or list all active runs.',
  '                                        --json        Machine-readable output.',
  '  cp run state <slug>                   Print supervised-run state.json (read-only).',
  '                                        --json        Machine-readable output (default for state).',
  '  cp run state get <slug> <path>        Get a value at a dot-path from state.json.',
  '  cp run state set <slug> <path> <val>  Set a value at a dot-path (val parsed as JSON, fallback string).',
  '  cp run state append <slug> <path> <val>',
  '                                        Append a value to an array at a dot-path.',
  '',
  'Common flags:',
  '  --projectDir <path>                   Override cwd (rare).',
  '',
].join('\n');

function printHelp() {
  console.log(USAGE);
}

// ---------- internal helpers ----------

/**
 * Print a short list of active runs to stderr (used in "not found" errors).
 * @param {{ projectDir?: string }} [opts]
 */
function listActiveRuns(opts) {
  var runs = [];
  try {
    runs = custom.listRuns(opts);
  } catch (_) {}
  if (runs.length === 0) {
    process.stderr.write('  (no active quick runs found)\n');
    return;
  }
  process.stderr.write('Active runs:\n');
  for (var i = 0; i < runs.length; i++) {
    process.stderr.write('  ' + runs[i].slug + '  (' + runs[i].workflow + ')  ' + runs[i].status + '\n');
  }
}

/**
 * Resolve run state from all three binding tiers (read-only, for status display).
 * @param {string} slug
 * @param {string} projectDir
 * @returns {{ binding: string, state: object }|null}
 */
function resolveRunState(slug, projectDir) {
  var pd = projectDir || process.cwd();

  // 1. quick (formerly custom — readState transparently falls back to legacy .planning/custom/)
  try {
    var st = custom.readState(slug, {projectDir: pd});
    if (st) return {binding: 'quick', state: st};
  } catch (_) {}

  // 2. phase — walk .planning/phases/*/.workflow-runs/<slug>.yaml
  var phasesRoot = path.join(pd, '.planning', 'phases');
  if (fs.existsSync(phasesRoot)) {
    var phaseEntries;
    try { phaseEntries = fs.readdirSync(phasesRoot); } catch (_) { phaseEntries = []; }
    for (var i = 0; i < phaseEntries.length; i++) {
      var runFile = path.join(phasesRoot, phaseEntries[i], '.workflow-runs', slug + '.yaml');
      if (fs.existsSync(runFile)) {
        try {
          var parsed = yaml.parse(fs.readFileSync(runFile, 'utf8'));
          if (parsed) return {binding: 'phase', state: parsed};
        } catch (_) {}
      }
    }
  }

  // 3. milestone — .planning/milestones/<slug>/RUN.yaml
  var msRun = path.join(pd, '.planning', 'milestones', slug, 'RUN.yaml');
  if (fs.existsSync(msRun)) {
    try {
      var msParsed = yaml.parse(fs.readFileSync(msRun, 'utf8'));
      if (msParsed) return {binding: 'milestone', state: msParsed};
    } catch (_) {}
  }

  return null;
}

/**
 * Safely compute the total wave count for a template.
 * Returns '?' if the template cannot be loaded/parsed.
 * @param {object} template - already-loaded template object
 * @returns {number|string}
 */
function totalWaves(template) {
  try {
    return wfLib.computeWaves(template).length;
  } catch (_) {
    return '?';
  }
}

// ---------- sub-handlers ----------

/**
 * cp run <workflow> [name] [--plan-only] [--projectDir <path>]
 */
function runStart(args) {
  var workflowArg = null;
  var name = null;
  var planOnly = false;
  var projectDir = null;
  var verbose = false;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--plan-only') { planOnly = true; }
    else if (a === '--verbose') { verbose = true; }
    else if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!workflowArg) { workflowArg = a; }
    else if (!name) { name = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  if (!workflowArg) {
    printHelp();
    process.exit(2);
  }

  // Pre-flight: load template to check binding and detect in-progress duplicates.
  var preTpl;
  try {
    preTpl = wfLib.loadTemplate(workflowArg, {projectDir: projectDir || process.cwd()});
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:')) {
      var m = msg.match(/^Template not found: (.+?)\. Searched: (.+)$/);
      if (m) {
        console.error('error: template "' + m[1] + '" not found. Searched: ' + m[2]);
      } else {
        console.error('error: ' + msg);
      }
      console.error('  (Use `cp workflow ls` to list available templates.)');
      process.exit(3);
    }
    if (e.code === 'ENOENT') {
      console.error('error: template "' + workflowArg + '" not found.');
      console.error('  (Use `cp workflow ls` to list available templates.)');
      process.exit(3);
    }
    // Validation / parse errors surface later from startRun — rethrow for now.
    // They'll be caught in the startRun try/catch below.
    preTpl = null;
  }

  // Check for milestone-bound without name.
  if (preTpl && preTpl.meta && preTpl.meta.binds_to === 'milestone') {
    if (!name || !String(name).trim()) {
      console.error('error: milestone-bound workflows require a run name (cp run ' + workflowArg + ' <name>)');
      process.exit(2);
    }
  }

  // Check for already-in-progress quick run with the same workflow name.
  // (binds_to: 'custom' is a deprecated alias for 'quick'.)
  if (preTpl && (!preTpl.meta.binds_to ||
                 preTpl.meta.binds_to === 'quick' ||
                 preTpl.meta.binds_to === 'custom')) {
    var wfName = preTpl.meta.workflow;
    var existing = [];
    try { existing = custom.listRuns({projectDir: projectDir}); } catch (_) {}
    var inProgress = existing.filter(function(r) {
      return r.status === 'in-progress' && r.workflow === wfName;
    });
    if (inProgress.length > 0) {
      var conflictSlug = inProgress[0].slug;
      console.error(
        'error: run "' + conflictSlug + '" already in progress. ' +
        "Use 'cp run resume " + conflictSlug + "' or 'cp run abandon " + conflictSlug + "'."
      );
      process.exit(1);
    }
  }

  var result;
  try {
    result = runtime.startRun(workflowArg, {name: name, dryRun: planOnly, projectDir: projectDir, verbose: verbose});
  } catch (e) {
    var emsg = e.message || String(e);
    if (emsg.startsWith('Template not found:')) {
      var em = emsg.match(/^Template not found: (.+?)\. Searched: (.+)$/);
      if (em) {
        console.error('error: template "' + em[1] + '" not found. Searched: ' + em[2]);
      } else {
        console.error('error: ' + emsg);
      }
      console.error('  (Use `cp workflow ls` to list available templates.)');
      process.exit(3);
    }
    if (emsg.startsWith('Workflow template invalid:') || emsg.startsWith('Invalid workflow template:')) {
      var rawErrors = emsg.replace(/^(Workflow template invalid|Invalid workflow template): /, '');
      var errors = rawErrors.split('; ');
      console.error('error: template has validation errors:');
      for (var ei = 0; ei < errors.length; ei++) {
        console.error('  - ' + errors[ei]);
      }
      console.error('  (Use `cp workflow validate ' + workflowArg + '` to inspect.)');
      process.exit(2);
    }
    if (emsg.includes('milestone binding requires opts.name') ||
        emsg.includes('requires a run name') ||
        emsg.includes('nameless milestone')) {
      console.error('error: milestone-bound workflows require a run name (cp run ' + workflowArg + ' <name>)');
      process.exit(2);
    }
    if (e.code === 'ENOENT') {
      console.error('error: template "' + workflowArg + '" not found.');
      process.exit(3);
    }
    console.error('error: ' + emsg);
    process.exit(1);
  }

  if (planOnly) {
    var instructions = result.waves.map(function(w) { return w.instruction; });
    process.stdout.write(instructions.join('\n---\n') + '\n');
    return;
  }

  process.stderr.write('slug: ' + result.slug + '\n');
  process.stdout.write(result.firstInstruction + '\n');
}

/**
 * cp run resume <slug> [--projectDir <path>]
 */
function runResume(args) {
  var slug = null;
  var projectDir = null;
  var verbose = false;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a === '--verbose') { verbose = true; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!slug) { slug = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  if (!slug) {
    console.error('Usage: cp run resume <slug> [--projectDir <path>]');
    process.exit(2);
  }

  var result;
  try {
    result = runtime.resumeRun(slug, {projectDir: projectDir, verbose: verbose});
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Run not found:')) {
      console.error('error: run "' + slug + '" not found.');
      listActiveRuns({projectDir: projectDir});
      process.exit(4);
    }
    console.error('error: ' + msg);
    process.exit(1);
  }

  var total = totalWaves(result.template);
  process.stdout.write(result.instruction + '\n');
  process.stderr.write('slug: ' + slug + '; wave: ' + (result.currentWave + 1) + ' of ' + total + '\n');
}

/**
 * cp run retry <slug> <phase-id> [--projectDir <path>]
 */
function runRetry(args) {
  var slug = null;
  var phaseId = null;
  var projectDir = null;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!slug) { slug = a; }
    else if (!phaseId) { phaseId = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  if (!slug || !phaseId) {
    console.error('Usage: cp run retry <slug> <phase-id> [--projectDir <path>]');
    process.exit(2);
  }

  var result;
  try {
    result = runtime.retryPhase(slug, phaseId, {projectDir: projectDir});
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Run not found:')) {
      console.error('error: run "' + slug + '" not found.');
      listActiveRuns({projectDir: projectDir});
      process.exit(4);
    }
    if (msg.includes('not found in template')) {
      console.error('error: phase "' + phaseId + '" is not part of run "' + slug + '"');
      process.exit(5);
    }
    console.error('error: ' + msg);
    process.exit(1);
  }

  process.stdout.write(result.instruction + '\n');
  process.stderr.write('slug: ' + slug + '; retried phase: ' + phaseId + '\n');
}

/**
 * cp run abandon <slug> [--yes] [--projectDir <path>]
 */
function runAbandon(args) {
  var slug = null;
  var yes = false;
  var projectDir = null;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--yes' || a === '-y') { yes = true; }
    else if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!slug) { slug = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  if (!slug) {
    console.error('Usage: cp run abandon <slug> [--yes] [--projectDir <path>]');
    process.exit(2);
  }

  function doAbandon() {
    try {
      runtime.abandonRun(slug, {projectDir: projectDir});
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.startsWith('Run not found:')) {
        console.error('error: run "' + slug + '" not found.');
        listActiveRuns({projectDir: projectDir});
        process.exit(4);
      }
      console.error('error: ' + msg);
      process.exit(1);
    }
    process.stderr.write('Abandoned: ' + slug + '\n');
  }

  if (yes) {
    doAbandon();
    return;
  }

  var rl = readline.createInterface({input: process.stdin, output: process.stderr});
  rl.question('Abandon run ' + slug + '? [y/N]: ', function(answer) {
    rl.close();
    var trimmed = (answer || '').trim().toLowerCase();
    if (trimmed === 'y' || trimmed === 'yes') {
      doAbandon();
    } else {
      process.stderr.write('Aborted.\n');
      process.exit(1);
    }
  });
}

/**
 * cp run mark-complete <slug> <phase-id> [--projectDir <path>]  < summary.md
 */
function runMarkComplete(args) {
  var slug = null;
  var phaseId = null;
  var projectDir = null;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!slug) { slug = a; }
    else if (!phaseId) { phaseId = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  if (!slug || !phaseId) {
    console.error('Usage: cp run mark-complete <slug> <phase-id> < summary.md');
    process.exit(2);
  }

  if (process.stdin.isTTY) {
    console.error(
      'error: summary required on stdin. Pipe a file: ' +
      'cp run mark-complete ' + slug + ' ' + phaseId + ' < summary.md'
    );
    process.exit(5);
  }

  var stdinText;
  try {
    stdinText = fs.readFileSync(0, 'utf8');
  } catch (e) {
    console.error('error: failed to read stdin: ' + (e.message || String(e)));
    process.exit(1);
  }

  var result;
  try {
    result = runtime.markPhaseComplete(slug, phaseId, stdinText, {projectDir: projectDir});
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Run not found:')) {
      console.error('error: run "' + slug + '" not found.');
      listActiveRuns({projectDir: projectDir});
      process.exit(4);
    }
    if (msg.includes('not in current wave')) {
      // "Phase discuss not in current wave (current: discuss, execute)"
      var m = msg.match(/\(current:\s*(.+?)\)$/);
      var currentIds = m ? m[1] : '(unknown)';
      console.error(
        'error: phase "' + phaseId + '" is not in current wave ' +
        '(current wave phases: ' + currentIds + ')'
      );
      process.exit(5);
    }
    console.error('error: ' + msg);
    process.exit(1);
  }

  if (result.doneAfter) {
    process.stderr.write('Run complete: ' + slug + '\n');
  } else if (result.nextInstruction) {
    process.stdout.write(result.nextInstruction + '\n');
    var nextWaveNum = result.wave + 2; // result.wave is 0-based index just completed
    process.stderr.write('slug: ' + slug + '; advanced to wave ' + nextWaveNum + '\n');
  } else {
    process.stderr.write(
      'slug: ' + slug + '; phase "' + phaseId + '" complete' +
      ' (wave ' + (result.wave + 1) + ' still has pending phases)\n'
    );
  }
}

/**
 * cp run status [slug] [--json] [--projectDir <path>]
 */
function runStatus(args) {
  var slug = null;
  var jsonOut = false;
  var projectDir = null;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--json') { jsonOut = true; }
    else if (a === '--projectDir') { projectDir = args[++i]; }
    else if (a.startsWith('-')) { console.error('unknown option: ' + a); process.exit(2); }
    else if (!slug) { slug = a; }
    else { console.error('unexpected arg: ' + a); process.exit(2); }
  }

  var pd = path.resolve(projectDir || process.cwd());

  if (slug) {
    // Show single run state.
    var found = resolveRunState(slug, pd);
    if (!found) {
      console.error('error: run "' + slug + '" not found.');
      process.exit(4);
    }

    var state = found.state;
    var binding = found.binding || state.binding;

    var totalWaveCount = '?';
    try {
      if (state.template_path) {
        var tpl = wfLib.loadTemplate(state.template_path, {projectDir: pd});
        totalWaveCount = wfLib.computeWaves(tpl).length;
      }
    } catch (_) {}

    var display = {
      binding: binding,
      workflow: state.workflow || null,
      slug: state.slug || slug,
      status: state.status || null,
      started: state.started || null,
      last_activity: state.last_activity || null,
      current_wave: (state.current_wave != null ? state.current_wave : 0) + 1,
      total_waves: totalWaveCount,
      completed: state.completed || [],
    };

    if (jsonOut) {
      console.log(JSON.stringify(display, null, 2));
    } else {
      console.log('binding:        ' + display.binding);
      console.log('workflow:       ' + display.workflow);
      console.log('slug:           ' + display.slug);
      console.log('status:         ' + display.status);
      console.log('started:        ' + display.started);
      console.log('last_activity:  ' + display.last_activity);
      console.log('current_wave:   ' + display.current_wave + ' of ' + display.total_waves);
      console.log('completed:      ' + (display.completed.length ? display.completed.join(', ') : '(none)'));
    }
    return;
  }

  // List all runs across all three tiers.
  var allRuns = [];

  // 1. Quick runs (formerly "custom"; listRuns aggregates legacy custom/ too)
  var quickRuns = [];
  try { quickRuns = custom.listRuns({projectDir: projectDir}); } catch (_) {}
  for (var ci = 0; ci < quickRuns.length; ci++) {
    var cr = quickRuns[ci];
    var crWave = '?';
    try {
      var crState = custom.readState(cr.slug, {projectDir: projectDir});
      crWave = (crState.current_wave != null ? crState.current_wave : 0) + 1;
    } catch (_) {}
    allRuns.push({
      binding: 'quick',
      slug: cr.slug,
      workflow: cr.workflow || '(unknown)',
      status: cr.status || '(unknown)',
      current_wave: crWave,
      total_waves: '?',
      last_activity: cr.lastActivity || null,
    });
  }

  // 2. Phase runs
  var phasesRoot = path.join(pd, '.planning', 'phases');
  if (fs.existsSync(phasesRoot)) {
    var pEntries = [];
    try { pEntries = fs.readdirSync(phasesRoot); } catch (_) {}
    for (var pi = 0; pi < pEntries.length; pi++) {
      var wfDir = path.join(phasesRoot, pEntries[pi], '.workflow-runs');
      if (!fs.existsSync(wfDir)) continue;
      var wfFiles = [];
      try { wfFiles = fs.readdirSync(wfDir); } catch (_) {}
      for (var pfi = 0; pfi < wfFiles.length; pfi++) {
        if (!wfFiles[pfi].endsWith('.yaml')) continue;
        try {
          var pst = yaml.parse(fs.readFileSync(path.join(wfDir, wfFiles[pfi]), 'utf8'));
          if (!pst) continue;
          allRuns.push({
            binding: 'phase',
            slug: pst.slug || wfFiles[pfi].replace('.yaml', ''),
            workflow: pst.workflow || '(unknown)',
            status: pst.status || '(unknown)',
            current_wave: (pst.current_wave != null ? pst.current_wave : 0) + 1,
            total_waves: '?',
            last_activity: pst.last_activity || null,
          });
        } catch (_) {}
      }
    }
  }

  // 3. Milestone runs
  var msRoot = path.join(pd, '.planning', 'milestones');
  if (fs.existsSync(msRoot)) {
    var msEntries = [];
    try { msEntries = fs.readdirSync(msRoot); } catch (_) {}
    for (var mi = 0; mi < msEntries.length; mi++) {
      var msRunPath = path.join(msRoot, msEntries[mi], 'RUN.yaml');
      if (!fs.existsSync(msRunPath)) continue;
      try {
        var mst = yaml.parse(fs.readFileSync(msRunPath, 'utf8'));
        if (!mst) continue;
        allRuns.push({
          binding: 'milestone',
          slug: mst.slug || msEntries[mi],
          workflow: mst.workflow || '(unknown)',
          status: mst.status || '(unknown)',
          current_wave: (mst.current_wave != null ? mst.current_wave : 0) + 1,
          total_waves: '?',
          last_activity: mst.last_activity || null,
        });
      } catch (_) {}
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify(allRuns, null, 2));
    return;
  }

  if (allRuns.length === 0) {
    console.log('(no active runs)');
    return;
  }

  for (var ri = 0; ri < allRuns.length; ri++) {
    var r = allRuns[ri];
    console.log(
      r.binding + '  ' + r.slug + '  ' + r.workflow + '  ' + r.status +
      '  wave ' + r.current_wave + '/' + r.total_waves +
      '  last_activity: ' + (r.last_activity || '(unknown)')
    );
  }
}

// ---------- run state (v1.4 supervised runs) ----------

function runState(args) {
  var supervisor = require('../../lib/supervisor');
  var pd = _extractProjectDir(args);
  var jsonOut = _consumeFlag(args, '--json');
  if (args.length === 0) {
    process.stderr.write('Usage: cp run state <slug> [get|set|append] [path] [value]\n');
    process.exit(2);
  }
  var sub = args[0];
  var slug;
  var dotPath;
  var rawVal;

  if (sub === 'get' || sub === 'set' || sub === 'append') {
    slug = args[1];
    dotPath = args[2];
    rawVal = args[3];
    if (!slug || !dotPath || (sub !== 'get' && rawVal === undefined)) {
      process.stderr.write('Usage: cp run state ' + sub + ' <slug> <path>' + (sub === 'get' ? '' : ' <value>') + '\n');
      process.exit(2);
    }
  } else {
    slug = sub;
    sub = 'show';
  }

  try {
    if (sub === 'show') {
      var st = supervisor.readState(slug, {projectDir: pd});
      // Default to JSON output — state is structured.
      console.log(JSON.stringify(st, null, 2));
      return;
    }
    if (sub === 'get') {
      var val = supervisor.getPath(slug, dotPath, {projectDir: pd});
      if (val === undefined) {
        process.exit(1);
      }
      if (typeof val === 'string' && !jsonOut) {
        console.log(val);
      } else {
        console.log(JSON.stringify(val, null, 2));
      }
      return;
    }
    var parsed;
    try { parsed = JSON.parse(rawVal); } catch (_) { parsed = rawVal; }
    if (sub === 'set') {
      supervisor.setPath(slug, dotPath, parsed, {projectDir: pd});
    } else {
      supervisor.appendPath(slug, dotPath, parsed, {projectDir: pd});
    }
    if (jsonOut) {
      console.log(JSON.stringify(supervisor.readState(slug, {projectDir: pd}), null, 2));
    } else {
      process.stderr.write('ok\n');
    }
  } catch (e) {
    process.stderr.write('cp run state: ' + e.message + '\n');
    process.exit(1);
  }
}

function _extractProjectDir(args) {
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--projectDir' && args[i + 1]) {
      var v = args[i + 1];
      args.splice(i, 2);
      return v;
    }
  }
  return process.cwd();
}

function _consumeFlag(args, flag) {
  var idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

// ---------- main dispatcher ----------

var SUBCMDS = ['resume', 'retry', 'abandon', 'mark-complete', 'status', 'state'];

function run(args) {
  if (!args || args.length === 0) { printHelp(); return; }
  var first = args[0];
  if (first === '--help' || first === '-h' || first === 'help') { printHelp(); return; }

  if (SUBCMDS.indexOf(first) !== -1) {
    var rest = args.slice(1);
    switch (first) {
      case 'resume': return runResume(rest);
      case 'retry': return runRetry(rest);
      case 'abandon': return runAbandon(rest);
      case 'mark-complete': return runMarkComplete(rest);
      case 'status': return runStatus(rest);
      case 'state': return runState(rest);
    }
  }

  // Not a known sub-command — treat first arg as workflow name.
  return runStart(args);
}

module.exports = {name: 'run', run: run};
