'use strict';

const fs = require('fs');
const path = require('path');
const { repoRoot, planningDir, ensureDir, readTemplate } = require('../../lib/paths');
const provider = require('../../lib/provider');
const compat = require('../../lib/gsd-compat');
const { today, renderTemplate } = require('./_helpers');

function run() {
  const root = repoRoot();
  const dir = planningDir(root);
  ensureDir(dir);
  ensureDir(path.join(dir, 'phases'));
  ensureDir(path.join(dir, 'quick'));

  const wasGsdProject = compat.isGsdProject(root);
  const sharedPresent = compat.presentSharedFiles(root);

  const files = [
    ['PROJECT.md', 'PROJECT.md'],
    ['ROADMAP.md', 'ROADMAP.md'],
    ['STATE.md', 'STATE.md'],
    ['MILESTONES.md', 'MILESTONES.md'],
  ];

  let created = 0;
  for (const [target, tpl] of files) {
    const dest = path.join(dir, target);
    if (!fs.existsSync(dest)) {
      const content = renderTemplate(readTemplate(tpl), {
        PROJECT_NAME: path.basename(root),
        DATE: today(),
        TRIGGER: 'cp init',
        CORE_VALUE: '(not set yet — fill PROJECT.md)',
        CURRENT_PHASE_NAME: 'pre-planning',
        PHASE_NUM: '0',
        TOTAL_PHASES: '0',
        PLAN_NUM: '0',
        TOTAL_PLANS_IN_PHASE: '0',
        STATUS: 'Ready to plan',
        LAST_ACTIVITY: 'init',
        CONTINUE_HERE_PATH_OR_NONE: 'None',
        MILESTONE_NAME: 'v0.1 — first milestone',
        PHASE_RANGE: '1',
      });
      fs.writeFileSync(dest, content);
      created++;
      console.log(`  + ${path.relative(root, dest)}`);
    } else {
      console.log(`  = ${path.relative(root, dest)} (exists, kept)`);
    }
  }

  // config.json: merge-or-create.
  const cfgPath = provider.configPath(root);
  if (!fs.existsSync(cfgPath)) {
    provider.saveConfig(provider.loadDefaults(), root);
    console.log(`  + ${path.relative(root, cfgPath)}`);
    created++;
  } else {
    // Merge cp.* if missing — loadConfig() does this automatically.
    provider.loadConfig(root);
    console.log(`  = ${path.relative(root, cfgPath)} (kept; cp block ensured)`);
  }

  console.log(`\n${created} new file(s).`);
  if (wasGsdProject) {
    console.log(
      `\nDetected a GSD project (research/ / todos/ / seeds/ / REQUIREMENTS.md).`
    );
    console.log(
      `cp wrote a 'cp' block into config.json but did not modify any GSD files.`
    );
    console.log(
      `You can switch back to GSD any time; cp is additive only.`
    );
  } else if (sharedPresent.length > 0 && !wasGsdProject) {
    console.log(
      `\n${sharedPresent.length} shared file(s) detected — cp will treat this`
    );
    console.log(`as a GSD-compatible project.`);
  }
  console.log(`\nNext: edit .planning/PROJECT.md, then run /cp-new-milestone or /cp-plan-phase.`);
}

module.exports = { name: 'init', run };
