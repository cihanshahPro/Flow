# Flowthread — reply to Samil's build 9 review (paste this into your Claude)

Head: `git log -1` on `kodavena/v1.0.0` · rules: `docs/HANDOFF-PROTOCOL.md` · decisions: `docs/DECISIONS.md`

From Cihan's side · 21 Sep 2026 · repo hub `cihanshahPro/Flow`, branch `kodavena/v1.0.0`, head see `git log -1`.

## Facts you need (so nothing bounces back)

- **One repo from now: `cihanshahPro/Flow`.** You (`samilaltun1997-source`) have write there since 19 Sep; Cihan's Claude pushes as `seanjohnzon` (write). Cihan (`cihanshahPro`) is owner. Nobody needs new access.
- **Do this first:** `git remote add hub https://github.com/cihanshahPro/Flow.git && git push hub kodavena/build9` — then archive `samilaltun1997-source/flow`. From then on: branches `cihan/*` (us) and `kodavena/*` (you), PRs into `kodavena/build9` → `testing` → `main`. No rebase/force-push on shared branches. One WhatsApp line before starting a piece of work.
- **Personal data:** `tests/fixtures/owner/*` and `tests/fixtures/owner-dump-1.txt` are deleted on `kodavena/v1.0.0` (`a756f89`) and replaced by an invented person with the same shape: `tests/fixtures/sample/phone-1.json`, `tests/fixtures/sample-dump-1.txt`, `tests/sample-phone.test.mjs`. **In your copy: delete the same two paths and drop any anonymised copies of them; take the sample fixtures from `a756f89`.** History purge in the hub is owner-run with git-filter-repo (Cihan has the command); until then treat the hub's history as containing them.
- **Brain:** understood — the worker is live with `/v1/plan` and `/v1/chat`; our "no API credits" line is withdrawn. `FLOW_CLAUDE_CODE` in `scripts/voice-server.mjs` is dev-only and never shipped.
- **Apple blockers:** keep exactly as your list. `docs/RELEASE.md` on our branch says Reminders strings are justified (real feature) and the Calendar string covers reading — keep that wording.
- **New since your merge at `620d850`:** `a756f89` (sample fixtures, install id out of code, `EXPO_PUBLIC_TEST_INSTALL` dev-only), `d03f173` (docs: `COLLABORATION.md`, this file). Nothing in `src/` changed after `620d850` except the two lines in `App.tsx`/`Me.tsx` that renamed the dev import row. Merge is trivial.

## Your five decisions — answered, with who does it

1. **Busy ranges instead of calendar titles in `/v1/plan`.** Yes. **We do it** (`cihan/plan-busy-ranges`): `calendarLines()` in `src/services/intake.ts` emits `Mon 22: busy 10:00–11:30, 15:00–16:00`; watch-outs are computed on-device and unchanged; `/v1/chat` keeps linked titles. Worker needs no change.
2. **Automatic calls must not spend the free quota.** Yes. **We do it** (same branch): `ensureSteps()` and any automatic call run only on-device; on the cloud path they are skipped. Only user-started plan/chat use quota.
3. **Thread meter + "What Flow got" cards.** Keep both for 1.1; revisit with real users (D3 in `docs/DECISIONS.md`).
4. **Siri / Share / Widget.** After 1.1 is stable. **You take the native targets**; we ship the JS side on request: `flowthread://record?text=…` handling in `App.tsx` and `writeWidgetSnapshot()` (App Group JSON from `morningLine()`).
5. **Simulator UX.** (a) Question shown twice — fixed on our branch: opening a thread asks nothing, old script questions retire (`retireScriptQuestions`). (b) Every thread showing the whole dump's summary — **we fix** (`breakdownOf` per project). (c) Plan context cap — raise to 6,000 chars once titles are gone (decision 1).

## What you do next, in order

1. Push `kodavena/build9` to the hub; archive your copy; delete the two personal paths in it.
2. Merge `kodavena/v1.0.0` (`d03f173`) into `kodavena/build9` — expect no conflicts in `src/`.
3. Reply on WhatsApp with the build9 head sha after the push. We review `docs/MERGE-2026-09-21.md` and your four conflict resolutions the same day and PR anything we disagree with — no silent edits.
4. Keep uploading builds as before (Xcode archive, `docs/RELEASE.md`); announce the build number on WhatsApp.

## What we do next

`cihan/plan-busy-ranges` (decisions 1 + 2 + 5b/5c) as a PR into `kodavena/build9` within the day, tests green, no other scope.
