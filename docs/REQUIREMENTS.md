# Flow Requirements

As of 2026-09-19 · owner: Cihan Sahin · living copy: https://claude.ai/code/artifact/7eb4e268-8515-4a4c-a5ab-b59487845f64

## Purpose

Flow is a recording-first app that turns what a person says into threads, asks one thing at a time, and offers one move when it has enough. The promise: **record it once — Flow keeps the thread, finds what is missing, and shows you the next move when you're ready.**

The model is Tinder for your own thoughts: the system generates the content (threads, questions, moves); the person only records and makes two-option decisions. Progress is levelled like RizzMaster: every real step moves a meter, and Flow celebrates inside the conversation.

Audience for this release: the owner and a small invited test group on iPhone via Expo Go. No store release, no accounts, no cloud.

## Product rules

These override any screen-level decision. A screen that breaks one is wrong even if it works.

1. **Rule of two.** Every screen has one primary button and at most one secondary link. Flow decides with two chips. Suggested answers to a question may be up to four chips, and recording is always the other way to answer.
2. **Record first.** The person never creates a task, classifies a routine, fills a form, or marks ordinary work complete to keep a thought.
3. **Flow generates, the person chooses.** Threads, questions, moves and check-ins come from Flow. The person records, taps a suggestion, or picks one of two options.
4. **Never "record whatever".** Every recording prompt is specific: the first thread comes from the profile, Today suggests the next uncovered area, a thread prompt is the open question.
5. **Evidence-based completion.** A move is done when the person taps Done or confirms a check-in. A thread is resolved only when the person answers "Resolved"; finishing a move never closes a thread.
6. **No pressure mechanics.** No streaks, no penalties, nothing expires, no full-screen reward interruptions. Celebration is a chat bubble plus a short emoji shower.
7. **Original words survive.** Transcripts, audio and the person's sentences are never rewritten. Evidence Flow shows is a verbatim quote.
8. **Testing only.** Expo Go on iPhone, Mac mini processor on the same LAN, no store submission, no accounts, no analytics.

## The funnel

Runs once per device, from the top, whatever an older build saved (`profile.funnelVersion = 3`). Nothing is skippable. A `TEST 12` tag is visible so the tester knows which build they have.

| Step | Screen | Requirement |
| --- | --- | --- |
| 1 | Intro | One button: Start the test. |
| 2 | Test | The 20 Mini-IPIP statements, five taps each (Not me … Very me). Progress bar. Back only. Answers save on every tap so a killed app resumes. |
| 3 | Reveal | Named Flow type (Catalyst, Steward, Architect, Coordinator) with one line about them and one line about what Flow will do. No four-letter codes. Labelled as adapted from the Big Five. |
| 4 | Profile 1/5 | "What's taking up space in your head?" Multi-select from 11 areas (GTD areas of focus). May be left empty. |
| 5 | Profile 2/5 | "Who's in the picture most?" Multi-select from 10 relations plus free-text names. |
| 6 | Profile 3/5 | "When do you actually get time?" Single choice, required: Mornings, Lunchtime, Evenings, Weekends, It varies. |
| 7 | Profile 4/5 | "What usually gets in the way?" Multi-select from 7 obstacles. |
| 8 | Profile 5/5 | "Anything with a real date coming up?" Single choice, required. |
| 9 | First thread | "Let's start with {first area}" and a specific prompt. One Record button, write as the secondary. Finishing stamps the funnel version and opens the capture sheet. |

The profile is editable later from the Profile tab; the test can be redone from there, which reruns the funnel.

## Navigation and screens

Four tabs, always visible after the funnel; thread chat is full-screen and returns to the tab it came from.

