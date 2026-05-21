'use strict';

/**
 * Command registry — single source of truth for `cp <name>` lookup.
 *
 * Each module exports `{ name, run(args) }`.
 *
 * To add a new command:
 *   1. Drop a file in this directory exporting `{ name, run }`.
 *   2. Add an entry below.
 *   3. Update `bin/commands/_usage.js` if it should appear in `cp help`.
 */

module.exports = {
  version: require('./version'),
  init: require('./init'),
  doctor: require('./doctor'),
  status: require('./status'),
  tick: require('./tick'),
  config: require('./config'),
  'gsd-import': require('./gsd-import'),
  install: require('./install'),
  'write-summary': require('./write-summary'),
  'scaffold-milestone': require('./scaffold-milestone'),
  'scaffold-phase': require('./scaffold-phase'),
  'scaffold-codebase': require('./scaffold-codebase'),
  'codebase-status': require('./codebase-status'),
  'complete-milestone': require('./complete-milestone'),
  capture: require('./capture'),
  inbox: require('./inbox'),
  statusline: require('./statusline'),
  worktree: require('./worktree'),
  state: require('./state'),
  audit: require('./audit'),
  reconcile: require('./reconcile'),
  supersede: require('./supersede'),
  deviate: require('./deviate'),
  update: require('./update'),
  autonomous: require('./autonomous'),
};
