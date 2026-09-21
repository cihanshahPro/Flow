# Reply to Samil's build 9 review — 21 Sep 2026

Read: `docs/HANDOFF-BUILD9.md` was ours, the PDF "Flowthread — reply to your build 9 handoff" was yours. This answers it, one line per number.

## Done on our side

- Repo: personal data removed from the working tree and replaced by invented fixtures of the same shape (`tests/fixtures/sample/`, `tests/sample-phone.test.mjs`); the owner's install id is out of the code (`EXPO_PUBLIC_TEST_INSTALL`, dev `.env` only). History purge with git-filter-repo is owner-run (in progress). Rule written into `docs/COLLABORATION.md`: never again.
- Brain: understood — the worker is live with `/v1/plan` and `/v1/chat`; our "no API credits" line is withdrawn. `FLOW_CLAUDE_CODE` in `scripts/voice-server.mjs` stays dev-only.
- Apple blockers: kept as-is; `docs/RELEASE.md` now says the Reminders strings are justified and the Calendar string covers reading.
- One repo: `cihanshahPro/Flow`. Please push `kodavena/build9` there and archive your copy; we PR into it from `cihan/*` and `kodavena/*`.

## Your five decisions

1. **Calendar titles in /v1/plan → busy ranges only.** Agree. Titles stay in `/v1/chat` for linked events only. We'll change `calendarLines()` in `src/services/intake.ts` to emit `Mon 22: busy 10:00–11:30, 15:00–16:00`; placement is code and doesn't need titles. Watch-outs (court, trip, birthday) are computed on-device from titles and stay.
2. **Automatic project-steps call on the free quota → off on the cloud path.** Agree. `ensureSteps()` runs only on-device or when the user taps "Ask Flow"; on the cloud path it is skipped. Same for any future automatic call.
3. **Thread meter and "What Flow got" cards.** Cihan's call — pending.
4. **Siri / Share / Widget.** After 1.1 is stable; Kodavena takes them (native targets live in your build process). We supply the JS side (`flowthread://record?text=`, `writeWidgetSnapshot()`) on request.
5. **Simulator UX.** (a) Question shown twice: fixed on our side — opening a thread no longer asks, and old script questions retire (`retireScriptQuestions`). (b) Every thread shows the whole dump's summary: the breakdown card should show only that thread's items — we'll fix in `breakdownOf` per project. (c) 4,000-char plan context: raise to 6,000 with titles removed (decision 1 makes context smaller anyway).

## Asks

- Add nothing on your side for access: `seanjohnzon` already has write on `cihanshahPro/Flow`.
- When you push `kodavena/build9`, say so on WhatsApp; we review the four conflict resolutions from `docs/MERGE-2026-09-21.md` the same day.
