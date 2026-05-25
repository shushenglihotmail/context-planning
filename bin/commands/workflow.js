'use strict';

/**
 * cp workflow — static template management commands.
 *
 * Dispatches to 7 sub-handlers:
 *   ls [--json]                     – list built-in + project templates
 *   show <name>                     – print resolved template YAML to stdout
 *   validate <name-or-path>         – validate a template; --strict treats warnings as errors
 *   diagram <name-or-path>          – emit Mermaid flowchart to stdout
 *   init                            – create .planning/workflows/ directory
 *   new <name> [--from <built-in>]  – scaffold a new template file
 *   import <path> [--name <n>]      – copy + validate an external template
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
 * Falls back to 'custom' on any error.
 */
function safeBindsTo(filePath) {
  try {
    var tpl = wfLib.loadTemplate(filePath, {});
    return (tpl.meta && tpl.meta.binds_to) || 'custom';
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
  var bindsTo = (tpl.meta && tpl.meta.binds_to) || 'custom';

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
 * cp workflow init
 */
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
      'binds_to: custom  # TODO: change to milestone or phase if needed',
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
    case 'ls':       return workflowLs(rest, cwd);
    case 'show':     return workflowShow(rest, cwd);
    case 'validate': return workflowValidate(rest, cwd);
    case 'diagram':  return workflowDiagram(rest, cwd);
    case 'init':     return workflowInit(rest, cwd);
    case 'new':      return workflowNew(rest, cwd);
    case 'import':   return workflowImport(rest, cwd);
    default:
      process.stderr.write('error: unknown workflow subcommand "' + sub + '".\n');
      printHelp();
      process.exit(2);
  }
}

module.exports = { name: 'workflow', run };
