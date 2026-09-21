# Flow mobile — developer handoff

## Build 9 handoff — 21 Sep 2026 (read this first)

**Branch:** `kodavena/v1.0.0`, head `cff1364` (PR #14 → `testing` stays open). **You do not need the Mac mini for anything below** — it is Cihan's dev runtime only.

### What changed since build 8 (the whole app, on purpose)
Tabs **Today · Threads · Calendar · Me**, one Record button, rows not cards. Calendar read first → one model call turns the words into moves / waiting-fors / later / projects → placed around the week (the clock the person said is kept when free, "by Friday" is a due date, evening stays evening, trips and full days are skipped) → written to Apple Calendar with alerts and to a "Flow" list in Apple Reminders, two-way (ticks and deletes on the phone come back) → **Your week**. Every recording is an Otter-style page (Summary | Transcript, ↗ to the sentence behind each move). Threads are projects; inside a thread Flow is an **assistant** with the project in front of it (moves, calendar, other projects) and answers, asks one thing, or puts one move on the table; "do it" accepts; a side subject can go to a **New thread · → Existing… · Keep here**. **Plan tomorrow** (evening ritual: calendar, routines, leftovers, "Tell Flow about tomorrow"). Two pushes: "Your day" and "Day closed". Screen contract: [SKELETON.html](SKELETON.html) (ten screens). The step tree per project: `ensureSteps()` in `src/services/processing.ts`.

### Verify on your machine
```bash
git fetch && git checkout kodavena/v1.0.0 && npm ci
npx tsc --noEmit -p .
node --experimental-strip-types --test tests/*.test.mjs      # 302 pass
cd server/shape-worker && npm ci && npx vitest run            # 9 pass
```

### Build 9 — your command (EAS project 6cd13cbe-…, autoIncrement on)
```bash
eas build --platform ios --profile production --auto-submit
```
Cihan is not on the EAS project; add him as a member or run this yourself. Permission strings (mic, speech, calendar, reminders, notifications) are in `app.config.ts`.

### The brain — Cihan's decision: no API credits for now
- An iPhone app **cannot** use its users' Claude subscriptions: Anthropic's OAuth is granted to Claude Code / the Agent SDK only, not to third-party apps. So for end users the options are (a) **on-device Apple Intelligence** on iOS 26 (already wired: `modules/flow-intelligence`, functions `shapeThought`, `planThought`, `chatThread`), (b) **the Cloudflare worker** with an Anthropic API key (already wired, quotas built in), (c) later our own subscription that pays for (b).
- **Release build 9 therefore runs on-device only** unless you deploy the worker. To deploy: `cd server/shape-worker && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler deploy` (routes `/v1/shape`, `/v1/plan`, `/v1/chat`; `MODEL` in `wrangler.toml`). If the worker is not deployed, leave `EXPO_PUBLIC_SHAPE_URL` as is — the app falls back cleanly and the "Shape notes on a secure server" switch in Me stays off.
- For your own dev runs on your Mac, `scripts/voice-server.mjs` can use your Claude subscription through Claude Code headless: `FLOW_CLAUDE_CODE=1` and a one-time `claude` → `/login` on that Mac (needs `claude` installed, `whisper-cli` + `ffmpeg` from Homebrew and a Whisper model for transcription; see `.env.processor.example`). Not required for the native build.
- One prompt contract lives in four places and a test keeps them equal: `src/ai-policy.ts`, `server/shape-worker/src/{prompt,schema}.ts`, `modules/flow-intelligence/ios/FlowIntelligenceModule.swift`, `scripts/shape-thought.swift` (`tests/plan-contract.test.mjs`; regenerate `scripts/plan-contract.mjs` from `src/ai-policy.ts`).

### The three native pieces (rows read SOON in Me until done)
| Piece | Already there | Left to do (native) |
|---|---|---|
| Siri "Tell Flow…" | scheme `flowthread://`; intake accepts text; a short line becomes a move, a long one goes through Your week | App Intent "Tell Flow" with a text parameter → open `flowthread://record?text=…`; handle the URL in `App.tsx` (prefill `startCapture("text", null, "thought")` and submit); expose as a Shortcut (Action button) |
| Share sheet | same intake path | share extension handing text/URLs to `flowthread://record?text=…` |
| Lock-screen widget | `morningLine()` in `src/tomorrow.ts` builds "2 events · 3 moves · first: …"; tasks in SQLite | WidgetKit extension reading a JSON the app writes to the App Group container on refresh (add `writeWidgetSnapshot()` next to `mirrorToDev()` in `App.tsx`) |

When they land, flip the rows in `src/components/Me.tsx` from SOON to ON and update screen 7 in SKELETON.html.

### What's left — the task list (owner in brackets)
| # | Task | Owner | How you know it's done |
|---|---|---|---|
| 1 | **Set up the brain.** Decide worker-with-key vs on-device-only for build 9; if worker: `npx wrangler secret put ANTHROPIC_API_KEY`, KV id in `wrangler.toml`, `npx wrangler deploy`, then check `EXPO_PUBLIC_SHAPE_URL` answers `/v1/plan` and `/v1/chat`. | Samil | A recording on a TestFlight phone yields moves titled with verbs ("Call the DUI lawyer"), not project names. |
| 2 | Build 9: `eas build --platform ios --profile production --auto-submit`; add Cihan to the EAS project. | Samil | Build 1.0.0 (9) in TestFlight, Kodavena Internal. |
| 3 | Siri "Tell Flow…" App Intent + Shortcut (Action button) → `flowthread://record?text=…`; handle the URL in `App.tsx`. | Samil | Me › Siri row flips to ON; a Shortcut run lands as a move. |
| 4 | Share extension → same URL. | Samil | Me › Share sheet ON; sharing a mail lands as a move. |
| 5 | Lock-screen widget (WidgetKit + App Group JSON written on refresh). | Samil | Me › Widget ON; the widget shows "first: …". |
| 6 | Test on Cihan's real data, never demo data: `tests/fixtures/owner/phone-2026-09-21.json` (his six recordings, his threads) runs through the app in `tests/owner-phone.test.mjs`; new phone snapshots go next to it. | both | The test stays green; new snapshots added when he records. |
| 7 | Decide the thread meter ("Getting to know this · %") and the "What Flow got" cards: keep or drop now that the thread is an assistant chat. | Cihan | One line in this doc. |
| 8 | Whisper on the dev server: `large-v3-turbo` (done on the mini); document for any other dev Mac in `.env.processor.example` (done). | — | — |

### Known gaps
- The three native pieces above.
- Every screen is only as good as the brain: with the Apple fallback the titles and answers are weak; with Claude they are right. Judge screens with the real brain.
- Threads still show the "Getting to know this · %" meter and the "What Flow got" cards from the earlier vision; Cihan may drop them now that the thread is an assistant chat.

---

## Start here (current testing build)

Repository: https://github.com/cihanshahPro/Flow

The baseline is `testing`. Test build 12 (the Flow loop: record → chat → move → level) was developed on `handoff/claude` and is proposed as a pull request into `testing`. Read in this order: [REQUIREMENTS.md](REQUIREMENTS.md) (what must be true), [SKELETON.html](SKELETON.html) (every screen, open it in a browser), [FLOW-LOOP.md](FLOW-LOOP.md) (how it works), then [FINAL-PRODUCT-CONTRACT.md](FINAL-PRODUCT-CONTRACT.md).

```bash
git clone https://github.com/cihanshahPro/Flow.git
cd Flow
git switch -c handoff/<your-name> --track origin/testing
npm ci
npm run verify
```

Work only on your own branch and open a pull request into `testing`; never push to `testing` or `main` directly. Keep release/App Store work in a separate PR from product changes.

The rule of two: every screen has one primary button and at most one secondary link, and Flow decides with two chips. Do not reintroduce tabs, task lists, "mark done" during understanding, or open-ended classification. The old surfaces are kept in `ClassicFlow.tsx`, `PlanMap`, `TaskDetail` and `DraftReview` for reference only.

Useful commands:

```bash
npm run verify
npx expo start --go --lan --port 8083
npx expo export --platform all --output-dir /tmp/flow-export
```

The test Expo server runs on the Mac mini at `10.0.0.152:8083` from `~/Library/Caches/Anchor/flow-build-12`; the voice processor runs from the same checkout with `node --env-file=.env.processor scripts/voice-server.mjs` and the shaper binary at `~/Library/Caches/Anchor/shape-thought` (compile with `swiftc -parse-as-library scripts/shape-thought.swift -o ~/Library/Caches/Anchor/shape-thought`). Use the QR code from that server with the matching SDK 57 Expo Go build. This is a testing runtime only.

## Scope and boundary

This is the native starting point for Anchor, not a completed port of its web workspace. The immediate loop is Today → capture → inbox → next action, with native audio and direct, permission-based Apple Calendar saves. SQLite stores records; `expo-audio` records audio and `expo-file-system` retains the files on the device.

The existing web implementation's authentication, cloud records/audio, browser transcription, full topic/follow-up experience, and calendar export do not transfer automatically. There is no shared account or synchronization contract. Keep this package generic: do not copy private seeds, credentials, or the private web URL into a portfolio or friend build.

## SDK decision to review before release

The current testing branch is on **Expo SDK 57**. Use the matching Expo Go build for the QR test server, and do not downgrade the lockfile to SDK 54. Before a store build, verify the current Expo Go/device compatibility, native module compatibility, signing setup, and EAS build image together; repeat the device checklist after any SDK change.

## Build and TestFlight ownership

| Profile       | Intended purpose                                                                    |
| ------------- | ----------------------------------------------------------------------------------- |
| `development` | Developer-owned native iteration; review native client requirements before building |
| `preview`     | Internal installation and device testing                                            |
| `production`  | Store-distribution build for TestFlight/App Store submission                        |

The developer must supply a real `APP_BUNDLE_ID` and connect an owned Expo/EAS project, using `EAS_PROJECT_ID` where applicable. Make those values available both locally and in the EAS build environment. Run `npm run check:release`; fix its configuration failures rather than bypassing it. Passing this check does not verify signing or product readiness.

TestFlight needs the owner's/friend's Expo account, paid Apple Developer membership, signing credentials, and App Store Connect app configuration. Use a store-distribution production build, then submit it through the configured EAS workflow. Internal-distribution preview builds are not TestFlight builds. External testers may require Beta App Review; App Store release is a separate step. See [Expo's TestFlight guide](https://docs.expo.dev/submit/testflight/). This handoff does not claim that any build has been uploaded or that a paid account has been purchased.

## Physical-device acceptance checklist

Run these on a real iPhone; automated checks or a JavaScript bundle alone do not verify microphone and calendar behavior. Record the device, iOS version, Expo Go/build version, and results.

- [ ] Install dependencies, run typechecking and tests, then open the app through the documented Expo Go route.
- [ ] Go through the funnel: the twenty-statement test (no skip), the reveal without a four-letter code, the five profile questions, then the prompted first thread. Confirm `TEST 12` is visible.
- [ ] Confirm Home shows a "Flow suggests" prompt from your profile, not a blank record button.
- [ ] Record a dump. Confirm the thread opens with your transcript, Flow's reply and one question; the meter shows n/7; the recording plays back.
- [ ] Record the answer. Confirm the meter rises, the celebration and emoji shower appear once, and one move is offered with exactly two chips.
- [ ] Do this → Next card on Home. Done → Flow's note in the thread and the level pill changes. Confirm "Resolved / There's more" appears after the last move.
- [ ] Record something unrelated; confirm a new thread. Record from inside a thread; confirm it appends.
- [ ] Mention a date, then move the device clock past it and reopen; confirm one check-in with two chips and that a local reminder fired the morning after (permission prompt appears only then).
- [ ] Save a written thought. Fully close and reopen the app; confirm threads, moves and levels survive.
- [ ] Deny microphone permission and confirm a useful recovery message and usable text capture. Then enable permission and record, stop, save, and play a short clip.
- [ ] Close and reopen after saving audio; replay the same clip. Test an interruption/phone lock during recording and verify the app's result matches its message. Do not assume background recording support.
- [ ] After loading the development bundle, disconnect networking and repeat text/task/audio saves. Reconnect before reloading from the development server.
- [ ] Complete the device acceptance checks in [CALENDAR.md](CALENDAR.md), including permission denial, cancel, details, alerts, and duplicate prevention.
- [ ] Confirm that saving edited task details updates its linked event, and that external Calendar changes are not imported into Anchor.
- [ ] Check narrow-screen layout, keyboard dismissal, long notes, blank input validation, and visible failure messages. Use generic test content.
- [ ] Confirm purchases remain unavailable and no screen claims an active subscription or successful charge.

## Later: real in-app purchases

The capability interface is intentionally disabled. To enable purchases, choose a supported billing library/provider and use a development build; [Expo Go cannot host the required custom native purchase code](https://docs.expo.dev/guides/in-app-purchases/).

The implementation still needs store products, purchase/entitlement validation on a trusted server or provider, receipt/transaction handling, subscription webhooks, restore purchases, and subscription management. Test purchase cancellation, pending transactions, expiry, refunds/revocation, and reinstall/restore in the store sandbox before exposing a paywall. Never unlock paid access solely from a client flag.

## Current testing runtime

Use SDK 57-compatible Expo Go and the same Expo login on the test server and iPhone. The September 2026 App Store update supersedes earlier SDK 54 guidance. Standalone native builds must be rebuilt for SDK 57. Source is held in testing until device acceptance; no store submission is implied.
