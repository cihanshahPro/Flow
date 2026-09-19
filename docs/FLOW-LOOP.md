# The Flow loop — what the testing build does now

Flow is Tinder for your own thoughts: you record, Flow does the thinking in the background, and every time you come back there is exactly one thing to do. This document describes the loop as built in test build 12. It supersedes the task, plan-map and draft-review surfaces described in [STRAIGHT-PATH.md](STRAIGHT-PATH.md); that code remains in the repository (`ClassicFlow.tsx`, `PlanMap`, `TaskDetail`, `DraftReview`) but is no longer reachable.

## The rule of two

Every screen has one primary button and at most one secondary link. Flow never shows a list of options the person has to classify. When Flow needs a decision it asks with two chips. If a screen breaks this rule it is wrong, regardless of how well it works.

## The funnel

| Step | Screen | The one thing to do |
| --- | --- | --- |
| 1 | Quiz (`Quiz.tsx`) | Twenty statements, five taps each, then a named Flow type and what is on your plate. Skippable at every step. |
| 2 | Home (`Home.tsx`) | One **Record** button ("or write it down"). Threads Flow made appear below it. The Next card, when there is one, sits on top with **Done** and a calendar link. |
| 3 | Thread (`ThreadChat.tsx`) | A conversation. Your recordings on the right, Flow's replies on the left, a clarity meter on top. Flow asks one question; you **Record the answer**. |
| 4 | Move | When Flow has enough, it celebrates and offers one move with **Do this / Not now**. Accepting makes it the Next card. |
| 5 | Follow-through | **Done** on the Next card. Flow celebrates in the thread, offers the next move, or asks **Resolved / There's more**. |
| — | Me (`Me.tsx`) | Flow type, level with honest counters, what Flow knows, pattern notices, and feedback about Flow itself. |

There are no tabs. Home has a level pill that opens Me; Me has a back link.

## Threads (`src/thread.ts`)

A thread is one subject. Each recording joins the thread it belongs to: recordings started inside a thread always append; a recording from Home joins an open thread when it shares enough of that thread's vocabulary, otherwise it starts a new one. The Mac mini shaper can override routing later; today it is vocabulary overlap.

**Fingerprint.** Seven points: outcome, people, timing, constraints, why it matters, depends on, next context. Each point is known (with the person's own sentence as evidence) or missing. Known points never regress. The shaper may supply evidence per point; it is accepted only when it is a verbatim substring of the person's words. The regex detectors are the offline fallback.

**Clarity.** The count of known points, shown as a bar. A thread is ready for moves at five of seven including the outcome.

**Flow's turn** after every recording: the transcript bubble, an acknowledgement (the shaper's reply or a mode-specific template), then either one question about the next missing point (order depends on the person's mode) or, once ready, a one-time celebration and the first move. Flow never stacks questions: one open message at a time.

**Moves** are the draft steps extracted from the person's words (shaper choices with grounded evidence, or the regex fallback). If a ready thread has no explicit action, the move is the person's own "next" or outcome sentence. Accepting a move creates a task (`acceptStep`) and sets it as the Next card. Declining hides that move and offers the next one.

**Stages:** `dumped` → `understood` → `moving` → `done`, plus `parked`. Done is set only when the person answers **Resolved** to Flow's question after the last move; finishing a move by itself never closes a thread.

**Re-evaluation** runs on app open, on return to the foreground, every fifteen minutes while open, and when a thread is opened. It adds at most one check-in per thread:

- a date the person mentioned has passed → "It's past Friday — did that part happen?" **Yes / Not yet**;
- an accepted move slipped past its planned day → "How did … go?" **Done / Not yet**;
- three quiet days → "Still on it, or park it?" **Still on it / Park it**, at most once a week.

A **Yes** is evidence: it completes the move or credits the check-in in the ledger.

## Voice and modes (`src/flow-voice.ts`)

The quiz is the Mini-IPIP (Big Five). Flow adapts the scores into four interaction modes — Explorer (Catalyst), Builder (Steward), Analyst (Architect), Connector (Coordinator) — and shows the named type without four-letter codes. The mode changes wording, the order of questions and the emoji Flow uses. It never decides what matters or blocks a recording.

## Levels and gas-ups (`src/progress.ts`)

The ledger counts three real things, each ID once: moves done, threads understood, check-ins confirmed. Levels are Starting point (0), Building (1), Momentum (3), Follow-through (7), Mastery (15), then Mastery II… every ten. Levels unlock when the quiz is finished; edits never remove an earned level; recording alone earns nothing. Momentum unlocks pattern notices on Me.

Flow gasses the person up inside the thread where it happened: full picture, move done, welcome back, level up, resolved. Each is a chat bubble in the mode's voice with a short emoji shower over the chat (`EmojiRain.tsx`). No full-screen interruption, no streaks, no penalties.

## Reminders (`src/services/reminders.ts`)

Local notifications, best effort: the morning after a mentioned date, or one nudge when something is already waiting. At most eight scheduled at a time. Permission is requested only when there is something to remind about. Expo Go has no true background execution; true hourly evaluation needs a server and is out of scope for this testing build.

## Data

All additions to `ThoughtDraft` are optional fields (`messages`, `dueHints`, `hypeGiven`, `declinedStepIds`, `resolvedAt`, `stage`), so existing local drafts remain readable. The progress record keeps version 1 with two additive arrays. Nothing is migrated destructively.

## What the tests cover

`tests/thread.test.mjs` covers the fingerprint, routing, Flow's turn, chips, check-ins, parking, resolved, patterns and modes. `tests/thread-chat.test.mjs` and `tests/quiz-me.test.mjs` render the surfaces with mocked native modules and assert the rule of two. `tests/processing.test.mjs` covers routing and the shaper's reply, question and grounded evidence. `tests/reminders.test.mjs` covers the reminder planner. Physical-device microphone, calendar and notification behaviour remain device checks; see [HANDOFF.md](HANDOFF.md).
