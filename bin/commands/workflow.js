'use strict';

/**
 * cp workflow — static template management commands.
 *
 * Dispatches to 8 sub-handlers:
 *   ls [--json]                     – list built-in + project templates
 *   show <name>                     – print resolved template YAML to stdout
 *   validate <name-or-path>         – validate a template; --strict treats warnings as errors
 *   diagram <name-or-path>          – emit Mermaid flowchart to stdout
 *   init                            – create .planning/workflows/ directory
 *   new <name> [--from <built-in>]  – scaffold a new template file
 *   import <path> [--name <n>]      – copy + validate an external template
 *   export <name> [--out <path>] [--as <new-name>]
 *                                   – write a template's YAML to a file (round-trips with import)
 *   brainstorm [--workflow <name>] [--out <path>]
 *                                   – emit a brainstorm context (delegation to provider skill)
 *
 * Exit codes:
 *   0  ok
 *   2  usage / validation error (or strict + warnings)
 *   3  template not found
 *   6  file already exists (new/import without --force)
 */

const fs = require('fs');
const path = require('path');
const wfLib = require('../../lib/workflow');
const provider = require('../../lib/provider');

// ---------- help ----------

var USAGE = [
  'cp workflow <subcommand>',
  '',
  'Manage workflow templates.',
  '',
  'Subcommands:',
  '  cp workflow ls [--json]',
  '                                        List all templates (built-in + project).',
  '                                        --json  Machine-readable array output.',
  '  cp workflow show <name>',
  '                                        Print a template\'s YAML to stdout.',
  '  cp workflow validate <name-or-path> [--strict]',
  '                                        Validate a template. Prints errors/warnings.',
  '                                        --strict  Exit 2 if any warnings present.',
  '  cp workflow diagram <name-or-path> [--format mermaid]',
  '                                        Emit a Mermaid flowchart to stdout.',
  '  cp workflow inspect <name-or-path> [--json]',
  '                                        Show template YAML plus the deduced wave-by-wave',
  '                                        execution sequence (parallel phase groupings).',
  '                                        --json   Machine-readable form.',
  '  cp workflow init',
  '                                        Create .planning/workflows/ directory.',
  '  cp workflow new <name> [--from <built-in>] [--force]',
  '                                        Scaffold a new template file.',
  '                                        --from   Copy a built-in as starter.',
  '                                        --force  Overwrite an existing file.',
  '  cp workflow import <path> [--name <override>] [--force]',
  '                                        Copy + validate an external template.',
  '                                        --name   Override the destination filename.',
  '                                        --force  Overwrite an existing file.',
  '  cp workflow export <name> [--out <path>] [--as <new-name>] [--force]',
  '                                        Write a template\'s YAML to a file for editing.',
  '                                        --out    Destination path (default: ./<name>.yaml).',
  '                                        --as     Rewrite the top-level "workflow:" key.',
  '                                        --force  Overwrite an existing file.',
  '  cp workflow brainstorm [--workflow <name>] [--out <path>]',
  '                                        Emit a brainstorm context for designing a new',
  '                                        workflow. Delegates to the configured provider',
  '                                        skill (or prints a guided prompt if manual).',
  '                                        --workflow  Workflow name (default: new-workflow).',
  '                                        --out       Output path (default: .planning/workflows/<name>.yaml).',
  '',
].join('\n');

function printHelp() {
  process.stdout.write(USAGE + '\n');
}

// ---------- internal helpers ----------

/** Resolve the built-in templates directory (templates/workflows/ next to package root). */
function builtinDir() {
  return path.resolve(__dirname, '..', '..', 'templates', 'workflows');
}

/** Resolve the project-local templates directory (.planning/workflows/ in cwd). */
function projectDir(cwd) {
  return path.resolve(cwd || process.cwd(), '.planning', 'workflows');
}

/**
 * List .yaml files in a directory. Returns [] if dir doesn't exist.
 * @param {string} dir
 * @returns {string[]} basenames
 */
