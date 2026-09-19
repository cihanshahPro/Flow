# Flow mobile — developer handoff

## Start here (current testing build)

Repository: https://github.com/cihanshahPro/Flow

The handoff branch is `codex/final-thread-flow`. It contains the recording-first thread flow and is the branch to review before any release work. The protected baseline is `testing`; production/main is outside this handoff.

Clone and create a personal working branch from the handoff branch:

```bash
git clone https://github.com/cihanshahPro/Flow.git
cd Flow
git fetch origin codex/final-thread-flow
git switch -c handoff/<your-name> --track origin/codex/final-thread-flow
npm ci
npm run verify
```

Work only on `handoff/<your-name>`. Push it and open a pull request into `codex/final-thread-flow`; do not push directly to `testing` or `main`. The owner can review and merge that PR after the testing build is checked. After merge, the owner promotes the reviewed commit to `testing` and runs the device checks below. Keep release/App Store work in a separate PR from product changes.

The current user path is intentionally narrow: profile fingerprint → record a full dump → Flow transcribes and forms a thread → Flow asks one focused missing question → record the answer → only a ready thread can become goals. Do not reintroduce task lists, “mark done” steps, or open-ended classification during the dump/understanding stages. Read [FINAL-PRODUCT-CONTRACT.md](FINAL-PRODUCT-CONTRACT.md) before changing routing or capture behavior.

Useful commands:

```bash
npm run verify
npx expo start --go --lan --port 8082
npx expo export --platform all --output-dir /tmp/flow-export
```

The test Expo server is on the Mac mini at `10.0.0.152:8082`; use the QR code from that server with the matching SDK 57 Expo Go build. This is a testing runtime only. Do not submit a build or merge into `main` as part of routine feature work.

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
- [ ] Create a task, change its estimate and available-time filter, complete/reopen it, and verify the visible results.
- [ ] Save a text thought. Fully close and reopen the app; confirm saved tasks and notes survive.
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
