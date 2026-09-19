# Flow — mobile testing build

A small native planning app: capture a thought, choose an action that fits the time available, and keep the next date visible. This is a mobile starter for further development, separate from the existing Anchor web app.

## Test build 12 — the Flow loop

One button. Record (or write) what's on your mind; Flow works out what it's about in the background, asks one question at a time in a chat, and offers a move when it has enough. Accepting a move makes it your Next card. Done, check-ins and confirmations feed a small level system, and Flow gasses you up inside the thread when something real happens. There are no tabs, no task lists and nothing to classify. See [the Flow loop](docs/FLOW-LOOP.md) for the full description and [FINAL-PRODUCT-CONTRACT.md](docs/FINAL-PRODUCT-CONTRACT.md) for the boundaries.

Audio still goes to the paired Mac mini (whisper.cpp for transcription, Apple Foundation Models for Flow's reply, question, grounded points and moves); bounded local rules remain the labeled fallback. The earlier five-tab task app is kept as `ClassicFlow.tsx` but is not reachable.

## What this version covers

| Area      | Mobile scope                                                       |
| --------- | ------------------------------------------------------------------ |
| Home      | One Record button, the Next card, and the threads Flow made        |
| Thread    | A chat with Flow: transcripts, replies, one question, two-chip moves and check-ins |
| Me        | Flow type, level, what Flow knows, pattern notices, feedback        |
| Storage   | SQLite records and audio files on the device                       |
| Calendar  | The Next card can be saved to Apple Calendar; repeated saves update the linked event |
| Reminders | Local notifications the morning after a mentioned date (best effort) |
| Purchases | Disabled capability interface; no payment or subscription flow     |

There is no web-account sync, hosted cloud backend, or in-app purchasing. The testing voice processor is local to the paired Mac mini; see [processor setup](docs/VOICE_PROCESSING.md). The starter contains generic data, with no private web account, personal case details, or embedded web-workspace URL. On iPhone, Calendar permission and a calendar choice enable direct saves through [Expo Calendar](https://docs.expo.dev/versions/v57.0.0/sdk/calendar/). Saving again updates the linked event; changes do not sync automatically or flow back from Calendar. Android uses the system event editor. See [calendar acceptance checks](docs/CALENDAR.md).

## Try it on an iPhone

Use Node.js 22.13.1 or newer, then run these commands from this folder:

```sh
npm ci
npm start
```

Install Expo Go from the iPhone App Store. Keep the phone and development computer on the same network, then scan the terminal's QR code with the iPhone camera. Leave the development server running. A Mac mini can host that server; the app's saved records still belong to the phone, not the Mac mini.

**The testing app now uses Expo SDK 57, React Native 0.86.3 and React 19.2.3**, matching the current iPhone Expo Go. Sign in to the same Expo account in Expo Go and on the development computer (`npx expo login --browser`). See [Expo’s September 3 update](https://expo.dev/changelog/expo-go-57-login). Older guidance saying the App Store stops at SDK 54 is outdated.

The development bundle needs to load from the server. Once loaded, task, note, and recording data remain local and do not require an application backend. Deleting the app or clearing its storage can remove that data; cloud backup and cross-device recovery are not implemented.

## Check and hand off

```sh
npm run typecheck
npm test
npm run check:release
```

The release check deliberately rejects placeholder configuration. `APP_BUNDLE_ID` supplies the Apple bundle identifier; its starter default is `com.example.anchor`. `EAS_PROJECT_ID` is optional for local Expo Go testing and can link the project to the owner's EAS project for builds.

The EAS development, preview, and production profiles are build scaffolding. They do not mean an app has been signed, uploaded, or approved. TestFlight requires the owner or developer's Expo account, Apple Developer membership, signing setup, and App Store Connect configuration. No paid account actions have been performed. Follow the [developer handoff and device checklist](docs/HANDOFF.md) before distributing a build.

## Toolchain verification

The lockfile pins the SDK 57-compatible module family. The obsolete SDK 54 Metro overrides have been removed. Both platform bundle exports and all 21 Expo Doctor checks pass. The dependency audit reports 0 high/critical and 11 moderate findings; review the remaining advisories before a production release.

See [validation notes](docs/VALIDATION.md) for checks actually run and physical-device checks still pending.