function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir).filter(function(f) { return /\.ya?ml$/i.test(f); });
  } catch (_) {
    return [];
  }
}

/**
 * Return binds_to from a template file without full validation.
 * Falls back to 'quick' on any error.
 */
function safeBindsTo(filePath) {
  try {
    var tpl = wfLib.loadTemplate(filePath, {});
    return (tpl.meta && tpl.meta.binds_to) || 'quick';
  } catch (_) {
    return '?';
  }
}

/**
 * Return phase count from a template file.
 * Falls back to 0 on any error.
 */
function safePhaseCount(filePath) {
  try {
    var tpl = wfLib.loadTemplate(filePath, {});
    return Array.isArray(tpl.phases) ? tpl.phases.length : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Resolve a name-or-path argument to an absolute file path.
 * If it looks like a path (contains slashes or ends in .yaml/.yml), use directly.
 * Otherwise, call resolveTemplate.
 * Throws on not-found.
 */
function resolveNameOrPath(arg, cwd) {
  if (/[\\/]/.test(arg) || /\.ya?ml$/i.test(arg)) {
    var abs = path.resolve(cwd || process.cwd(), arg);
    if (!fs.existsSync(abs)) {
      throw Object.assign(new Error('File not found: ' + abs), {notFound: true});
    }
    return abs;
  }
  return wfLib.resolveTemplate(arg, {projectDir: cwd || process.cwd()});
}

// ---------- sub-handlers ----------

/**
 * cp workflow ls [--json]
 */
function workflowLs(args, cwd) {
  var json = false;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--json') { json = true; }
    else { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
  }

  var pd = projectDir(cwd);
  var bd = builtinDir();

  var entries = [];

  // Built-in first
  var builtinFiles = listYamlFiles(bd);
  for (var j = 0; j < builtinFiles.length; j++) {
    var bFile = path.join(bd, builtinFiles[j]);
    var bName = path.basename(builtinFiles[j], path.extname(builtinFiles[j]));
    entries.push({
      name: bName,
      source: 'built-in',
      path: bFile,
      binds_to: safeBindsTo(bFile),
      phaseCount: safePhaseCount(bFile),
    });
  }

  // Project-local (may override built-in by same name)
  var projectFiles = listYamlFiles(pd);
  for (var k = 0; k < projectFiles.length; k++) {
    var pFile = path.join(pd, projectFiles[k]);
    var pName = path.basename(projectFiles[k], path.extname(projectFiles[k]));
    entries.push({
      name: pName,
      source: 'project',
      path: pFile,
      binds_to: safeBindsTo(pFile),
      phaseCount: safePhaseCount(pFile),
    });
  }

  if (json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }

  // Human-readable table
  if (entries.length === 0) {
    process.stdout.write('(no templates found)\n');
    return;
  }

  var nameW = 'name'.length;
  var srcW = 'source'.length;
  var bindW = 'binds_to'.length;
  for (var m = 0; m < entries.length; m++) {
    if (entries[m].name.length > nameW) nameW = entries[m].name.length;
    if (entries[m].source.length > srcW) srcW = entries[m].source.length;
    if (entries[m].binds_to.length > bindW) bindW = entries[m].binds_to.length;
  }

  var pad = function(s, w) { return s + ' '.repeat(Math.max(0, w - s.length)); };
  process.stdout.write(pad('name', nameW) + '  ' + pad('source', srcW) + '  ' + 'binds_to' + '\n');
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(srcW) + '  ' + '-'.repeat(bindW) + '\n');
  for (var n = 0; n < entries.length; n++) {
    process.stdout.write(
      pad(entries[n].name, nameW) + '  ' +
      pad(entries[n].source, srcW) + '  ' +
      entries[n].binds_to + '\n'
    );
  }
}

/**
 * cp workflow show <name>
 */
function workflowShow(args, cwd) {
  var name = null;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) { name = a; }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  if (!name) {
    process.stderr.write('Usage: cp workflow show <name>\n');
    process.exit(2);
  }

  var filePath;
  try {
    filePath = resolveNameOrPath(name, cwd);
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:') || e.notFound) {
      process.stderr.write('error: template "' + name + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + msg + '\n');
    process.exit(1);
  }

  var body = fs.readFileSync(filePath, 'utf8');
  process.stdout.write('# template: ' + name + ' (source: ' + filePath + ')\n');
  process.stdout.write(body);
  if (body.length > 0 && body[body.length - 1] !== '\n') {
    process.stdout.write('\n');
  }
}