| Screen | Must show | Primary action | Secondary |
| --- | --- | --- | --- |
| Today | The one Next card (move title, source thread), a "Flow suggests" card naming the next uncovered profile area with its prompt, the threads that need you | Record (the suggested prompt) | write it down · something else; Done and calendar on the Next card |
| Threads | Every conversation: needs-you first, then active, then parked, then done. Each card: title, what Flow needs ("Flow has a question", "Flow has a move for you", "Quick check-in", stage), clarity bar | New thread | — |
| Progress | Level name, bar to the next level, three counters (moves done, threads understood, check-ins kept), the ladder, pattern notice (unlocks at Momentum), Flow's recent celebrations | — | — |
| Profile | Flow type with its two lines, the plate (areas, people, time window, obstacles) with Edit, feedback about Flow (record or write), Redo the test | Record feedback | or write it |
| Thread | Title and stage, clarity meter (n/7, expands to the seven points with the person's quotes), the conversation, "Your moves on this" | Record / Record the answer | or write it down; chips inside Flow's bubbles |
| Capture sheet | The prompt Flow is asking, then the recorder (or a text box). After a recording: "Saved. Flow is listening back…", playback, retry on failure | Stop / Send to Flow | Write instead / record instead |

The Threads tab shows a badge with the number of threads that need the person.

## Threads and Flow's turn

A thread is one subject. A recording started inside a thread appends to it; a recording from Today or Threads joins an open thread that shares enough of its vocabulary, otherwise starts a new one.

**Fingerprint.** Seven points: outcome, people, timing, what's in the way, why it matters, depends on, first step. Each is known (with the person's own sentence as evidence) or missing. Known points never regress. Evidence from the shaper is accepted only when it is a verbatim substring of the person's words.

**Clarity and readiness.** The meter shows known/7. A thread is ready for moves at five known points including the outcome.

**Flow's turn after every recording**, in order:

1. The transcript bubble (with playback when there is audio).
2. An acknowledgement: the shaper's one-sentence reply, else a mode template.
3. If not ready: one question about the next missing point in WOOP order (outcome, why it matters, what's in the way, first step; people, timing and depends-on slotted by mode). The question quotes the person's outcome when known. It carries up to four suggested answers from the profile (their obstacles, their people, their time window). Tapping one records it as that point's evidence; recording is always the alternative. A shaper question about an already-known point is ignored.
4. If ready: one celebration (once per thread), then one move: "{When} → {Step}" with Do this / Not now. When comes from the time window ("This evening", "Tomorrow morning", "This weekend"). Do this creates the task on that day and makes it the Next card. Not now hides that move and offers the next; when none remain Flow holds the thread.

Flow never stacks: at most one open question, offer or check-in per thread.

**Re-evaluation** runs on app open, on return to foreground, every 15 minutes while open, and when a thread is opened. It adds at most one check-in per thread: a mentioned date has passed (Yes / Not yet), an accepted move slipped past its day (Done / Not yet), or three quiet days (Still on it / Park it, at most weekly). Yes completes the move or credits the check-in.

**Resolution.** After the last move, Flow asks "Is this whole thing resolved?" Resolved closes the thread and celebrates; There's more asks for the next move.

**Older data.** Threads saved by earlier builds get Flow's conversation backfilled from their saved words on first load.

## Levels and gas-ups

The ledger counts three real things, each id once: moves done, threads understood (reached ready), check-ins confirmed. Recording alone earns nothing. Levels unlock when the test is finished; profile edits never remove an earned level.

| Level | Needs | Unlocks |
| --- | --- | --- |
| Starting point | 0 | — |
| Building | 1 | — |
| Momentum | 3 | Pattern notices on Progress |
| Follow-through | 7 | — |
| Mastery | 15, then Mastery II… every 10 | — |

Flow celebrates inside the thread where it happened, in the person's mode voice, with a short emoji shower over the chat: the full picture (once per thread), a move done, coming back after a pause, a level up (once per level), resolved. Never two of the same kind in a row; never a full-screen takeover.

## Processing and intelligence

Audio and text go to the Mac mini processor on the same LAN (`POST /process`, bearer token, 32 MB max, one job at a time). whisper.cpp transcribes; Apple Foundation Models (`scripts/shape-thought.swift`) return the shape. Bounded local rules are the labelled fallback when the processor is unreachable; the person always keeps a usable thread.

Shaper contract (JSON):

| Field | Rule |
| --- | --- |
| `title` | At most 7 words |
| `summary` | A contiguous verbatim excerpt of the person's words |
| `reply` | One plain sentence naming the subject; no advice, no question, at most 20 words |
| `question` | One question about the single most important missing point, at most 16 words; empty when nothing important is missing |
| `points[]` | `{id, evidence}` for points the words already answer; id one of the seven; evidence 3–10 consecutive words copied exactly |
| `choices[]` | Zero to two moves with `label, action, smallAction, evidence, reason`; evidence copied exactly |

The app verifies every evidence string is a substring of the transcript and drops anything else. Original recordings and transcripts stay on the phone; the server logs request ids, stages and sizes only.

Gap: the shaper does not yet receive the profile. Sending the plate (people, obstacles, time window) is the next step so its question and reply use them.

## Data, privacy and storage

Everything lives on the phone in SQLite (`anchor-mobile.db`): tasks, notes, profile, progress in `records`; threads in `flow_drafts` as JSON. Audio files live in the app's document directory. Nothing leaves the phone except audio and text sent to the person's own Mac mini for processing.

All thread additions are optional fields (`messages`, `dueHints`, `hypeGiven`, `declinedStepIds`, `resolvedAt`); the profile gains `funnelVersion` and `plate`; the progress record keeps version 1 with two additive arrays. Older records stay readable and are never rewritten destructively. Example drafts never count toward levels.

No accounts, no analytics, no crash reporting. Feedback recorded about Flow stays on the phone under Profile. Recordings, transcripts, legal or medical details never go into the repository.

## Non-functional

- Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript 6 strict, Node 22.13+. Runs in the SDK 57 Expo Go on iPhone; Android and web bundles must export but are not tested surfaces.
- `npm run verify` (strict typecheck + all tests) passes before every push; Expo Doctor 21/21; iOS, Android and web exports succeed.
- Works offline for recording, threads, chips, moves and levels; only transcription and the shaper need the Mac mini. A failed processor call never loses a recording and can be retried from the same sheet.
- Every tappable element has an accessibility label; chips are buttons; meters are progress bars with values.
- Layout holds at 390×844 with a 16 px side gutter; nothing scrolls sideways.
- Local reminders (expo-notifications) are best effort: the morning after a mentioned date or one nudge when something is waiting; at most eight scheduled; permission asked only when there is something to remind about.

## Out of scope and open questions

Out of scope for this release: accounts and sync, a cloud processor, background evaluation while the app is closed, routines as a separate system, in-app purchases, social features, App Store submission, Android and web as supported surfaces.

Open questions:

- [ ] Should the shaper receive the profile so its reply and question use the person's people and obstacles? (Recommended yes; small change.)
- [ ] Should kept notes from the old Library get a screen under Profile, or be dropped?
- [ ] When a pattern repeats three or more times, should Flow offer it as a routine with two chips, or only notice it?
- [ ] Is the four-suggestion cap on question chips right, or should outcome questions be record-only?

## Acceptance on a physical iPhone

All of these on a real iPhone with the SDK 57 Expo Go, the Mac mini processor running, and the phone on the same Wi-Fi. Record device, iOS version and results in `docs/VALIDATION.md`.

- [ ] Fresh install and an install over an older build both show the funnel from the intro; `TEST 12` is visible.
- [ ] The test cannot be skipped; the reveal shows a named type without a code; the five profile questions save on every tap; the first thread is prompted from the first area chosen.
- [ ] Recording through the capture sheet saves audio, transcribes on the Mac mini, and opens the thread with the transcript, Flow's reply, the meter and one question with suggested answers.
- [ ] Tapping a suggested answer fills the meter and continues; recording an answer does the same; the celebration and emoji shower appear once; one move appears as "When → What" with two chips.
- [ ] Do this puts the move on Today on the right day; Done celebrates in the thread and moves the level; after the last move Flow asks Resolved / There's more.
- [ ] A second unrelated recording starts a new thread; a related one from Today joins the existing thread; recording inside a thread appends.
- [ ] Threads tab orders needs-you first and badges the count; Progress shows the ladder and counters; Profile edits the plate and the change shows up in the next question's chips.
- [ ] With the device clock past a mentioned date, reopening shows one check-in; the morning-after reminder fires once permission is granted.
- [ ] Kill and reopen: threads, moves, levels and the profile survive. Airplane mode: recording and chips still work; processing fails with a clear message and retries later.
- [ ] The calendar link on the Next card saves an event and reports the result inside the app.
