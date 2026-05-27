'use strict';

/**
 * cp phase-template — discover, inspect, and scaffold phase templates (v1.3).
 *
 * Sub-commands:
 *   ls [--json]                       list built-in + project phase templates
 *   show <name>                       print a phase-template's YAML to stdout
 *   new <name> [--from <built-in>] [--force]
 *                                     scaffold a new phase-template file
 *
 * Project-scope (`.planning/phase-templates/`) shadows builtin
 * (`templates/phase-templates/`) by same name; the `source` column in `ls`
 * shows which directory each entry comes from.
 *
 * Exit codes:
 *   0  ok
 *   2  usage error
 *   3  template not found
 *   6  file already exists (without --force)
 */

const fs = require('fs');
const path = require('path');
const { resolvePhaseTemplate } = require('../../lib/phase-template-loader');

const USAGE = [
  'cp phase-template <subcommand>',
  '',
  'Manage phase templates.',
  '',
  'Subcommands:',
  '  cp phase-template ls [--json]',
  '                                        List all phase templates (built-in + project).',
  '  cp phase-template show <name>',
  '                                        Print a phase template\'s YAML to stdout.',
  '  cp phase-template new <name> [--from <built-in>] [--force]',
  '                                        Scaffold a new phase template file under',
  '                                        .planning/phase-templates/<name>.yaml.',
  '',
].join('\n');

function builtinDir() {
  return path.resolve(__dirname, '..', '..', 'templates', 'phase-templates');
}

function projectDir(cwd) {
  return path.resolve(cwd || process.cwd(), '.planning', 'phase-templates');
}

function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.ya?ml$/i.test(f))
      .filter((f) => !/^_/.test(f)); // skip _fixtures-v13 etc.
  } catch (_) {
    return [];
  }
}

function listDirs(parent) {
  // Skip subdirs starting with _ (fixture conventions).
  if (!fs.existsSync(parent)) return [];
  try {
    return fs.readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'));
  } catch (_) { return []; }
}

function phaseTemplateLs(args) {
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
  }
  const entries = [];
  const cwd = process.cwd();
  const bd = builtinDir();
  for (const f of listYamlFiles(bd)) {
    const file = path.join(bd, f);
    entries.push({
      name: path.basename(f, path.extname(f)),
      source: 'built-in',
      path: file,
    });
  }
  const pd = projectDir(cwd);
  for (const f of listYamlFiles(pd)) {
    const file = path.join(pd, f);
    entries.push({
      name: path.basename(f, path.extname(f)),
      source: 'project',
      path: file,
    });
  }
  if (json) { process.stdout.write(JSON.stringify(entries, null, 2) + '\n'); return; }
  if (entries.length === 0) { process.stdout.write('(no phase templates found)\n'); return; }
  let nameW = 'name'.length;
  let srcW = 'source'.length;
  for (const e of entries) {
    if (e.name.length > nameW) nameW = e.name.length;
    if (e.source.length > srcW) srcW = e.source.length;
  }
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  process.stdout.write(pad('name', nameW) + '  ' + pad('source', srcW) + '\n');
  process.stdout.write('-'.repeat(nameW) + '  ' + '-'.repeat(srcW) + '\n');
  for (const e of entries) {
    process.stdout.write(pad(e.name, nameW) + '  ' + e.source + '\n');
  }
}

function phaseTemplateShow(args) {
  let name = null;
  for (const a of args) {
    if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) name = a;
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }
  if (!name) { process.stderr.write('Usage: cp phase-template show <name>\n'); process.exit(2); }
  let filePath;
  try {
    filePath = resolvePhaseTemplate(name, { projectDir: process.cwd() });
  } catch (e) {
    if (/not found/i.test(e.message || '')) {
      process.stderr.write('error: phase template "' + name + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + (e.message || e) + '\n'); process.exit(1);
  }
  const body = fs.readFileSync(filePath, 'utf8');
  process.stdout.write('# phase-template: ' + name + ' (source: ' + filePath + ')\n');
  process.stdout.write(body);
  if (body.length > 0 && body[body.length - 1] !== '\n') process.stdout.write('\n');
}

function phaseTemplateNew(args) {
  let name = null;
  let from = null;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--force') force = true;
    else if (a === '--from') { from = args[++i]; }
    else if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) name = a;
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }
  if (!name) { process.stderr.write('Usage: cp phase-template new <name> [--from <built-in>] [--force]\n'); process.exit(2); }
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
    process.stderr.write('error: phase-template name must match /^[a-z][a-z0-9-]*$/i\n'); process.exit(2);
  }

  const pd = projectDir(process.cwd());
  fs.mkdirSync(pd, { recursive: true });
  const dest = path.join(pd, name + '.yaml');
  if (fs.existsSync(dest) && !force) {
    process.stderr.write('error: ' + dest + ' already exists (use --force to overwrite)\n'); process.exit(6);
  }

  let body;
  if (from) {
    let srcPath;
    try {
      srcPath = resolvePhaseTemplate(from, { projectDir: process.cwd() });
    } catch (e) {
      process.stderr.write('error: --from "' + from + '" not found: ' + e.message + '\n'); process.exit(3);
    }
    body = fs.readFileSync(srcPath, 'utf8');
    // Best-effort rename of name: line.
    body = body.replace(/^name:\s*.*$/m, 'name: ' + name);
  } else {
    body = STARTER.replace(/\{\{NAME\}\}/g, name);
  }
  fs.writeFileSync(dest, body, 'utf8');
  process.stdout.write('✓ ' + path.relative(process.cwd(), dest) + '\n');
}

const STARTER = [
  'name: {{NAME}}',
  'params:',
  '  - name: scope',
  'body:',
  '  role: reviewer',
  '  prompt: "Review {{scope}} for issues."',
  '',
].join('\n');

function run(args) {
  if (!args || args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(USAGE + '\n');
    return;
  }
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case 'ls': return phaseTemplateLs(rest);
    case 'show': return phaseTemplateShow(rest);
    case 'new': return phaseTemplateNew(rest);
    default:
      process.stderr.write('unknown subcommand: ' + sub + '\n');
      process.stderr.write(USAGE + '\n');
      process.exit(2);
  }
}

module.exports = { run, USAGE };