/**
 * cp workflow validate <name-or-path> [--strict]
 */
function workflowValidate(args, cwd) {
  var nameOrPath = null;
  var strict = false;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--strict') { strict = true; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!nameOrPath) { nameOrPath = a; }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  if (!nameOrPath) {
    process.stderr.write('Usage: cp workflow validate <name-or-path> [--strict]\n');
    process.exit(2);
  }

  var filePath;
  try {
    filePath = resolveNameOrPath(nameOrPath, cwd);
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:') || e.notFound) {
      process.stderr.write('error: template "' + nameOrPath + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + msg + '\n');
    process.exit(1);
  }

  var tpl;
  try {
    tpl = wfLib.loadTemplate(filePath, {});
  } catch (e) {
    process.stderr.write('error: ' + (e.message || String(e)) + '\n');
    process.exit(2);
  }

  var result = wfLib.validate(tpl);

  for (var j = 0; j < result.errors.length; j++) {
    process.stderr.write('error: ' + result.errors[j] + '\n');
  }
  for (var k = 0; k < result.warnings.length; k++) {
    process.stderr.write('warning: ' + result.warnings[k] + '\n');
  }

  if (!result.ok) {
    process.exit(2);
  }
  if (strict && result.warnings.length > 0) {
    process.exit(2);
  }

  process.stdout.write('OK: ' + nameOrPath + '\n');
}

/**
 * cp workflow diagram <name-or-path> [--format mermaid]
 */
function workflowDiagram(args, cwd) {
  var nameOrPath = null;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--format') {
      var fmt = args[++i];
      if (fmt !== 'mermaid') {
        process.stderr.write('error: unsupported format "' + fmt + '". Only "mermaid" is supported.\n');
        process.exit(2);
      }
    } else if (a.startsWith('-')) {
      process.stderr.write('unknown option: ' + a + '\n');
      process.exit(2);
    } else if (!nameOrPath) {
      nameOrPath = a;
    } else {
      process.stderr.write('unexpected arg: ' + a + '\n');
      process.exit(2);
    }
  }

  if (!nameOrPath) {
    process.stderr.write('Usage: cp workflow diagram <name-or-path> [--format mermaid]\n');
    process.exit(2);
  }

  var filePath;
  try {
    filePath = resolveNameOrPath(nameOrPath, cwd);
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:') || e.notFound) {
      process.stderr.write('error: template "' + nameOrPath + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + msg + '\n');
    process.exit(1);
  }

  var tpl;
  try {
    tpl = wfLib.loadTemplate(filePath, {});
  } catch (e) {
    process.stderr.write('error: ' + (e.message || String(e)) + '\n');
    process.exit(2);
  }

  var result = wfLib.validate(tpl);
  if (!result.ok) {
    for (var j = 0; j < result.errors.length; j++) {
      process.stderr.write('error: ' + result.errors[j] + '\n');
    }
    process.exit(2);
  }

  var name = (tpl.meta && tpl.meta.workflow) || nameOrPath;
  var bindsTo = (tpl.meta && tpl.meta.binds_to) || 'quick';

  var lines = ['flowchart TD'];
  lines.push('%% workflow: ' + name + ', binds_to: ' + bindsTo);

  // Collect all edges and root nodes (phases with no depends_on)
  var phases = tpl.phases || [];
  var hasIncoming = {};
  for (var k = 0; k < phases.length; k++) {
    var ph = phases[k];
    var deps = Array.isArray(ph.depends_on) ? ph.depends_on : [];
    for (var d = 0; d < deps.length; d++) {
      hasIncoming[ph.id] = true;
      lines.push('  ' + deps[d] + ' --> ' + ph.id);
    }
  }
  // Declare root phases (no incoming edges)
  var rootDecls = [];
  for (var m = 0; m < phases.length; m++) {
    if (!hasIncoming[phases[m].id]) {
      rootDecls.push('  ' + phases[m].id);
    }
  }
  // Insert root declarations after the comment line
  lines.splice(2, 0, rootDecls.join('\n'));

  process.stdout.write(lines.join('\n') + '\n');
}

