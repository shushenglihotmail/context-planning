---
name: cp-run-supervised
description: Inner supervisor for a `supervised: true` workflow run. Classifies user messages (L1/L2/L3), spawns per-phase sub-agents via the harness `task` tool, persists state.json, and brackets each phase with cp checkpoint commits.
argument-hint: "<run-slug>"
requires: []
---

# /cp-run-supervised

You are running `cp-run-supervised`. You are the **supervisor role**
of a `supervised: true` workflow run. There is no separate supervisor
process — *you, the current harness LLM session, are it.* `cp` is a
stateless CLI; all durable state lives on disk and you rehydrate it
from there.

This skill is the **inner driver** for one supervised workflow run.
The outer entry point is `/cp-run` (or `/cp-autonomous` for
unattended drives); they invoke this skill when the workflow
template has `supervised: true`.

## Architecture invariants (Option A, DESIGN.md Decision #6)

- **No daemon.** No long-lived Node process; no embedded LLM client
  in `cp`. The harness session — you — is the only LLM in the loop.
- **State on disk only.** Run state lives at
  `.planning/runs/<run-slug>/state.json`. Every supervisor decision
  is persisted before the next external action so a fresh harness
  session can resume losslessly.
- **Sub-agents are ephemeral.** Each phase sub-agent is one harness
  `task` tool invocation. They have no LLM lifetime of their own;
  they return a structured result and end.
- **Engine owns git.** Sub-agents must not run git directly. You call
  `cp checkpoint snapshot|commit|revert` between phases.

## Step 1 — Parse arguments and resume context

`$ARGUMENTS` is the run slug. Load state:

```
cp run state <slug> --json
```

The JSON shape is:

```json
{
  "run_id": "...",
  "workflow": "milestone",
  "milestone": "v1.5 ...",
  "supervised": true,
  "current_phase": "plan|child-plan|child-execute|...",
  "phases": {
    "<phase-id>": {
      "status": "pending|running|awaiting_input|complete|failed",
      "started": "2026-...",
      "completed": "2026-...",
      "snapshot_commit": "<git sha>",
      "classifier_history": [
        {"ts": "...", "user_message": "...", "class": "in-flow|side|control", "confidence": "L1|L2|L3"}
      ],
      "sub_agent_calls": [
        {"ts": "...", "outputs": ["..."], "result": "complete|failed|escalating", "summary": "..."}
      ]
    }
  }
}
```

If `current_phase` is set and its status is `running` or
`awaiting_input`, resume there. Otherwise pick the first `pending`
phase from the workflow template's phase order.

## Step 2 — For each phase: classify, route, execute

Use the classifier rubric:

| Class | Confidence | Action |
|---|---|---|
| in-flow conversation | L1 | forward content as additional context to the next sub-agent call; no user prompt |
| in-flow conversation | L2 | summarise your interpretation, ask "proceed with: <X>? (Y/n)" |
| in-flow conversation | L3 | open a multi-choice menu via `ask_user` |
| side comment | any | append to `classifier_history` only; do not interrupt the phase |
| control signal | L1 | execute (e.g. `pause`, `abandon`, `skip phase`) |
| control signal | L2 | confirm before executing |
| control signal | L3 | menu |

Persist the classification to `state.json` BEFORE acting on it (so a
mid-decision crash is recoverable):

```
cp run state append <slug> phases.<phase-id>.classifier_history '<json>'
```

### 2a. Spawn the phase sub-agent

Use the harness `task` tool. The sub-agent prompt MUST:

- Pass the phase's `description:` from the workflow template verbatim.
- List the phase's `outputs:` paths explicitly — the sub-agent may
  only create/modify files under those paths.
- Tell the sub-agent not to run git. (The supervisor will commit.)
- Tell the sub-agent to return JSON shape:
  `{ "status": "complete" | "failed" | "escalating",
     "summary": "...",
     "artifacts": ["<path>", ...],
     "next_user_question": "..."  // when status == escalating
   }`

Before the spawn, snapshot HEAD:

```
cp checkpoint snapshot <slug> <phase-id>
```

This records the pre-phase SHA into `phases.<phase-id>.snapshot_commit`.

### 2b. Handle the sub-agent return

- `complete` → call `cp checkpoint commit <slug> <phase-id>` (commits
  only declared outputs, with engine-controlled message). Update
  `phases.<phase-id>.status = complete`.
- `failed` → call `cp checkpoint revert <slug> <phase-id>` (reverts
  uncommitted writes under declared outputs only). Update status.
  Surface the failure to the user via `ask_user`:
  - "Retry phase", "Skip phase", "Abandon run (soft)".
- `escalating` → set status `awaiting_input`, persist
  `next_user_question`, and ask the user. After the user replies,
  classify their reply (L1/L2/L3) and either resume the sub-agent
  with the answer or re-spawn.

## Step 3 — Advance or pause

After each phase commit:

- If more pending phases exist, loop to Step 2 with the next one.
- If all phases are `complete`, set `status = complete` and
  print a one-line summary.
- If at any point the user issues a `pause`/`stop` control signal,
  write `.planning/.continue-here.md` with the run slug + current
  phase + reason, persist `status = paused`, and exit cleanly.

## Resume protocol

A fresh harness session resumes by calling `/cp-resume` or
`/cp-run-supervised <slug>` directly. Re-run Step 1 — the on-disk
state.json is the only source of truth. Pre-existing
`classifier_history` and `sub_agent_calls` arrays are informational;
don't replay them, just continue from `current_phase`.

## Sub-agent contract (authoritative)

Sub-agents:

1. Receive only what the supervisor passes in the `task` prompt.
2. May read any project file (subject to provider permissions).
3. May write/modify ONLY files under the phase's declared `outputs:`
   paths. Writes outside this set must be reported in the return JSON
   under `out_of_scope_writes` and will trigger a `failed` revert.
4. Must NOT run `git` commands. The supervisor brackets the phase
   with `cp checkpoint snapshot|commit|revert`.
5. Must NOT make network calls outside what the harness/provider
   normally allows.
6. Must NOT call `ask_user`. Escalate by returning
   `status: "escalating"` with `next_user_question`.
7. Must return well-formed JSON. Malformed return = `failed` with
   summary `"sub-agent returned invalid JSON"`.

## Notes

- This skill is **idempotent on resume**. Re-running with the same
  slug after a clean exit is a no-op (status is already `complete`).
- The supervisor never pushes. `cp checkpoint commit` writes local
  commits only.
- Confidence levels are conservative by default — when in doubt,
  treat as L3 (ask the user).
- Long-running multi-turn sub-agents (`task` with mode=background)
  are allowed but **must not** outlive the phase. Wait for completion
  before committing or advancing.
