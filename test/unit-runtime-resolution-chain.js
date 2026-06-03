'use strict';

/**
 * Phase 115 (v1.10) unit tests for runtime.resolvePhaseSkill v1.10 chain.
 *
 * Verifies the extended resolution sources beyond v1.9's
 * {absent, routing-key, pinned, pass-through}:
 *   - fuzzy-match       (sigil + listProviderSkills + findFuzzyMatch hit)
 *   - exact-missing     (literal skill absent from active provider catalog,
 *                        falls through; missingFrom set)
 *   - manual-prompt     (chain fallback, phaseRole resolves a manual prompt)
 *   - subagent-dispatch (chain last resort, no role or no manual prompt)
 *   - malformed sigil   (warning, pass-through raw string)
 *
 * Also smoke-tests formatInstruction emits a [resolution] line and inlines
 * [manual-prompt]…[/manual-prompt] when applicable.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runtime = require('../lib/runtime');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err && err.message ? err.message : err}`);
    failed++;
  }
}

/**
 * Build a project dir whose active provider points at a synthetic on-disk
 * skills catalog with the given skill names. Provider name is configurable
 * so the project's plugin_shape.dir_name matches an actual directory under
 * `~/.copilot/installed-plugins` — which we can't fake — OR points at a
 * local marketplace path the provider module can resolve.
 *
 * Trick: provider._findSkillsDir scans installed-plugins. To inject a
 * synthetic catalog, we instead use the manual provider path: write skills
 * under `.planning/providers/<provName>/skills/<skill>/SKILL.md`. The
 * provider.listProviderSkills helper looks under installed-plugins, NOT
 * under .planning/providers — so we need a different injection.
 *
 * Solution: monkey-patch provider.listProviderSkills + provider.skillExists
 * for the duration of each test. This is cleaner than synthesizing a fake
 * ~/.copilot tree.
 */
const provider = require('../lib/provider');
const origList = provider.listProviderSkills;
const origExists = provider.skillExists;
const origResolvePrompt = provider.resolvePromptForRole;

function withFakeCatalog(catalog, prompts, fn) {
  // catalog: { [providerName]: string[] }
  // prompts: { [role]: string|null }
  provider.listProviderSkills = (provName) => {
    const list = catalog[provName] || [];
    return list.slice();
  };
  provider.skillExists = (provName, skillName) => {
    const list = catalog[provName] || [];
    return list.indexOf(skillName) !== -1;
  };
  provider.resolvePromptForRole = (role) => {
    if (!prompts) return null;
    return prompts[role] || null;
  };
  try {
    fn();
  } finally {
    provider.listProviderSkills = origList;
    provider.skillExists = origExists;
    provider.resolvePromptForRole = origResolvePrompt;
  }
}

function makeProject(cfg) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rrc-'));
  if (cfg !== undefined) {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify(cfg, null, 2),
      'utf8'
    );
  }
  return dir;
}

// Minimal config pointing workflow_provider at "fake-sp" with empty routing
// (so all resolution flows through sigil/exact catalogs, not routing keys).
function fakeSpConfig() {
  return {
    cp: {
      workflow_provider: 'fake-sp',
      providers: {
        'fake-sp': {
          plugin_shape: { dir_name: 'fake-sp', required_subdirs: [] },
          detect: { any_of: [] },
          skills: {},
        },
        manual: {
          plugin_shape: null,
          detect: { any_of: [] },
          skills: {},
          prompts: {},
        },
      },
    },
  };
}

console.log('\nunit-runtime-resolution-chain:');

// ────────────────────────── fuzzy-match ──────────────────────────

check('fuzzy-match: sigil (code-review) → receiving-code-review', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['receiving-code-review', 'requesting-code-review', 'writing-plans'] },
    {},
    () => {
      const r = runtime.resolvePhaseSkill('(code-review)', { projectDir: dir });
      assert.strictEqual(r.source, 'fuzzy-match');
      assert.strictEqual(r.fuzzy, true);
      assert.strictEqual(r.name, 'receiving-code-review');
      assert.ok(Array.isArray(r.candidates));
      assert.ok(r.candidates.length >= 2);
    }
  );
});

