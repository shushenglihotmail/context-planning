'use strict';

/**
 * Unit tests for v1.10 provider primitives:
 *   - parseSkillName (parens-sigil parser)
 *   - findFuzzyMatch (token-overlap matcher)
 *   - listProviderSkills (filesystem catalog scan)
 *   - skillExists (per-skill SKILL.md stat)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const provider = require('../lib/provider');

let pass = 0;
let fail = 0;

function ok(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    pass += 1;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    fail += 1;
  }
}

// ───────────── parseSkillName ─────────────

console.log('parseSkillName');

ok('bare name → strict', () => {
  assert.deepStrictEqual(provider.parseSkillName('writing-plans'), {
    name: 'writing-plans',
    fuzzy: false,
  });
});

ok('parens → fuzzy', () => {
  assert.deepStrictEqual(provider.parseSkillName('(code-review)'), {
    name: 'code-review',
    fuzzy: true,
  });
});

ok('whitespace inside parens trimmed', () => {
  assert.deepStrictEqual(provider.parseSkillName('( foo )'), {
    name: 'foo',
    fuzzy: true,
  });
});

ok('outer whitespace trimmed', () => {
  assert.deepStrictEqual(provider.parseSkillName('  foo  '), {
    name: 'foo',
    fuzzy: false,
  });
});

ok('empty string throws', () => {
  assert.throws(() => provider.parseSkillName(''), /empty input/);
});

ok('empty parens throws', () => {
  assert.throws(() => provider.parseSkillName('()'), /empty sigil/);
});

ok('unbalanced ( throws', () => {
  assert.throws(() => provider.parseSkillName('(foo'), /unbalanced parens/);
});

ok('unbalanced ) throws', () => {
  assert.throws(() => provider.parseSkillName('foo)'), /unbalanced parens/);
});

ok('nested parens throws', () => {
  assert.throws(() => provider.parseSkillName('((foo))'), /nested parens/);
});

ok('stray inner paren throws', () => {
  assert.throws(() => provider.parseSkillName('foo(bar'), /stray paren/);
});

ok('non-string throws', () => {
  assert.throws(() => provider.parseSkillName(null), /expected string/);
  assert.throws(() => provider.parseSkillName(42), /expected string/);
});

// ───────────── findFuzzyMatch ─────────────

console.log('findFuzzyMatch');

ok('empty candidates → null', () => {
  const r = provider.findFuzzyMatch('foo', []);
  assert.strictEqual(r.chosen, null);
  assert.deepStrictEqual(r.candidates, []);
});

ok('exact token match → score 1.0', () => {
  const r = provider.findFuzzyMatch('foo', ['foo']);
  assert.strictEqual(r.chosen, 'foo');
  assert.strictEqual(r.candidates[0].score, 1);
});

ok('code-review vs receiving-code-review → matched (0.667)', () => {
  const r = provider.findFuzzyMatch('code-review', ['receiving-code-review']);
  assert.strictEqual(r.chosen, 'receiving-code-review');
  // 2 matched tokens / max(2,3) = 0.667
  assert(Math.abs(r.candidates[0].score - 2 / 3) < 1e-9);
});

ok('substring match: review ⊂ reviewer counts', () => {
  const r = provider.findFuzzyMatch('reviewer', ['code-review']);
  // hint tokens: [reviewer], candidate tokens: [code, review]
  // reviewer.includes(review) → match. matched=1, denom=max(1,2)=2 → 0.5 (boundary)
  assert.strictEqual(r.chosen, 'code-review');
  assert.strictEqual(r.candidates[0].score, 0.5);
});

ok('below threshold → not chosen', () => {
  // hint: [a,b,c,d,e] (5 tokens) vs cand: [x,y,z,w,v,u,a] (7 tokens):
  // 1 matched / max(5,7) = 0.143 → below 0.5
  const r = provider.findFuzzyMatch('a-b-c-d-e', ['x-y-z-w-v-u-a']);
  assert.strictEqual(r.chosen, null);
});

ok('tiebreak by length (shorter wins)', () => {
  // both score same; pick shorter
  const r = provider.findFuzzyMatch('code-review', [
    'receiving-code-review',
    'requesting-code-review-long',
  ]);
  assert.strictEqual(r.chosen, 'receiving-code-review');
});

ok('tiebreak by alpha when same length & score', () => {
  // receiving-code-review and requesting-code-review both 22 chars, same score
  const r = provider.findFuzzyMatch('code-review', [
    'requesting-code-review',
    'receiving-code-review',
  ]);
  assert.strictEqual(r.chosen, 'receiving-code-review'); // 'rece' < 'requ'
});

ok('deterministic across calls', () => {
  const cands = ['alpha-beta', 'gamma-delta', 'alpha-gamma'];
  const r1 = provider.findFuzzyMatch('alpha', cands);
  const r2 = provider.findFuzzyMatch('alpha', cands);
  assert.deepStrictEqual(r1, r2);
});

ok('candidates list is sorted by score desc then length asc then alpha', () => {
  const r = provider.findFuzzyMatch('foo-bar', ['foo-bar-baz', 'foo-bar', 'qux']);
  assert.strictEqual(r.chosen, 'foo-bar');
  assert.strictEqual(r.candidates[0].name, 'foo-bar');
  assert.strictEqual(r.candidates[1].name, 'foo-bar-baz');
  assert.strictEqual(r.candidates.length, 2); // qux below threshold
});

// ───────────── listProviderSkills + skillExists ─────────────

console.log('listProviderSkills + skillExists');

// Build a synthetic fixture provider with 3 skills
const fixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-provider-fuzzy-'));
const skillsDir = path.join(fixRoot, 'skills');
fs.mkdirSync(skillsDir, { recursive: true });
for (const name of ['alpha', 'beta-skill', 'gamma_skill']) {
  fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, name, 'SKILL.md'), `# ${name}\n`);
}
// Add a non-skill dir (no SKILL.md) — should be ignored
fs.mkdirSync(path.join(skillsDir, 'not-a-skill'));

// Synthesise a minimal cfg with a fixture provider that detection will find
const fixtureCfg = {
  cp: {
    harnesses: {
      fixture: {
        plugin_roots: [path.dirname(fixRoot)],
      },
    },
    providers: {
      'fix-prov': {
        plugin_shape: {
          dir_name: path.basename(fixRoot),
          required_subdirs: [],
        },
        detect: {},
      },
    },
  },
};

ok('listProviderSkills returns sorted skill names', () => {
  const names = provider.listProviderSkills('fix-prov', fixtureCfg, fixRoot);
  assert.deepStrictEqual(names, ['alpha', 'beta-skill', 'gamma_skill']);
});

ok('listProviderSkills ignores dirs without SKILL.md', () => {
  const names = provider.listProviderSkills('fix-prov', fixtureCfg, fixRoot);
  assert(!names.includes('not-a-skill'));
});

ok('listProviderSkills → [] for missing provider', () => {
  const names = provider.listProviderSkills('does-not-exist', fixtureCfg, fixRoot);
  assert.deepStrictEqual(names, []);
});

ok('listProviderSkills → [] for manual provider (no skills dir)', () => {
  const cfg = {
    cp: {
      providers: {
        manual: { detect: { always: true } },
      },
    },
  };
  const names = provider.listProviderSkills('manual', cfg, fixRoot);
  assert.deepStrictEqual(names, []);
});

ok('skillExists true for present skill', () => {
  assert.strictEqual(provider.skillExists('fix-prov', 'alpha', fixtureCfg, fixRoot), true);
});

ok('skillExists false for missing skill', () => {
  assert.strictEqual(provider.skillExists('fix-prov', 'zeta', fixtureCfg, fixRoot), false);
});

ok('skillExists false for non-installed provider', () => {
  assert.strictEqual(provider.skillExists('nope', 'alpha', fixtureCfg, fixRoot), false);
});

ok('skillExists false for empty/invalid name', () => {
  assert.strictEqual(provider.skillExists('fix-prov', '', fixtureCfg, fixRoot), false);
  assert.strictEqual(provider.skillExists('fix-prov', null, fixtureCfg, fixRoot), false);
});

// Cleanup fixture
fs.rmSync(fixRoot, { recursive: true, force: true });

// ───────────── resolvePromptForRole alias ─────────────

console.log('resolvePromptForRole alias');

ok('resolvePromptForRole === resolvePrompt', () => {
  assert.strictEqual(provider.resolvePromptForRole, provider.resolvePrompt);
});

// ───────────── summary ─────────────

console.log('');
console.log(`unit-provider-fuzzy: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
