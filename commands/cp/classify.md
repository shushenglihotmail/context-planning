---
name: cp-classify
description: Classify a user message during a supervised workflow run into {in-flow | side | control} with confidence {L1 | L2 | L3}, per the v1.4 broker rubric. Reference skill for cp-run-supervised.
argument-hint: "(reference skill — invoked indirectly via cp-run-supervised)"
requires: []
---

# /cp-classify

You are running `cp-classify`. This skill encodes the v1.4 message-broker
rubric used by the supervisor (`cp-run-supervised`) to decide what to do
with each user message arriving mid-phase.

This is a **reference rubric**, not a typical action skill. The
supervisor cites this rubric inline when classifying; you rarely
invoke `/cp-classify` directly.

## The two-axis rubric

Each user message gets two labels: **class** and **confidence**.

### Axis 1 — Class

| Class | Meaning | Examples |
|---|---|---|
| `in-flow` | Substantive content that belongs in the active phase's work product. Sub-agent needs to see it. | "Make the function async too.", "Also handle the empty-array case.", "The button should be red." |
| `side` | Conversational meta-comment that does NOT alter the active phase. Worth logging but not routing. | "Cool.", "Thanks!", "Nice work so far.", "Interesting choice." |
| `control` | Workflow-control verb directed at the supervisor itself, not the sub-agent. | "pause", "stop", "skip this phase", "abandon", "go back to phase X", "restart this phase". |

### Axis 2 — Confidence

| Confidence | Meaning | Supervisor action |
|---|---|---|
| `L1` | Unambiguous. The class is obvious and the supervisor knows exactly what to do. | Act immediately. No user prompt. |
| `L2` | Likely interpretation but with one viable alternative. | Summarise interpretation in one sentence, ask "proceed with: <X>? (Y/n)". |
| `L3` | Genuinely ambiguous — multiple distinct readings or the requested action is destructive. | Open a multi-choice menu via `ask_user`. |

### When to escalate confidence

Bias toward higher confidence (more user friction) when:

- The message references something the supervisor has no context for ("the one we discussed earlier" with no clear referent).
- The literal class would be `control` and the consequence is destructive (`abandon`, output revert).
- The message arrives mid-sub-agent and acting on it would invalidate work in flight.
- The user has corrected a prior classification in the same run (sticky downgrade).

## Output shape

The classification is a JSON object:

```json
{
  "ts": "2026-05-28T...",
  "user_message": "<the verbatim user message>",
  "class": "in-flow" | "side" | "control",
  "confidence": "L1" | "L2" | "L3",
  "rationale": "<one-sentence reason>",
  "intent": "<control verb if class=control, else null>"
}
```

Persist via:

```
cp classify record <slug> <phase-id> < classification.json
```

…which validates the shape and appends to
`phases.<phase-id>.classifier_history` in state.json.

## Worked examples

| User message | class | confidence | rationale |
|---|---|---|---|
| "Also add a test for the empty case." (mid-execute) | in-flow | L1 | clear additive instruction for active phase |
| "wait, undo that" (mid-execute, right after a commit) | control | L2 | likely `restart_phase` but could mean `revert last edit` — confirm |
| "stop" | control | L1 | universal pause verb |
| "abandon" | control | L3 | destructive — always confirm |
| "thanks!" | side | L1 | pure acknowledgement |
| "the API should also handle paging" (mid-plan) | in-flow | L1 | substantive scope addition for active phase |
| "make it work" (no context) | in-flow | L3 | ambiguous — open menu |
| "redo phase 2" (current phase is 3) | control | L2 | clear intent (`restart_phase=2`) but invalidates phase 3 work; confirm |

## Notes

- The rubric is intentionally conservative. When in doubt, escalate
  to L3.
- Side-class messages STILL get logged to
  `classifier_history` so the audit trail is complete.
- The supervisor never silently drops a message. Every message
  produces exactly one classification entry.