check('fuzzy-match: sigil with exact catalog hit chooses exact', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['plan', 'writing-plans'] },
    {},
    () => {
      const r = runtime.resolvePhaseSkill('(plan)', { projectDir: dir });
      assert.strictEqual(r.source, 'fuzzy-match');
      assert.strictEqual(r.name, 'plan');
    }
  );
});

// ────────────────────────── fuzzy-miss → chain ──────────────────────────

check('fuzzy-miss + role with manual prompt → manual-prompt', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['writing-plans'] },
    { reviewer: 'You are a senior reviewer. Review the diff and report issues.' },
    () => {
      const r = runtime.resolvePhaseSkill('(zzzqqq-no-match)', {
        projectDir: dir,
        phaseRole: 'reviewer',
      });
      assert.strictEqual(r.source, 'manual-prompt');
      assert.strictEqual(r.missSource, 'fuzzy-miss');
      assert.strictEqual(r.role, 'reviewer');
      assert.ok(/senior reviewer/.test(r.fallbackPrompt));
    }
  );
});

check('fuzzy-miss + role without manual prompt → subagent-dispatch', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['writing-plans'] },
    {},
    () => {
      const r = runtime.resolvePhaseSkill('(zzzqqq-no-match)', {
        projectDir: dir,
        phaseRole: 'reviewer',
      });
      assert.strictEqual(r.source, 'subagent-dispatch');
      assert.strictEqual(r.missSource, 'fuzzy-miss');
      assert.strictEqual(r.role, 'reviewer');
      assert.strictEqual(r.fallbackPrompt, undefined);
    }
  );
});

check('fuzzy-miss without role → subagent-dispatch with role=null', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog({ 'fake-sp': ['writing-plans'] }, {}, () => {
    const r = runtime.resolvePhaseSkill('(zzzqqq-no-match)', { projectDir: dir });
    assert.strictEqual(r.source, 'subagent-dispatch');
    assert.strictEqual(r.role, null);
  });
});

// ────────────────────────── exact-missing → chain ──────────────────────────

check('exact-missing literal + role with prompt → manual-prompt + missingFrom', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['writing-plans'] },
    { coder: 'Implement the change described above.' },
    () => {
      const r = runtime.resolvePhaseSkill('some-other-skill', {
        projectDir: dir,
        phaseRole: 'coder',
      });
      assert.strictEqual(r.source, 'manual-prompt');
      assert.strictEqual(r.missSource, 'exact-missing');
      assert.strictEqual(r.missingFrom, 'fake-sp');
      assert.ok(/Implement/.test(r.fallbackPrompt));
    }
  );
});

check('exact-missing literal without role → subagent-dispatch', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog({ 'fake-sp': ['writing-plans'] }, {}, () => {
    const r = runtime.resolvePhaseSkill('some-other-skill', { projectDir: dir });
    assert.strictEqual(r.source, 'subagent-dispatch');
    assert.strictEqual(r.missSource, 'exact-missing');
    assert.strictEqual(r.missingFrom, 'fake-sp');
  });
});

check('exact-present literal in catalog → no fallback (pass-through or pinned)', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog({ 'fake-sp': ['writing-plans'] }, {}, () => {
    const warnings = [];
    const r = runtime.resolvePhaseSkill('writing-plans', {
      projectDir: dir,
      warningsOut: warnings,
    });
    // After config refresh, the standard 'superpowers' provider re-emerges
    // and registers writing-plans as a value, so source may be 'pinned'.
    // What matters: NOT a fallback source.
    assert.ok(
      r.source === 'pass-through' || r.source === 'pinned',
      `expected pass-through or pinned, got ${r.source}`
    );
    assert.strictEqual(r.name, 'writing-plans');
    assert.strictEqual(warnings.length, 0);
  });
});

// ────────────────────────── malformed sigil ──────────────────────────

