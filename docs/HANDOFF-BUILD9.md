# Flowthread — handoff to Samil

Everything you need to ship TestFlight build 9 from `kodavena/v1.0.0`, decide the brain, and finish the three native pieces. **You do not need the Mac mini for any of it** — the mini is Cihan's dev runtime; its steps are in the last section, addressed to him. Same text lives in the repo: `docs/HANDOFF.md` (top section) and `docs/SKELETON.html`. Written 21 Sep 2026.

## 1 · What the app is now (branch `kodavena/v1.0.0`, head `69555d9`)

Expo SDK 57 · React Native 0.86 · TypeScript strict. Tabs **Today · Threads · Calendar · Me**, one Record button. The person talks → Flow reads the calendar first → one model call turns the words into moves / waiting-fors / later / projects → placed around the week → written to Apple Calendar + a "Flow" Reminders list (two-way) → "Your week". Threads are projects; inside a thread Flow is an assistant with the project in front of it. Evening ritual "Plan tomorrow" with routines. Two pushes a day. Screen-by-screen match with the skeleton: Skeleton vs App (https://claude.ai/artifact/TDKxHu6qHMny8j2XhJD3xB).

- **Tests:** `node --experimental-strip-types --test tests/*.test.mjs` → 304 pass. Worker: `cd server/shape-worker && npx vitest run` → 9 pass. `npx tsc --noEmit -p .` clean.
- **Native module:** `modules/flow-intelligence` (Swift, Apple Foundation Models on iOS 26): `shapeThought`, `planThought`, `chatThread`. Only compiled in a native build — Expo Go uses a LAN dev server instead (Cihan runs one on his Mac mini).
- **One contract, four copies** (kept in sync by `tests/plan-contract.test.mjs`): `src/ai-policy.ts` (PLAN_INSTRUCTIONS / PLAN_TOOL / CHAT_INSTRUCTIONS / CHAT_TOOL), `server/shape-worker/src/{prompt,schema}.ts`, `modules/flow-intelligence/ios/FlowIntelligenceModule.swift`, `scripts/shape-thought.swift`. Regenerate `scripts/plan-contract.mjs` from ai-policy when you change either.

## 2 · Build 9 — your one command

**Everything is pushed.** `origin/kodavena/v1.0.0` = `69555d9`. Your own commits on the branch are all there under yours. PR #14 (kodavena/v1.0.0 → testing) has **no conflicts**: `testing` has nothing the branch lacks, so it merges clean when you want it. Start with `git fetch origin && git checkout kodavena/v1.0.0 && git pull --ff-only` — do not rebase or force-push; if you had local work, branch from the head and open a PR into `kodavena/v1.0.0`.

```
git fetch origin && git checkout kodavena/v1.0.0 && git pull --ff-only
npm ci
eas build --platform ios --profile production --auto-submit
```

- EAS project `6cd13cbe-26ed-41f3-87e4-b06c3cd16363`, bundle id `com.kodavena.flowthread`, `autoIncrement` is on. Cihan is not on the EAS project — either add him (`eas project:info` → members) or run this yourself.
- Production env already set in `eas.json`: `EXPO_PUBLIC_SHAPE_URL=https://flowthread-shape.kodavena.workers.dev`. The app picks the brain by capability: on-device (iOS 26 Apple Intelligence) → cloud worker → template. Dev-LAN is ignored in release.
- Permissions in `app.config.ts`: microphone, speech, calendar (read/write), reminders, notifications. Check the usage strings once in App Store Connect.
- Sign-in / Apple ID: nobody but the account owner types credentials. Same for the Apple team.

## 3 · The brain — no API credits (Cihan's decision)

Plain truth first: an iPhone app cannot use its users' Claude subscriptions. Anthropic's OAuth ("Sign in with Claude") is granted only to Claude Code / the Agent SDK, not to third-party apps, and its terms don't allow it as a general app backend. So for **end users** the choices are: (a) **on-device Apple Intelligence** on iOS 26 — free, private, already wired (`modules/flow-intelligence`: `shapeThought`, `planThought`, `chatThread`), weaker; (b) **the Cloudflare worker** with an Anthropic API key — costs per call, already wired with quotas (20/month/install free, 400/day global); (c) later, our own subscription that funds (b). There is no fourth option.

- **Release build 9 runs on-device only unless you deploy the worker.** Worker (`server/shape-worker`): routes `/v1/shape`, `/v1/plan`, `/v1/chat`; `npx wrangler secret put ANTHROPIC_API_KEY`, KV namespace id in `wrangler.toml`, `npx wrangler deploy`. `MODEL` is `claude-haiku-4-5`; `claude-sonnet-4-5` for quality. If Cihan keeps "no API credits", leave it undeployed: the app falls back cleanly and the "Shape notes on a secure server" switch in Me stays off.
- **Dev on your own Mac** (optional): `scripts/voice-server.mjs` can run the brain through _your_ Claude subscription via Claude Code headless (`FLOW_CLAUDE_CODE=1`, one-time `claude` → `/login` on that Mac; transcription needs `whisper-cli` + `ffmpeg` + a Whisper model). See `.env.processor.example`. Not needed for the native build.
- **One contract, four copies**, kept equal by a test: `src/ai-policy.ts`, `server/shape-worker/src/{prompt,schema}.ts`, the Swift module, `scripts/shape-thought.swift`.

## 4 · The three native pieces (SOON in the app until you do them)

| Piece | What the app already has | What's left (native) |
|---|---|---|
| **Siri · "Tell Flow…"** | Deep-link scheme `flowthread://` is registered. Intake accepts text; a short line becomes a move, a long one goes through the week plan. | Add an App Intent (`AppIntents`) "Tell Flow" with a text parameter that opens `flowthread://record?text=…`; handle the URL in `App.tsx` (call `startCapture("text", null, "thought")` with the text prefilled and submit). Expose as a Shortcut so it works from the Action button. |
| **Share sheet** | Same intake path. | Share extension (expo-share-intent or a small native target) that hands text/URLs to `flowthread://record?text=…`. |
| **Lock-screen widget** | `morningLine()` in `src/tomorrow.ts` already builds "2 events · 3 moves · first: Call the DUI lawyer at 10:00". Tasks are in SQLite (`expo-sqlite`). | WidgetKit extension reading a small JSON the app writes to the App Group container on every refresh (add `writeWidgetSnapshot()` next to `mirrorToDev()` in `App.tsx` refresh). |

When they land, flip the three rows in `src/components/Me.tsx` from SOON to ON and update screen 7 of the skeleton.

## 5 · For Cihan — the Mac mini (Samil has no access; skip this section)

- Deploy dir `~/Library/Caches/Anchor/flow-build-12` (`git pull --ff-only`), Metro `npx expo start --go --lan --port 8083 --clear`, voice server `node --env-file=.env.processor scripts/voice-server.mjs` (routes `/process`, `/plan`, `/chat`, `/mirror`).
- **The brain on the mini is your Claude subscription, no API key** (`FLOW_CLAUDE_CODE=1` is set). One login needed, once: `ssh -t macmini /Users/minicihan/.local/node22/bin/claude` → type `/login` → open the link → done. Until then the server falls back to the Apple shaper (the "My DEY case" quality you saw).
- Transcription is now `ggml-large-v3-turbo` (was `base` — "for do for the box"). Model in `/Volumes/Extreme SSD/Anchor/models/`.
- Your phone: open `exp://10.0.0.153:8083`; Me › last row must show the branch head sha, otherwise kill Expo Go and reopen. **Do not delete your data** — it is the test scenario; it is mirrored on the mini and copied into the repo (`tests/fixtures/owner/`).
- `.env.processor` is never committed; no tokens are copied between machines.

## 6 · What's left — the task list

| # | Task | Owner | Done when |
|---|---|---|---|
| 1 | **Set up the brain.** Decide worker-with-key vs on-device-only for build 9. If worker: `npx wrangler secret put ANTHROPIC_API_KEY`, KV id in `wrangler.toml`, `npx wrangler deploy`; check `/v1/plan` and `/v1/chat` answer. | Samil | A recording on a TestFlight phone yields moves titled with verbs ("Call the DUI lawyer"), not project names; the thread answers from the project. |
| 2 | Build 9: `eas build --platform ios --profile production --auto-submit`; add Cihan to the EAS project. | Samil | 1.0.0 (9) in TestFlight, Kodavena Internal. |
| 3 | Siri "Tell Flow…" App Intent + Shortcut (Action button) → `flowthread://record?text=…`; handle the URL in `App.tsx`. | Samil | Me › Siri row ON; a Shortcut run lands as a move. |
| 4 | Share extension → the same URL. | Samil | Me › Share sheet ON; a shared mail lands as a move. |
| 5 | Lock-screen widget: WidgetKit + App Group JSON written on refresh. | Samil | Me › Widget ON; it shows "first: …". |
| 6 | Test on Cihan's real data, never demo data: `tests/fixtures/owner/phone-2026-09-21.json` (his six recordings and threads) runs through the app's own path in `tests/owner-phone.test.mjs`. New snapshots of his phone go next to it. | both | The test stays green as the app changes. |
| 7 | Decide the thread meter ("Getting to know this · %") and the "What Flow got" cards — keep or drop now that the thread is an assistant chat. | Cihan | One line in `docs/HANDOFF.md`. |

## 7 · Known gaps, honestly

- The three native pieces above.
- Quality of everything the person sees is the brain's: with the Apple fallback it is a toy; with Claude (subscription on the mini for dev, API key in the worker for release) it is right. Test with the real brain before judging any screen.
- Expo Go quirks (not in the real app): its dev-menu button floats top-right; scheduled notifications from older Expo experiences show up in the dev "Scheduled pushes" list.
- Threads keep the "Getting to know this · %" meter and the "What Flow got" cards from the earlier vision; Cihan can drop them now that the thread is an assistant chat.

Design contract: skeleton v2 (https://claude.ai/artifact/U8ivxT7qNCMaxmHPJPYwBJ). Feature plan: glue plan (https://claude.ai/artifact/URFuSfXvpzuX1HF2Sgnv4G). These links are private to Cihan's Claude account until he shares them.