/**
 * cp workflow inspect <name-or-path> [--json]
 *
 * Combines `show` (raw template YAML) with the deduced wave-by-wave
 * execution sequence computed by lib/workflow.js#computeWaves. Useful
 * for understanding which phases run in parallel before launching
 * `cp run`. Human-readable by default; --json emits a structured form
 * suitable for tooling.
 */
function _collectTemplatesReferenced(rawPhases) {
  var out = [];
  for (var ti = 0; ti < rawPhases.length; ti++) {
    var entry = rawPhases[ti];
    if (!entry || typeof entry !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(entry, 'template')) {
      var t = entry.template;
      if (typeof t === 'string') out.push({ kind: 'workflow-template', name: t });
      else if (t && typeof t === 'object' && typeof t.name === 'string') {
        out.push({ kind: 'workflow-template', name: t.name });
      }
    }
    if (entry.phase && typeof entry.phase === 'object' && entry.phase.template != null) {
      const pt = entry.phase.template;
      if (typeof pt === 'string') {
        out.push({ kind: 'phase-template', name: pt });
      } else if (typeof pt === 'object' && typeof pt.name === 'string') {
        out.push({ kind: 'phase-template', name: pt.name });
      }
    }
  }
  return out;
}

function workflowInspect(args, cwd) {
  var nameOrPath = null;
  var json = false;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--json') { json = true; }
    else if (a.startsWith('-')) {
      process.stderr.write('unknown option: ' + a + '\n');
      process.exit(2);
    } else if (!nameOrPath) {
      nameOrPath = a;
    } else {
      process.stderr.write('unexpected arg: ' + a + '\n');
      process.exit(2);
    }
  }

  if (!nameOrPath) {
    process.stderr.write('Usage: cp workflow inspect <name-or-path> [--json]\n');
    process.exit(2);
  }

  var filePath;
  try {
    filePath = resolveNameOrPath(nameOrPath, cwd);
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:') || e.notFound) {
      process.stderr.write('error: template "' + nameOrPath + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + msg + '\n');
    process.exit(1);
  }

  var tpl;
  try {
    tpl = wfLib.loadTemplate(filePath, {});
  } catch (e) {
    process.stderr.write('error: ' + (e.message || String(e)) + '\n');
    process.exit(2);
  }

  var result = wfLib.validate(tpl);
  if (!result.ok) {
    for (var j = 0; j < result.errors.length; j++) {
      process.stderr.write('error: ' + result.errors[j] + '\n');
    }
    process.exit(2);
  }

  var waves;
  try {
    waves = wfLib.computeWaves(tpl);
  } catch (e) {
    process.stderr.write('error: ' + (e.message || String(e)) + '\n');
    process.exit(2);
  }

  var name = (tpl.meta && tpl.meta.workflow) || nameOrPath;
  var bindsTo = (tpl.meta && tpl.meta.binds_to) || 'quick';

  if (json) {
    var templatesUsedJson = [];
    try {
      var yamlJ = require('yaml');
      var bodyJ = fs.readFileSync(filePath, 'utf8');
      var rawJ = yamlJ.parse(bodyJ) || {};
      var rpJ = Array.isArray(rawJ.phases) ? rawJ.phases : [];
      templatesUsedJson = _collectTemplatesReferenced(rpJ);
    } catch (_) { /* ignore */ }
    var out = {
      workflow: name,
      binds_to: bindsTo,
      source: filePath,
      total_phases: (tpl.phases || []).length,
      total_waves: waves.length,
      templates_referenced: templatesUsedJson,
      resolver_warnings: Array.isArray(result.warnings) ? result.warnings : [],
      waves: waves.map(function (wave, idx) {
        return {
          wave: idx + 1,
          phases: wave.map(function (p) {
            return {
              id: p.id,
              role: p.role || null,
              depends_on: Array.isArray(p.depends_on) ? p.depends_on : [],
              model: p.model || null
            };
          })
        };
      })
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  // Human-readable form
  var body = fs.readFileSync(filePath, 'utf8');
  process.stdout.write('# template: ' + name + ' (source: ' + filePath + ')\n');
  process.stdout.write(body);
  if (body.length > 0 && body[body.length - 1] !== '\n') {
    process.stdout.write('\n');
  }
  process.stdout.write('\n');

  // v1.3: surface templates referenced + resolver warnings/errors.
  var templatesUsed = [];
  try {
    var yaml = require('yaml');
    var raw = yaml.parse(body) || {};
    var rawPhases = Array.isArray(raw.phases) ? raw.phases : [];
    templatesUsed = _collectTemplatesReferenced(rawPhases);
  } catch (_) { /* ignore */ }
  if (templatesUsed.length > 0) {
    process.stdout.write('=== Templates referenced ===\n');
    for (var ui = 0; ui < templatesUsed.length; ui++) {
      process.stdout.write('  - ' + templatesUsed[ui].kind + ': ' + templatesUsed[ui].name + '\n');
    }
    process.stdout.write('\n');
  }
  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    process.stdout.write('=== Resolver warnings ===\n');
    for (var wi = 0; wi < result.warnings.length; wi++) {
      process.stdout.write('  - ' + result.warnings[wi] + '\n');
    }
    process.stdout.write('\n');
  }

  process.stdout.write('=== Deduced execution sequence ===\n');
  process.stdout.write('workflow: ' + name + '  binds_to: ' + bindsTo + '\n');
  process.stdout.write((tpl.phases || []).length + ' phase(s) across ' + waves.length + ' wave(s)\n');
  process.stdout.write('\n');
  for (var w = 0; w < waves.length; w++) {
    var wave = waves[w];
    var parallel = wave.length > 1 ? ' (parallel)' : '';
    process.stdout.write('Wave ' + (w + 1) + ' of ' + waves.length + ' — ' + wave.length + ' phase(s)' + parallel + ':\n');
    for (var p = 0; p < wave.length; p++) {
      var ph = wave[p];
      var parts = [];
      if (ph.role) { parts.push('role: ' + ph.role); }
      if (ph.model) { parts.push('model: ' + ph.model); }
      if (Array.isArray(ph.depends_on) && ph.depends_on.length > 0) {
        parts.push('depends on: ' + ph.depends_on.join(', '));
      }
      var suffix = parts.length > 0 ? '  (' + parts.join(', ') + ')' : '';
      process.stdout.write('  - ' + ph.id + suffix + '\n');
    }
  }
}


