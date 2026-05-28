'use strict';

/**
 * cp classify — message-broker rubric + validator + recorder.
 *
 * Subcommands:
 *   cp classify rubric                  Print the rubric markdown.
 *   cp classify validate                Read JSON from stdin, validate
 *                                       the shape. Exit 0 if valid.
 *   cp classify record <slug> <phase>   Read JSON from stdin, validate,
 *                                       and append to state.json under
 *                                       phases.<phase>.classifier_history.
 *
 * Common flags:
 *   --projectDir <path>                 Override cwd.
 *   --json                              Machine-readable output.
 */

const classify = require('../../lib/classify');

var USAGE = [
  'cp classify <subcommand>',
  '',
  'Message-broker rubric + persistence for supervised workflow runs.',
  '',
  'Subcommands:',
  '  cp classify rubric                  Print the rubric markdown.',
  '  cp classify validate                Read a classification JSON from',
  '                                      stdin and validate the shape.',
  '  cp classify record <slug> <phase>   Read a classification JSON from',
  '                                      stdin, validate, and append to',
  '                                      phases.<phase>.classifier_history.',
  '',
  'Common flags:',
  '  --projectDir <path>                 Override cwd (rare).',
  '  --json                              Machine-readable output.',
  '',
].join('\n');

function printHelp() { console.log(USAGE); }

function consumeFlag(args, flag) {
  var idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function consumeOpt(args, opt) {
  var idx = args.indexOf(opt);
  if (idx === -1) return null;
  var v = args[idx + 1] || null;
  args.splice(idx, 2);
  return v;
}

function readStdin() {
  // Synchronous stdin read — small JSON payloads only.
  try {
    var buf = require('fs').readFileSync(0, 'utf8');
    return buf;
  } catch (e) {
    return '';
  }
}

function run(args) {
  if (!args || args.length === 0) { printHelp(); return; }
  var a = args.slice();
  var first = a[0];
  if (first === '--help' || first === '-h' || first === 'help') { printHelp(); return; }

  var pd = consumeOpt(a, '--projectDir') || process.cwd();
  var jsonOut = consumeFlag(a, '--json');
  var sub = a[0];

  if (sub === 'rubric') {
    process.stdout.write(classify.rubric(pd));
    return;
  }

  if (sub === 'validate') {
    var raw = readStdin();
    if (!raw || raw.trim().length === 0) {
      process.stderr.write('cp classify validate: no JSON on stdin\n');
      process.exit(2);
    }
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      if (jsonOut) console.log(JSON.stringify({ok: false, errors: ['invalid JSON: ' + e.message]}));
      else process.stderr.write('cp classify validate: invalid JSON: ' + e.message + '\n');
      process.exit(1);
    }
    var v = classify.validateClassification(parsed);
    if (jsonOut) {
      console.log(JSON.stringify(v));
    } else {
      if (v.ok) console.log('ok');
      else process.stderr.write('invalid: ' + v.errors.join('; ') + '\n');
    }
    process.exit(v.ok ? 0 : 1);
  }

  if (sub === 'record') {
    var slug = a[1];
    var phaseId = a[2];
    if (!slug || !phaseId) {
      process.stderr.write('Usage: cp classify record <slug> <phase-id>\n');
      process.exit(2);
    }
    var rawR = readStdin();
    if (!rawR || rawR.trim().length === 0) {
      process.stderr.write('cp classify record: no JSON on stdin\n');
      process.exit(2);
    }
    var parsedR;
    try { parsedR = JSON.parse(rawR); }
    catch (e) {
      process.stderr.write('cp classify record: invalid JSON: ' + e.message + '\n');
      process.exit(1);
    }
    try {
      var st = classify.recordClassification(slug, phaseId, parsedR, {projectDir: pd});
      if (jsonOut) console.log(JSON.stringify(st, null, 2));
      else process.stderr.write('ok\n');
    } catch (e) {
      process.stderr.write('cp classify record: ' + e.message + '\n');
      process.exit(1);
    }
    return;
  }

  process.stderr.write('cp classify: unknown subcommand: ' + sub + '\n');
  printHelp();
  process.exit(2);
}

module.exports = {name: 'classify', run: run};
