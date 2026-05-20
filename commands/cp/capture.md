---
description: Triage open inbox items — route each to a quick task, phase note, seed, or discard
---

# /cp-capture — inbox triage

`/cp-capture` walks the user through the open `.planning/INBOX.md` items
one at a time and routes each to its right destination. cp owns the inbox
state; the **workflow provider** (default: Superpowers) does the actual
implementation work for items that become quick tasks or phase additions.

`/cp-capture` is the COMPANION to `cp capture "..."`. The CLI command
appends a free-form line to `INBOX.md`; this slash command processes the
backlog interactively.

---

## Behaviour

You are the orchestrator. Do this in order:

1. **Inspect the inbox.**
   Run `cp inbox --json` and parse it. If `open` is empty, tell the user
   "Inbox is empty — nothing to triage." and stop. Otherwise show a brief
   summary: `N open items, M previously triaged. Walk through the open
   items one at a time?` and confirm.

2. **For each open item (in `open` order):**

   a. Display the item to the user (timestamp + text).

   b. Propose a classification. Use one of these destination tags:

      | Tag                          | When to use                                                              | Action |
      |------------------------------|---------------------------------------------------------------------------|--------|
      | `quick:<slug>`               | Small bug / fix / chore. Single PR, no planning.                          | Defer to the workflow provider's quick-task skill. |
      | `phase:<NN-name>`            | Goes into an existing phase as a sub-task or PLAN.md update.              | Append the item text to that phase's PLAN.md `## Notes` (or appropriate section). |
      | `phase-seed:<short-name>`    | Future phase — write it down for the next roadmap cut.                    | Append to `.planning/STATE.md` `### Pending Todos`. |
      | `milestone-seed:<name>`      | Bigger than a phase — surfaces a future milestone.                        | Append to `.planning/STATE.md` `## Deferred Items`. |
      | `note:<where>`               | Standalone reference info (a decision, an observation, a constraint).     | Append to `.planning/STATE.md` `## Accumulated Context > ### Decisions` (or where the user picks). |
      | `discard`                    | Noise. Tracking complete; nothing to do.                                  | No side-effect beyond marking triaged. |

      Propose one classification with a one-sentence rationale. Always ask
      the user to confirm or override (use AskUserQuestion when available,
      otherwise plain text). The user can also pick **skip** (leave open) or
      **edit** (rewrite the item before classifying).

   c. **Execute the routing action.**
      - For `quick:*`: hand off to the workflow provider's quick-task
        primitive (Superpowers's `/quick`, GSD's `/gsd-quick`, etc.). Pass
        the item text as the task description.
      - For `phase:*`: read the matching phase's `PLAN.md` (long-form or
        short-form), append a bullet under `## Notes` with the item text
        prefixed by `> inbox [<ts>]:`. Use `cp tick`'s file convention. Do
        NOT auto-tick anything.
      - For `phase-seed:*` / `milestone-seed:*` / `note:*`: read
        `.planning/STATE.md`, append a bullet to the right section
        (preserve all other content verbatim), write it back.
      - For `discard`: no extra file write.

   d. **Mark triaged.** Once the routing action succeeds (or for `discard`,
      immediately), run:
      ```
      cp inbox --tick <N> --note "<destination-tag>"
      ```
      where `<N>` is the open item's index from step 2a. This moves the
      item from `Open` to `Triaged` in `INBOX.md` and auto-commits.

3. **Summary.** After the loop, run `cp inbox --all` and show the user
   what was triaged. End with: "Inbox triaged. `M` items moved, `K` left
   open."

---

## Rules

- **Always confirm classifications with the user.** Never silently route an
  item — these are the user's notes; they get final say on what each one means.
- **One item at a time.** Don't batch-classify; the user might catch a bad
  routing decision mid-loop and want to stop.
- **Atomic commits.** `cp inbox --tick` commits each triage on its own. If
  you also wrote to a phase PLAN or STATE.md, those go in a separate commit
  via your normal file-edit flow — don't try to bundle the inbox tick with
  unrelated file edits.
- **Idempotent.** If the user re-runs `/cp-capture` mid-session, items
  already in `Triaged` should not be revisited; only items still in `Open`.

## Provider integration

The Mappings table assumes the workflow provider is one of:
- **Superpowers** (default): `/quick` for quick tasks; for phase edits and
  state edits, use your own filesystem tools.
- **GSD**: `/gsd-quick` or `/gsd-capture` for quick tasks; otherwise as above.
- **None**: cp's CLI still works (`cp capture`, `cp inbox --tick`); you
  perform routing edits with your harness's filesystem tools.

Read `.planning/config.json` `cp.workflow_provider` to know which is active.

## Don't

- Don't write to `INBOX.md` directly — always go through `cp inbox --tick`.
- Don't strip the original item text when writing to a phase / state file
  — preserve `> inbox [<ts>]: <text>` so the provenance stays clear.
- Don't classify the same item twice in one run.
- Don't auto-create new phases or milestones from inbox items. Surface them
  as `phase-seed:*` / `milestone-seed:*` and let `/cp-new-milestone` or
  `/cp-plan-phase` pick them up later.