function workflowInit(args, cwd) {
  for (var i = 0; i < args.length; i++) {
    process.stderr.write('unexpected arg: ' + args[i] + '\n');
    process.exit(2);
  }

  var dir = projectDir(cwd);
  var gitkeep = path.join(dir, '.gitkeep');

  if (fs.existsSync(dir)) {
    process.stderr.write('exists: ' + dir + '\n');
    return;
  }

  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(gitkeep, '');
  process.stderr.write('created: ' + dir + '\n');
}

/**
 * cp workflow new <name> [--from <built-in>] [--force]
 */
function workflowNew(args, cwd) {
  var name = null;
  var from = null;
  var force = false;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--from') { from = args[++i]; }
    else if (a === '--force') { force = true; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) { name = a; }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  if (!name) {
    process.stderr.write('Usage: cp workflow new <name> [--from <built-in>] [--force]\n');
    process.exit(2);
  }

  var pd = projectDir(cwd);
  var dest = path.join(pd, name + '.yaml');

  if (fs.existsSync(dest) && !force) {
    process.stderr.write('error: ' + dest + ' already exists. Use --force to overwrite.\n');
    process.exit(6);
  }

  // Ensure the directory exists
  if (!fs.existsSync(pd)) {
    fs.mkdirSync(pd, {recursive: true});
  }

  var content;
  if (from) {
    // Copy built-in template, renaming workflow: field to name
    var srcPath;
    try {
      srcPath = wfLib.resolveTemplate(from, {projectDir: cwd || process.cwd()});
    } catch (e) {
      process.stderr.write('error: built-in template "' + from + '" not found.\n');
      process.exit(3);
    }
    var raw = fs.readFileSync(srcPath, 'utf8');
    // Replace the `workflow: <old>` line at the top with `workflow: <name>`
    content = raw.replace(/^workflow:\s*.+$/m, 'workflow: ' + name);
  } else {
    // Write a stub template
    content = [
      'workflow: ' + name,
      'version: 1',
      'binds_to: quick  # or: phase | milestone',
      'principles:',
      '  - TODO: add a principle',
      '  - TODO: add another principle',
      'defaults:',
      '  model: default',
      'phases:',
      '  - id: discuss',
      '    role: planner',
      '    prompt: |',
      '      TODO: describe what this phase should accomplish.',
      '  - id: execute',
      '    depends_on: [discuss]',
      '    role: implementer',
      '    prompt: |',
      '      TODO: describe the implementation work.',
      '  - id: verify',
      '    depends_on: [execute]',
      '    role: verifier',
      '    prompt: |',
      '      TODO: describe verification steps.',
    ].join('\n') + '\n';
  }

  fs.writeFileSync(dest, content, 'utf8');
  process.stderr.write('created: ' + dest + '\n');
}

