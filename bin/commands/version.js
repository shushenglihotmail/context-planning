'use strict';

const pkg = require('../../package.json');

function run() {
  console.log(pkg.version);
}

module.exports = { name: 'version', run };
