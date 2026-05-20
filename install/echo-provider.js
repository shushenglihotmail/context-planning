'use strict';

/**
 * Installer for the echo-provider schema-test stub.
 *
 * Plants a minimal SKILL.md at .planning/providers/echo-provider/skills/echo/SKILL.md
 * so the echo-provider entry in config.json can be detected and resolved.
 *
 * Usage: cp install echo-provider [--local]
 * (--local is implicit; echo-provider always installs to the project)
 */

const fs = require('fs');
const path = require('path');
const { planningDir, repoRoot } = require('../lib/paths');

const SKILL_CONTENT = `---
name: echo
description: Schema-test stub skill. Echoes the role name. Not for end users.
---

# Echo skill

This is a schema-test stub installed by \`cp install echo-provider\`.
It exists solely to prove that cp's provider detection schema works
with more than one provider. It does nothing useful.

When invoked for any role (plan, execute, brainstorm, etc.), simply
acknowledge that the echo-provider was reached and the role name was
received. Do not perform any actual work.
`;

function install() {
  const root = repoRoot();
  const providerDir = path.join(planningDir(root), 'providers', 'echo-provider');
  const skillDir = path.join(providerDir, 'skills', 'echo');
  const skillPath = path.join(skillDir, 'SKILL.md');

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillPath, SKILL_CONTENT);

  const results = [
    { file: path.relative(root, skillPath), status: 'created' },
    { file: path.relative(root, providerDir), status: 'detectable' },
  ];

  return { results };
}

module.exports = { install };
