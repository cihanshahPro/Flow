# Anchor mobile

A small native planning app: capture a thought, choose an action that fits the time available, and keep the next date visible. This is a mobile starter for further development, separate from the existing Anchor web app.

## What this version covers

| Area      | Mobile scope                                                       |
| --------- | ------------------------------------------------------------------ |
| Today     | Tasks and an available-time filter                                 |
| Capture   | Text inbox and deliberate voice recording                          |
| Storage   | SQLite records and audio files on the device                       |
| Calendar  | Open a task in the native event editor; the user reviews and saves |
| Purchases | Disabled capability interface; no payment or subscription flow     |

There is no web-account sync, cloud backend, automatic transcription, or in-app purchasing. The starter contains generic data, with no private web account, personal case details, or embedded web-workspace URL. The native calendar handoff is one-way: later changes in either app do not update the other. It uses Expo's [system calendar editor](https://docs.expo.dev/versions/v54.0.0/sdk/calendar/).

## Try it on an iPhone

Use Node.js 22.13.1 or newer, then run these commands from this folder:

```sh
npm ci
npm start
```

Install Expo Go from the iPhone App Store. Keep the phone and development computer on the same network, then scan the terminal's QR code with the iPhone camera. Leave the development server running. A Mac mini can host that server; the app's saved records still belong to the phone, not the Mac mini.

**The project intentionally uses Expo SDK 54, React Native 0.81.5, and React 19.1.0.** As verified on September 18, 2026, the App Store version of Expo Go supports SDK 54; SDK 55 and newer require another testing route on a physical iPhone. See [Expo's version-mismatch guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/). Do not upgrade the SDK merely to clear a warning without reviewing this compatibility constraint.

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

The checked-in lockfile pins compatible SDK 54 modules, PostCSS 8.5.23, and the Metro 0.83.8 patch family. These build-tool overrides remove the high-severity audit findings observed in the original template and have passed both platform bundle exports. Do not remove them casually. The current audit still reports 13 moderate tooling/transitive findings; review them again before release. This is not an audit-clean or production-approved build.

See [validation notes](docs/VALIDATION.md) for checks actually run and physical-device checks still pending.
