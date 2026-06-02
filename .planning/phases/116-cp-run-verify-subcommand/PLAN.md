# new cp run-verify subcommand + lib/verify.js + behavior.test_command config + auto-detect chain

New bin/commands/run-verify.js CLI entrypoint and supporting lib/verify.js. Reads behavior.test_command from .planning/config.json. Default auto-detect chain: npm test -> pytest -> cargo test -> go test ./... -> noop with WARN if none. Exits non-zero on test failure. Opt-out via behavior.verify: false in config OR --skip-verify CLI flag. Per-project test_command override always wins over auto-detection. Unit tests cover auto-detect priority, exec exit-code propagation, opt-out paths.
