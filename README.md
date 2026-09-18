# Flow — mobile testing build

A small native planning app: capture a thought, choose an action that fits the time available, and keep the next date visible. This is a mobile starter for further development, separate from the existing Anchor web app.

## Capture-first testing experience

Speak or write from Today. Text becomes a small, editable visual draft; choose one suggestion for Today, add an update, or park the thought. My mind separates active drafts from parked possibilities; Library retains original notes and recordings. Existing detailed task/calendar controls remain under Settings. No existing data is reset.

This build uses bounded local rules, not an AI service. Automatic audio transcription, semantic thought organization, goal connections and reusable routines are explicitly unfinished. The optional example is labeled as an example. Suggestions do not become tasks until selected.

## What this version covers

| Area      | Mobile scope                                                       |
| --------- | ------------------------------------------------------------------ |
| Today     | Tasks and an available-time filter                                 |
| Capture   | Text inbox and deliberate voice recording                          |
| Storage   | SQLite records and audio files on the device                       |
| Calendar  | Save details and an optional alert to Apple Calendar; repeated saves update the linked event |
| Purchases | Disabled capability interface; no payment or subscription flow     |

There is no web-account sync, cloud backend, automatic transcription, or in-app purchasing. The starter contains generic data, with no private web account, personal case details, or embedded web-workspace URL. On iPhone, Calendar permission and a calendar choice enable direct saves through [Expo Calendar](https://docs.expo.dev/versions/v57.0.0/sdk/calendar/). Saving again updates the linked event; changes do not sync automatically or flow back from Calendar. Android uses the system event editor. See [calendar acceptance checks](docs/CALENDAR.md).

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
