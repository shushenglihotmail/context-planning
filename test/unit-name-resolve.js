#!/usr/bin/env node
'use strict';

/**
 * Unit tests for lib/name-resolve.js.
 */

const { resolveByName, formatError } = require('../lib/name-resolve');

let passed = 0, failed = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \u2713 ${label}`); passed++; }
  else { console.log(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`); failed++; }
}
function section(t) { console.log(`\n=== ${t} ===`); }

console.log('=== name-resolve unit tests ===');

section('resolveByName — exact match');
{
  const list = [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }];
  const r = resolveByName(list, 'beta');
  ok('exact match returns ok', r.ok === true);
  ok('exact match returns the candidate', r.match && r.match.name === 'beta');
}

section('resolveByName — case-insensitive exact');
{
  const list = [{ name: 'Alpha' }, { name: 'Beta' }];
  const r = resolveByName(list, 'ALPHA');
  ok('uppercase query matches mixed-case name', r.ok && r.match.name === 'Alpha');
}

section('resolveByName — substring match');
{
  const list = [{ name: 'context-planning' }, { name: 'other-thing' }];
  const r = resolveByName(list, 'plan');
  ok('substring match returns ok', r.ok === true);
  ok('substring match returns the candidate', r.match && r.match.name === 'context-planning');
}

section('resolveByName — ambiguous substring');
{
  const list = [{ name: 'cookbook' }, { name: 'codecraft' }, { name: 'context-planning' }];
  const r = resolveByName(list, 'co');
  ok('ambiguous returns not ok', r.ok === false);
  ok('ambiguous kind is "ambiguous"', r.kind === 'ambiguous');
  ok('ambiguous candidates include all 3', r.candidates && r.candidates.length === 3);
}

section('resolveByName — no match');
{
  const list = [{ name: 'alpha' }, { name: 'beta' }];
  const r = resolveByName(list, 'zzz');
  ok('no match returns not ok', r.ok === false);
  ok('no-match kind is "none"', r.kind === 'none');
  ok('no-match returns full list as candidates', r.candidates && r.candidates.length === 2);
}

section('resolveByName — exact wins over substring');
{
  // 'foo' is a substring of 'foobar', but exact 'foo' should win.
  const list = [{ name: 'foo' }, { name: 'foobar' }];
  const r = resolveByName(list, 'foo');
  ok('exact match wins over substring', r.ok && r.match.name === 'foo');
}

section('resolveByName — empty query');
{
  const r = resolveByName([{ name: 'a' }], '');
  ok('empty query returns not ok', r.ok === false);
  ok('empty query kind is "none"', r.kind === 'none');
}

section('resolveByName — empty list');
{
  const r = resolveByName([], 'foo');
  ok('empty list returns not ok', r.ok === false);
  ok('empty list candidates are empty', r.candidates.length === 0);
}

section('resolveByName — duplicate exact names');
{
  const list = [{ name: 'foo', id: 1 }, { name: 'foo', id: 2 }];
  const r = resolveByName(list, 'foo');
  ok('duplicate exact returns ambiguous', r.ok === false && r.kind === 'ambiguous');
  ok('both duplicates appear in candidates', r.candidates.length === 2);
}

section('resolveByName — null / undefined inputs');
{
  const r1 = resolveByName(null, 'foo');
  ok('null candidates handled', r1.ok === false && r1.candidates.length === 0);
  const r2 = resolveByName([{ name: 'a' }], null);
  ok('null query handled', r2.ok === false && r2.kind === 'none');
  const r3 = resolveByName([{ name: 'a' }], undefined);
  ok('undefined query handled', r3.ok === false && r3.kind === 'none');
}

section('formatError — no-match with candidates');
{
  const r = { kind: 'none', candidates: [{ name: 'alpha' }, { name: 'beta' }] };
  const msg = formatError('project', 'gamma', r);
  ok('mentions noun', msg.includes('no project named'));
  ok('mentions query', msg.includes('"gamma"'));
  ok('lists candidates', msg.includes('alpha') && msg.includes('beta'));
}

section('formatError — no-match with empty candidates');
{
  const r = { kind: 'none', candidates: [] };
  const msg = formatError('milestone', 'foo', r);
  ok('reports zero candidates message', msg.includes('no milestones registered') || msg.includes('no milestones'));
}

section('formatError — ambiguous');
{
  const r = { kind: 'ambiguous', candidates: [
    { name: 'cookbook' }, { name: 'codecraft' }, { name: 'context-planning' }
  ] };
  const msg = formatError('project', 'co', r);
  ok('reports count', msg.includes('3 projects match'));
  ok('mentions query', msg.includes('"co"'));
  ok('lists all 3', msg.includes('cookbook') && msg.includes('codecraft') && msg.includes('context-planning'));
}

section('formatError — slug shown when different from name');
{
  const r = { kind: 'none', candidates: [{ name: 'My Milestone', slug: 'my-milestone' }] };
  const msg = formatError('milestone', 'foo', r);
  ok('slug rendered in parens when different', msg.includes('my-milestone'));
}

section('formatError — slug hidden when equal to name');
{
  const r = { kind: 'none', candidates: [{ name: 'same', slug: 'same' }] };
  const msg = formatError('project', 'foo', r);
  ok('slug not duplicated when equal to name',
    (msg.match(/same/g) || []).length === 1);
}

console.log(`\nResults: passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