/**
 * cp workflow import <path> [--name <override>] [--force]
 */
function workflowImport(args, cwd) {
  var srcArg = null;
  var nameOverride = null;
  var force = false;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--name') { nameOverride = args[++i]; }
    else if (a === '--force') { force = true; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!srcArg) { srcArg = a; }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  if (!srcArg) {
    process.stderr.write('Usage: cp workflow import <path> [--name <override>] [--force]\n');
    process.exit(2);
  }

  var srcPath = path.resolve(cwd || process.cwd(), srcArg);
  if (!fs.existsSync(srcPath)) {
    process.stderr.write('error: file not found: ' + srcPath + '\n');
    process.exit(2);
  }

  // Load + validate before importing
  var tpl;
  try {
    tpl = wfLib.loadTemplate(srcPath, {});
  } catch (e) {
    process.stderr.write('error: ' + (e.message || String(e)) + '\n');
    process.exit(2);
  }

  var result = wfLib.validate(tpl);
  if (!result.ok) {
    for (var j = 0; j < result.errors.length; j++) {
      process.stderr.write('error: ' + result.errors[j] + '\n');
    }
    process.exit(2);
  }

  // Determine destination name
  var destName = nameOverride ||
    (tpl.meta && tpl.meta.workflow) ||
    path.basename(srcPath, path.extname(srcPath));

  var pd = projectDir(cwd);
  var dest = path.join(pd, destName + '.yaml');

  if (fs.existsSync(dest) && !force) {
    process.stderr.write('error: ' + dest + ' already exists. Use --force to overwrite.\n');
    process.exit(6);
  }

  if (!fs.existsSync(pd)) {
    fs.mkdirSync(pd, {recursive: true});
  }

  fs.copyFileSync(srcPath, dest);
  process.stderr.write('imported: ' + dest + '\n');
}