check('malformed sigil emits warning and passes through raw', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog({ 'fake-sp': ['writing-plans'] }, {}, () => {
    const warnings = [];
    const r = runtime.resolvePhaseSkill('(unclosed', {
      projectDir: dir,
      warningsOut: warnings,
    });
    assert.strictEqual(r.source, 'pass-through');
    assert.strictEqual(r.name, '(unclosed');
    assert.strictEqual(warnings.length, 1);
    assert.ok(/Malformed skill name/.test(warnings[0]));
  });
});

// ────────────────────────── formatInstruction integration ──────────────────────────

function makeRuntime(opts) {
  // Minimal wave-walker stub for formatInstruction. We only need a workflow
  // doc with one wave and projectDir. Reuse runtime.startRun if exposed,
  // else construct via internal API. formatInstruction expects a "wave"
  // object on the runtime instance.
  return runtime;
}

check('formatInstruction emits [resolution] for fuzzy-match and includes invoke skill', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['receiving-code-review', 'requesting-code-review'] },
    {},
    () => {
      const tpl = {
        meta: { workflow: 'test' },
        phases: [
          {
            id: 'p1',
            role: 'reviewer',
            model: 'default',
            skill: '(code-review)',
            prompt: 'Do the thing.\n',
          },
        ],
      };
      const instr = runtime.formatInstruction(tpl, tpl.phases, 0, {
        projectDir: dir,
        slug: 'test-fuzzy',
        totalWaves: 1,
      });
      assert.ok(
        /invoke skill: receiving-code-review/.test(instr),
        `expected invoke line, got:\n${instr}`
      );
      assert.ok(
        /\[resolution\] fuzzy: \(code-review\) \u2192 receiving-code-review/.test(instr),
        `expected fuzzy [resolution] line, got:\n${instr}`
      );
    }
  );
});

check('formatInstruction inlines [manual-prompt] block on manual-prompt fallback', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog(
    { 'fake-sp': ['writing-plans'] },
    { reviewer: 'You are a senior reviewer. Critique the diff.' },
    () => {
      const tpl = {
        meta: { workflow: 'test' },
        phases: [
          {
            id: 'p1',
            role: 'reviewer',
            model: 'default',
            skill: '(zzzqqq-no-match)',
            prompt: 'Review wave.\n',
          },
        ],
      };
      const instr = runtime.formatInstruction(tpl, tpl.phases, 0, {
        projectDir: dir,
        slug: 'test-manual',
        totalWaves: 1,
      });
      assert.ok(/\[manual-prompt\]/.test(instr), `expected manual-prompt block in:\n${instr}`);
      assert.ok(/senior reviewer/.test(instr), `expected role body inlined in:\n${instr}`);
      assert.ok(/\[\/manual-prompt\]/.test(instr), `expected closing tag in:\n${instr}`);
      assert.ok(
        /\[resolution\] fallback: fuzzy/.test(instr),
        `expected [resolution] fallback line in:\n${instr}`
      );
    }
  );
});

check('formatInstruction emits dispatch directive on subagent-dispatch fallback', () => {
  const dir = makeProject(fakeSpConfig());
  withFakeCatalog({ 'fake-sp': ['writing-plans'] }, {}, () => {
    const tpl = {
      meta: { workflow: 'test' },
      phases: [
        {
          id: 'p1',
          role: 'reviewer',
          model: 'default',
          skill: '(zzzqqq-no-match)',
          prompt: 'Review wave.\n',
        },
      ],
    };
    const instr = runtime.formatInstruction(tpl, tpl.phases, 0, {
      projectDir: dir,
      slug: 'test-dispatch',
      totalWaves: 1,
    });
    assert.ok(
      /\[resolution\] fallback: .*dispatch a subagent with role "reviewer"/.test(instr),
      `expected subagent-dispatch directive in:\n${instr}`
    );
    assert.ok(!/\[manual-prompt\]/.test(instr), 'should NOT inline a manual prompt');
  });
});

console.log(`\nunit-runtime-resolution-chain: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
