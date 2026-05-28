'use strict';

/**
 * cp checkpoint — bracket supervised-workflow phases with git operations.
 *
 * Subcommands:
 *   cp checkpoint snapshot <slug> <phase>   Record HEAD as snapshot.
 *   cp checkpoint commit   <slug> <phase>   Stage + commit declared outputs.
 *   cp checkpoint revert   <slug> <phase>   Revert uncommitted writes in declared outputs.
 *   cp checkpoint restart  <slug> <phase>   Reset phase to pending; reset HEAD to snapshot
 *                                           (if safe). --force overrides safety checks.
 *
 * Common flags:
 *   --projectDir <path>                     Override cwd.
 *   --json                                  Machine-readable output.
 *   --message <msg>                         Override commit message (commit only).
 *   --outputs <comma-list>                  Override declared outputs (testing aid).
 *   --allow-empty                           Allow empty commit (commit only).
 *   --force                                 Skip safety checks (restart only).
 */

const checkpoint = require('../../lib/checkpoint');

var USAGE = [
  'cp checkpoint <subcommand>',
  '',
  'Bracket supervised-workflow phases with git operations.',
  '',
  'Subcommands:',
  '  cp checkpoint snapshot <slug> <phase>   Record HEAD as snapshot.',
  '  cp checkpoint commit   <slug> <phase>   Stage + commit declared outputs.',
  '  cp checkpoint revert   <slug> <phase>   Revert uncommitted writes in declared outputs.',
  '  cp checkpoint restart  <slug> <phase>   Reset phase to pending and roll HEAD back',
  '                                          to its snapshot (if safe).',
  '',
  'Common flags:',
  '  --projectDir <path>                     Override cwd (rare).',
  '  --json                                  Machine-readable output.',
  '  --message <msg>                         Override commit message (commit only).',
  '  --outputs <a,b,c>                       Override declared outputs.',
  '  --allow-empty                           Allow empty commit (commit only).',
  '  --force                                 Skip safety checks (restart only).',
  '',
].join('\n');

function printHelp() { console.log(USAGE); }

function consumeFlag(args, flag) {
  var i = args.indexOf(flag);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}
function consumeOpt(args, opt) {
  var i = args.indexOf(opt);
  if (i === -1) return null;
  var v = args[i + 1] || null;
  args.splice(i, 2);
  return v;
}

function run(args) {
  if (!args || args.length === 0) { printHelp(); return; }
  var a = args.slice();
  var first = a[0];
  if (first === '--help' || first === '-h' || first === 'help') { printHelp(); return; }

  var pd = consumeOpt(a, '--projectDir') || process.cwd();
  var jsonOut = consumeFlag(a, '--json');
  var msg = consumeOpt(a, '--message');
  var outputsCsv = consumeOpt(a, '--outputs');
  var allowEmpty = consumeFlag(a, '--allow-empty');
  var force = consumeFlag(a, '--force');
  var outputs = outputsCsv ? outputsCsv.split(',').map(s => s.trim()).filter(Boolean) : null;

  var sub = a[0];
  var slug = a[1];
  var phaseId = a[2];

  if (!slug || !phaseId) {
    process.stderr.write('Usage: cp checkpoint ' + (sub || '<sub>') + ' <slug> <phase-id>\n');
    process.exit(2);
  }

  var opts = {projectDir: pd};
  if (msg) opts.message = msg;
  if (outputs) opts.outputs = outputs;
  if (allowEmpty) opts.allowEmpty = true;
  if (force) opts.force = true;

  try {
    var result;
    switch (sub) {
      case 'snapshot': result = checkpoint.snapshot(slug, phaseId, opts); break;
      case 'commit':   result = checkpoint.commit(slug, phaseId, opts); break;
      case 'revert':   result = checkpoint.revert(slug, phaseId, opts); break;
      case 'restart':  result = checkpoint.restart(slug, phaseId, opts); break;
      default:
        process.stderr.write('cp checkpoint: unknown subcommand: ' + sub + '\n');
        printHelp();
        process.exit(2);
        return;
    }
    if (jsonOut) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      var short;
      switch (sub) {
        case 'snapshot': short = 'snapshot ' + (result.sha || '(no HEAD)'); break;
        case 'commit':   short = 'commit ' + (result.commit || '(no changes)') +
                          (result.skippedOutOfScope ? ' (skipped ' + result.skippedOutOfScope + ' out-of-scope file(s))' : '');
                          break;
        case 'revert':   short = 'reverted ' + result.reverted.length + ' path(s)'; break;
        case 'restart':  short = 'restarted to ' + (result.restartedTo || '(no snapshot)'); break;
      }
      console.log(short);
    }
  } catch (e) {
    process.stderr.write('cp checkpoint ' + sub + ': ' + e.message + '\n');
    process.exit(1);
  }
}

module.exports = {name: 'checkpoint', run: run};
