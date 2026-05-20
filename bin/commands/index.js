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
};
