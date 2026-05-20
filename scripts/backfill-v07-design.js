// One-shot dogfood backfill: write phase 16 and milestone v0.7 DESIGN.md.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');

const root = path.resolve(__dirname, '..');
const tpl = paths.readTemplate('DESIGN.md');
const today = new Date().toISOString().slice(0, 10);

function render(tier_key, name, slug, phaseNum, title) {
  return tpl
    .replace(/\{\{TIER_KEY\}\}/g, tier_key)
    .replace(/\{\{MILESTONE_NAME\}\}/g, name)
    .replace(/\{\{MILESTONE_SLUG\}\}/g, slug)
    .replace(/\{\{PHASE_NUM\}\}/g, phaseNum)
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{DATE\}\}/g, today);
}

const phaseOut = path.join(
  root, '.planning', 'phases', '16-design-capture-infrastructure', 'DESIGN.md'
);
if (!fs.existsSync(phaseOut)) {
  fs.writeFileSync(phaseOut, render(
    'phase: "16"',
    'v0.7 Design Capture',
    'v0-7-design-capture',
    '16',
    'Phase 16: design capture infrastructure'
  ));
  console.log('wrote', phaseOut);
} else {
  console.log('exists', phaseOut);
}

const slug = paths.milestoneSlug('v0.7 Design Capture');
const msOut = paths.milestoneDesignFile('v0.7 Design Capture', root);
fs.mkdirSync(path.dirname(msOut), { recursive: true });
if (!fs.existsSync(msOut)) {
  fs.writeFileSync(msOut, render(
    'milestone_slug: "' + slug + '"',
    'v0.7 Design Capture',
    slug,
    '',
    'v0.7 Design Capture'
  ));
  console.log('wrote', msOut);
} else {
  console.log('exists', msOut);
}