/**
 * cp workflow export <name> [--out <path>] [--as <new-name>] [--force]
 *
 * Companion to `cp workflow import` and convenience wrapper around
 * `cp workflow show`. Writes a template's YAML to a file with:
 *   - the "# template: <name> (source: ...)" comment header from
 *     `show` stripped
 *   - optionally the top-level `workflow:` key rewritten to a new name
 *     (line-precise regex; YAML is NOT reserialised)
 *   - validation before write (so we never export a broken file)
 *
 * Default destination: ./<as|name>.yaml (relative to cwd).
 */
function workflowExport(args, cwd) {
  var name = null;
  var outPath = null;
  var asName = null;
  var force = false;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--out') { outPath = args[++i]; }
    else if (a === '--as') { asName = args[++i]; }
    else if (a === '--force') { force = true; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) { name = a; }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  if (!name) {
    process.stderr.write('Usage: cp workflow export <name> [--out <path>] [--as <new-name>] [--force]\n');
    process.exit(2);
  }

  if (asName !== null && (typeof asName !== 'string' || asName.trim() === '')) {
    process.stderr.write('error: --as requires a non-empty name\n');
    process.exit(2);
  }

  // Resolve the source template (built-in or project).
  var srcPath;
  try {
    srcPath = resolveNameOrPath(name, cwd);
  } catch (e) {
    var msg = e.message || String(e);
    if (msg.startsWith('Template not found:') || e.notFound) {
      process.stderr.write('error: template "' + name + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + msg + '\n');
    process.exit(1);
  }

  var body = fs.readFileSync(srcPath, 'utf8');

  // Ensure trailing newline (mirrors what `show` emits).
  if (body.length > 0 && body[body.length - 1] !== '\n') {
    body = body + '\n';
  }

  // If --as: rewrite the first top-level `workflow:` line.
  // Line-precise regex on the per-line basis avoids matching `workflow:` that
  // appears inside string values, nested keys, or comments.
  if (asName) {
    var lines = body.split('\n');
    var rewritten = false;
    for (var j = 0; j < lines.length; j++) {
      if (/^workflow:\s+\S/.test(lines[j])) {
        lines[j] = 'workflow: ' + asName;
        rewritten = true;
        break;
      }
    }
    if (!rewritten) {
      process.stderr.write('error: could not find top-level "workflow:" key in source template\n');
      process.exit(1);
    }
    body = lines.join('\n');
  }

  // Validate the result BEFORE writing. We parse the in-memory body via
  // wfLib.loadTemplate by writing to a temp path (loadTemplate expects a
  // file). Cheaper alternative: rely on wfLib having a parseTemplateString
  // — but loadTemplate is the canonical entrypoint, so prefer it.
  var os = require('os');
  var tmpPath = path.join(os.tmpdir(), 'cp-workflow-export-' + process.pid + '-' + Date.now() + '.yaml');
  fs.writeFileSync(tmpPath, body);
  var tpl;
  try {
    tpl = wfLib.loadTemplate(tmpPath, {});
  } catch (e2) {
    fs.unlinkSync(tmpPath);
    process.stderr.write('error: exported YAML failed to parse: ' + (e2.message || String(e2)) + '\n');
    process.exit(1);
  }
  var vr = wfLib.validate(tpl);
  fs.unlinkSync(tmpPath);
  if (!vr.ok) {
    for (var k = 0; k < vr.errors.length; k++) {
      process.stderr.write('error: ' + vr.errors[k] + '\n');
    }
    process.exit(2);
  }

  // Resolve output path.
  var destBaseName = asName || name;
  var dest = outPath
    ? path.resolve(cwd || process.cwd(), outPath)
    : path.resolve(cwd || process.cwd(), destBaseName + '.yaml');

  if (fs.existsSync(dest) && !force) {
    process.stderr.write('error: ' + dest + ' already exists. Use --force to overwrite.\n');
    process.exit(6);
  }

  // Ensure parent directory exists (handles --out subdir/file.yaml).
  var destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(dest, body);
  process.stderr.write('exported: ' + dest + (asName ? ' (as "' + asName + '")' : '') + '\n');
}

/**
 * cp workflow brainstorm [--workflow <name>] [--out <path>]
 */
function workflowBrainstorm(args, cwd) {
  var workflowName = 'new-workflow';
  var outPath = null;

  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--workflow') { workflowName = args[++i]; }
    else if (a === '--out') { outPath = args[++i]; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }

  // Resolve output path
  var resolvedOut = outPath
    ? path.resolve(cwd, outPath)
    : path.join(projectDir(cwd), workflowName + '.yaml');

  // Validate --out parent dir (if explicitly provided and parent doesn't exist)
  if (outPath) {
    var parentDir = path.dirname(resolvedOut);
    var defaultWfDir = projectDir(cwd);
    if (!fs.existsSync(parentDir) && parentDir !== defaultWfDir) {
      process.stderr.write('error: parent dir not found: ' + parentDir + '\n');
      process.exit(2);
    }
  }

  // Resolve the brainstorm skill via provider
  var resolved = provider.resolveSkill('brainstorm');

  // Build the context block (~10-12 lines of guidance)
  var contextLines = [
    'Workflow brainstorm context',
    '===========================',
    'Target workflow name: ' + workflowName,
    'Output path:         ' + resolvedOut,
    '',
    'Please design a new workflow YAML with the following structure:',
    '',
    '  workflow: ' + workflowName,
    '  version: 1',
    '  binds_to: quick  # or: phase | milestone',
    '  principles:',
    '    - <guiding principle 1>',
    '    - <guiding principle 2>',
    '  defaults:',
    '    model: default',
    '  phases:',
    '    - id: <phase-id>',
    '      role: <planner | implementer | verifier | researcher | ...>',
    '      depends_on: [<other-phase-id>]  # omit for root phases',
    '      prompt: |',
    '        <What this phase should accomplish.>',
    '',
    'Each phase should have a single clear responsibility.',
    'When done, write the YAML to: ' + resolvedOut,
    'Then run: cp workflow validate ' + workflowName,
  ];
  var contextBlock = contextLines.join('\n');

  var isManual = resolved.name === 'manual' || resolved.fallback === true;

  if (isManual) {
    // Manual path: print the manual prompt (if any) + context block to stdout
    var manualPrompt = provider.resolvePrompt('brainstorm');
    if (manualPrompt) {
      process.stdout.write(manualPrompt + '\n\n');
    }
    process.stdout.write(contextBlock + '\n');
    process.stderr.write(
      'next: write your YAML to ' + resolvedOut +
      ', then run "cp workflow validate ' + workflowName + '"\n'
    );
  } else {
    // Provider path: emit structured delegation message
    process.stdout.write(
      'Designing a new workflow. Please invoke the ' + resolved.name +
      ' brainstorm skill with this context:\n\n' +
      contextBlock + '\n'
    );
    process.stderr.write(
      'skill: ' + (resolved.skill || '(none)') +
      '  provider: ' + resolved.name +
      '  out: ' + resolvedOut + '\n'
    );
  }
}

// ---------- dispatcher ----------

function run(args) {
  var sub = args[0];
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    printHelp();
    process.exit(0);
  }

  var rest = args.slice(1);
  var cwd = process.cwd();

  switch (sub) {
    case 'ls':          return workflowLs(rest, cwd);
    case 'show':        return workflowShow(rest, cwd);
    case 'validate':    return workflowValidate(rest, cwd);
    case 'diagram':     return workflowDiagram(rest, cwd);
    case 'inspect':     return workflowInspect(rest, cwd);
    case 'init':        return workflowInit(rest, cwd);
    case 'new':         return workflowNew(rest, cwd);
    case 'import':      return workflowImport(rest, cwd);
    case 'export':      return workflowExport(rest, cwd);
    case 'brainstorm':  return workflowBrainstorm(rest, cwd);
    default:
      process.stderr.write('error: unknown workflow subcommand "' + sub + '".\n');
      printHelp();
      process.exit(2);
  }
}

module.exports = { name: 'workflow', run };
