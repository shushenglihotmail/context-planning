---
phase: "13"
name: GitHub Actions CI
milestone: v0.6 Quality Wave
status: in-progress
created: 2026-05-20
base-commit: 5f302e50ffe95aa65a16a61da731f0a6c81303cc
---

# Phase 13: GitHub Actions CI

**Milestone**: v0.6 Quality Wave
**Created**: 2026-05-20

## Goal

Add a GitHub Actions workflow that runs the full test suite on every
push and pull request, across the supported platform matrix. Surface
status via a badge in README.

## Success Criteria

1. `.github/workflows/ci.yml` exists with a matrix:
   - OS: `ubuntu-latest`, `windows-latest`
   - Node: `20`, `22`
   - = 4 combinations.
2. Each job: checkout → setup-node → `npm ci` (or `npm install` since
   we have no lockfile) → `npm test`.
3. Workflow triggers on `push` to any branch + `pull_request` to `main`.
4. README replaces the static badge with the live workflow badge.
5. First CI run completes green for all 4 cells.

## Plans

- [x] 13-01: Create `.github/workflows/ci.yml` with matrix + badge update
- [x] 13-02: Push, observe first CI run, fix any platform-specific failures (Windows path quirks etc.)

## Notes

### Workflow shape

```yaml
name: ci
on:
  push:
  pull_request:
    branches: [main]
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm install --no-audit --no-fund
      - run: npm test
```

### No lockfile yet

Project has `package.json` but no `package-lock.json` committed.
`npm install` works fine for now; we may migrate to `npm ci` in v0.7
if we lock the lockfile.

### Path/CRLF concerns

The existing test suite already passes locally on Windows. Watch for
CRLF surprises if `actions/checkout@v4` normalizes line endings — the
test fixtures use `os.EOL` or explicit `\n` consistently.

### Badge URL pattern

```markdown
[![ci](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml/badge.svg)](https://github.com/shushenglihotmail/context-planning/actions/workflows/ci.yml)
```
