# Validation record — September 18, 2026

## Test build 12 — the Flow loop

Completed on this Mac (Node 22, macOS 26) on 2026-09-19:

- Strict TypeScript typecheck and all 193 automated tests pass (`npm run verify`). New coverage: thread fingerprint, routing, Flow's turn, chips, check-ins, parking, resolved, patterns, modes, reminders planner, processing with shaper reply/question/evidence, and rendered Home / thread chat / quiz / Me asserting the rule of two.
- Expo Doctor: 21/21 checks passed. iOS, Android and web bundles exported with Expo SDK 57.
- Browser walkthrough at 390×844 (React Native Web): intro → twenty taps → "You're a Steward" → plate chips → Home with one Record button → written dump → transcript, reply and one question at 3/7 → written answer → 6/7, celebration, one move with two chips → Do this → Next card → Done → Flow's note and level pill "Building" → second unrelated dump created a separate thread → Me showed type, level counters, plate and unlock notice. State survived a page reload.
- The extended Swift shaper compiled on the Mac mini (Swift 6.2, macOS 26.5) and returned reply, question, grounded points and choices for a sample input through Apple Foundation Models.

Also corrected: the `testing` branch did not typecheck (a stray `src/processing.ts` from commit 8b57c1c) and the missing-question wiring had been dropped; both fixed in this build's first commit.

Not verified: physical-iPhone microphone recording through the new capture sheet, audio playback inside chat bubbles, the emoji shower animation on device, local notification delivery, and Apple Calendar from the Next card. React Native Web checks do not establish those. Typed thoughts in the browser used the regex fallback because the browser cannot reach the Mac mini processor.

## Final thread-flow test build

- Strict typecheck passed on the Mac mini runtime.
- `npm run verify` passed: 158 tests, 0 failures.
- iOS, Android, and web exports passed with Expo SDK 57.
- Browser QA confirmed that a dumped thread stays in understanding, shows one generated missing question, exposes only `Record the answer`, and withholds goal development until the thread is ready.
- Testing server restarted at `10.0.0.152:8083`. No production or App Store deployment was performed.

Completed on Node 22.22.1 / macOS:

- TypeScript strict typecheck passed.
- All 22 domain, calendar and release-configuration tests passed. Calendar cases cover complete payloads, alert choices, zones/DST, duplicate saves, concurrency and uncertain-write recovery.
- Expo Doctor passed all 21 checks on the source project.
- Both iOS and Android release JavaScript/Hermes bundles exported successfully.
- The starter previously passed native prebuild for both platforms. This calendar revision also passed Expo config introspection and confirmed the full Calendar access usage description.
- Source review covered task persistence, date/time handling, native calendar result semantics, audio retry identity, and recovery of recordings with missing/corrupt metadata. Targeted recovery helper checks passed.
- The package audit reports 0 high/critical and 11 moderate findings, in transitive dependencies. Review and resolve the remaining advisory before production release; do not claim the dependency audit is clean.

Not verified: a signed native binary, physical-device microphone/playback/calendar permissions, Apple signing, TestFlight installation, IAP, or production backend integration. Full Xcode and CocoaPods were not available in the build environment. A JavaScript bundle export is not a native device test.

The physical-device checklist in HANDOFF.md is required before distributing a release.

SDK 57 upgrade: Expo 57.0.24, React Native 0.86.3, React 19.2.3, TypeScript 6.0.3. Removed SDK 54 Metro overrides and obsolete newArchEnabled config. Strict typecheck, 22 tests, 21 Expo Doctor checks, both platform exports and audit were rerun successfully on the upgraded source. iPhone opening remains subject to matching Expo login and physical-device acceptance.

## Capture-first testing revision

- Strict typecheck and all 27 tests passed, including bounded draft suggestions, original-input retention and stable task identities.
- All 21 Expo Doctor checks passed; iOS, Android and web bundle exports passed.
- Browser QA at a 390 × 844 viewport exercised example drafts, selecting an action, adding a contextual update, parking, and text capture. This is React Native Web QA, not a physical iPhone test.
- New draft storage is additive to the existing database. Native exclusive transactions protect task acceptance; web QA uses the supported web transaction API.
- AI and transcription are not connected. Production/main are excluded from this change.

## Recording and navigation repair — test build 03

Fixed a silent permission-sheet cancellation: recording now waits for foreground restoration, waits for its capture sheet to show, and reports timeout/cancellation explicitly. A successful save exposes playback immediately and an Open saved note in Library action. Tabs clear transient status and reset their scroll position; My mind and Library have explicit section labels.

Validation: 35 automated tests, including component-level recording start/stop, permission dismissal, denial/retry, failed metadata recovery, delayed sheet presentation and background interruption. Native audio/file modules are mocked in these component tests: they verify application control flow, not physical microphone hardware. Browser UI checks cover all three tabs, opening originals and their drafts, making a step smaller and accepting it without a duplicate Add control. iPhone microphone/permission playback still needs a physical-device check; no iOS simulator is installed on the available Macs. Production remains unchanged.

## Voice processing — test build 04

43 automated tests and strict typecheck passed. Removed the model/calendar runtime import cycle. The save path now copies audio and registers its stable URI without creating/checking a second journal after success; legacy recovery remains. Registration no longer includes a UI refresh that could misreport a successful save as failure. New recordings automatically enter transcription and open their draft; old recordings can be processed from Library.

Real local processor validation: generated M4A speech → authenticated HTTP request → ffmpeg → whisper.cpp base → expected transcript → two draft steps, approximately 1.3 seconds. Native microphone acquisition is still a separate physical-device test. See VOICE_PROCESSING.md for LAN testing scope and release limits.
