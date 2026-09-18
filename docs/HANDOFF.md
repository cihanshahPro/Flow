# Anchor mobile — developer handoff

## Scope and boundary

This is the native starting point for Anchor, not a completed port of its web workspace. The immediate loop is Today → capture → inbox → next action, with native audio and a user-reviewed calendar handoff. SQLite stores records; `expo-audio` records audio and `expo-file-system` retains the files on the device.

The existing web implementation's authentication, cloud records/audio, browser transcription, full topic/follow-up experience, and calendar export do not transfer automatically. There is no shared account or synchronization contract. Keep this package generic: do not copy private seeds, credentials, or the private web URL into a portfolio or friend build.

## SDK decision to review before release

The dependency baseline is **Expo SDK 54 (`expo ~54.0.36`), React Native 0.81.5, React 19.1.0**. This is intentional for physical-iPhone testing in App Store Expo Go. [Expo currently documents](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) that its App Store Expo Go build stops at SDK 54.

Before upgrading, review the current Expo Go/testing route, library compatibility, and migration notes together; update the lockfile and repeat the device checklist. A development build becomes the preferred route when adding custom native modules. SDK 54 itself is not the current upload blocker: Expo says its default EAS image meets the Xcode 26/iOS 26 build requirement. Recheck that [build-image guidance](https://expo.dev/blog/app-store-connect-minimum-sdk-26) for the actual release date.

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
- [ ] Give a task a date and time; open the calendar editor and verify title, local date/time, and duration. Cancel once and confirm no event was created; repeat and explicitly save once.
- [ ] Edit the exported event in Calendar and the original task in Anchor. Confirm there is no implied synchronization. Repeated exports can create separate calendar events.
- [ ] Check narrow-screen layout, keyboard dismissal, long notes, blank input validation, and visible failure messages. Use generic test content.
- [ ] Confirm purchases remain unavailable and no screen claims an active subscription or successful charge.

## Later: real in-app purchases

The capability interface is intentionally disabled. To enable purchases, choose a supported billing library/provider and use a development build; [Expo Go cannot host the required custom native purchase code](https://docs.expo.dev/guides/in-app-purchases/).

The implementation still needs store products, purchase/entitlement validation on a trusted server or provider, receipt/transaction handling, subscription webhooks, restore purchases, and subscription management. Test purchase cancellation, pending transactions, expiry, refunds/revocation, and reinstall/restore in the store sandbox before exposing a paywall. Never unlock paid access solely from a client flag.
