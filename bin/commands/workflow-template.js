'use strict';

/**
 * cp workflow-template — discover, inspect, and scaffold workflow templates (v1.3).
 *
 * Sub-commands:
 *   ls [--json]                       list built-in + project workflow templates
 *   show <name>                       print a workflow-template's YAML to stdout
 *   new <name> [--from <built-in>] [--force]
 *                                     scaffold a new workflow-template file
 *
 * Project-scope (`.planning/workflow-templates/`) shadows builtin
 * (`templates/workflow-templates/`) by same name.
 *
 * Exit codes:
 *   0  ok
 *   2  usage error
 *   3  template not found
 *   6  file already exists (without --force)
 */

const fs = require('fs');
const path = require('path');
const { resolveWorkflowTemplate } = require('../../lib/workflow-template-loader');

const USAGE = [
  'cp workflow-template <subcommand>',
  '',
  'Manage workflow templates.',
  '',
  'Subcommands:',
  '  cp workflow-template ls [--json]',
  '                                        List all workflow templates (built-in + project).',
  '  cp workflow-template show <name>',
  '                                        Print a workflow template\'s YAML to stdout.',
  '  cp workflow-template new <name> [--from <built-in>] [--force]',
  '                                        Scaffold a new workflow template file under',
  '                                        .planning/workflow-templates/<name>.yaml.',
  '',
].join('\n');

function builtinDir() {
  return path.resolve(__dirname, '..', '..', 'templates', 'workflow-templates');
}

function projectDir(cwd) {
  return path.resolve(cwd || process.cwd(), '.planning', 'workflow-templates');
}

function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.ya?ml$/i.test(f))
      .filter((f) => !/^_/.test(f));
  } catch (_) {
    return [];
  }
}

function workflowTemplateLs(args) {
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
  }
  const entries = [];
  const cwd = process.cwd();
  for (const f of listYamlFiles(builtinDir())) {
    const file = path.join(builtinDir(), f);
    entries.push({ name: path.basename(f, path.extname(f)), source: 'built-in', path: file });
  }
  for (const f of listYamlFiles(projectDir(cwd))) {
    const file = path.join(projectDir(cwd), f);
    entries.push({ name: path.basename(f, path.extname(f)), source: 'project', path: file });
  }
  if (json) { process.stdout.write(JSON.stringify(entries, null, 2) + '\n'); return; }
  if (entries.length === 0) { process.stdout.write('(no workflow templates found)\n'); return; }
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

function workflowTemplateShow(args) {
  let name = null;
  for (const a of args) {
    if (a.startsWith('-')) { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
    else if (!name) name = a;
    else { process.stderr.write('unexpected arg: ' + a + '\n'); process.exit(2); }
  }
  if (!name) { process.stderr.write('Usage: cp workflow-template show <name>\n'); process.exit(2); }
  let filePath;
  try {
    filePath = resolveWorkflowTemplate(name, { projectDir: process.cwd() });
  } catch (e) {
    if (/not found/i.test(e.message || '')) {
      process.stderr.write('error: workflow template "' + name + '" not found.\n');
      process.exit(3);
    }
    process.stderr.write('error: ' + (e.message || e) + '\n'); process.exit(1);
  }
  const body = fs.readFileSync(filePath, 'utf8');
  process.stdout.write('# workflow-template: ' + name + ' (source: ' + filePath + ')\n');
  process.stdout.write(body);
  if (body.length > 0 && body[body.length - 1] !== '\n') process.stdout.write('\n');
}

function workflowTemplateNew(args) {
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
  if (!name) { process.stderr.write('Usage: cp workflow-template new <name> [--from <built-in>] [--force]\n'); process.exit(2); }
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
    process.stderr.write('error: workflow-template name must match /^[a-z][a-z0-9-]*$/i\n'); process.exit(2);
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
      srcPath = resolveWorkflowTemplate(from, { projectDir: process.cwd() });
    } catch (e) {
      process.stderr.write('error: --from "' + from + '" not found: ' + e.message + '\n'); process.exit(3);
    }
    body = fs.readFileSync(srcPath, 'utf8');
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
  'phases:',
  '  - phase:',
  '      id: start',
  '      role: planner',
  '      prompt: "Plan work for {{scope}}."',
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
    case 'ls': return workflowTemplateLs(rest);
    case 'show': return workflowTemplateShow(rest);
    case 'new': return workflowTemplateNew(rest);
    default:
      process.stderr.write('unknown subcommand: ' + sub + '\n');
      process.stderr.write(USAGE + '\n');
      process.exit(2);
  }
}

module.exports = { run, USAGE };
