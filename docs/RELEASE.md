# Release build (iOS, local Xcode archive)

`ios/` is generated and not committed. Build a release from a clean checkout in this order:

```bash
export EXPO_PUBLIC_SHAPE_URL=https://flowthread-shape.kodavena.workers.dev
export EAS_PROJECT_ID=6cd13cbe-26ed-41f3-87e4-b06c3cd16363
export APP_BUNDLE_ID=com.kodavena.flowthread

npm ci
npm run verify
npx expo prebuild -p ios --no-install
cd ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
/usr/libexec/PlistBuddy -c "Set CFBundleVersion <N>" Flowthread/Info.plist
NODE_ENV=production xcodebuild -workspace Flowthread.xcworkspace -scheme Flowthread \
  -configuration Release -destination "generic/platform=iOS" \
  -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/"Flowthread <version> (<N>).xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=N4373UA734 CODE_SIGN_STYLE=Automatic archive
```

Then Xcode → Organizer → Distribute App → App Store Connect → Upload.

Why the order matters:

- `pod install` runs expo-sqlite's podspec, which writes the `exsqlite3_*`-prefixed `sqlite3.c/h` into
  `node_modules/expo-sqlite/ios`. Running `npm ci` after it deletes them and the build fails with
  "cannot find 'exsqlite3_open' in scope". Always `npm ci` first.
- CocoaPods on Ruby 4 aborts half-way ("Unicode Normalization not appropriate for ASCII-8BIT")
  unless the locale is UTF-8.
- `prebuild` rewrites the Xcode project without a signing team, so pass `DEVELOPMENT_TEAM`.
- `<N>` must be higher than every build already uploaded for this version.

Check the archive before uploading: `plutil -p .../Flowthread.app/Info.plist` should show the right
`CFBundleShortVersionString` / `CFBundleVersion`, `UIDeviceFamily` = `[1]`,
`ITSAppUsesNonExemptEncryption` = `false`, no `UIBackgroundModes`, and — since build 9 — `NSCalendarsFullAccessUsageDescription`
and `NSRemindersFullAccessUsageDescription` present (the app writes moves to Calendar and chases to a "Flow" list in Reminders;
both are real features now, so App Review 2.5.4 no longer applies). EAS is the supported path (`eas build --platform ios
--profile production --auto-submit`); this local archive order still works.
