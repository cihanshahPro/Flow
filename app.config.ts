import type { ExpoConfig } from "expo/config";

const PHOTO_LIBRARY_PURPOSE =
  "Flowthread doesn't access your photo library. This permission is only requested if you choose to save or share an export.";

const config: ExpoConfig = {
  name: "Flowthread",
  slug: "flowthread",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "flowthread",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: false,
    bundleIdentifier: process.env.APP_BUNDLE_ID || "com.kodavena.flowthread",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSSpeechRecognitionUsageDescription:
        "Flowthread turns your voice note into text on your iPhone. Audio never leaves your device.",
      // Required by App Store processing (ITMS-90683): expo-file-system links Photos for its legacy
      // asset-library API. Flowthread itself never reads or writes the photo library.
      NSPhotoLibraryUsageDescription: PHOTO_LIBRARY_PURPOSE,
      NSPhotoLibraryAddUsageDescription: PHOTO_LIBRARY_PURPOSE,
    },
  },
  android: {
    package: process.env.APP_BUNDLE_ID || "com.kodavena.flowthread",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#142138",
    },
    blockedPermissions: [
      "android.permission.READ_CALENDAR",
      "android.permission.WRITE_CALENDAR",
    ],
  },
  plugins: [
    "expo-asset",
    "./plugins/with-ios-scene",
    [
      "expo-audio",
      {
        microphonePermission:
          "Flowthread records a voice note only when you tap Record.",
        enableBackgroundRecording: false,
        // Recording and playback happen only in the foreground; no background audio mode (App Review 2.5.4).
        enableBackgroundPlayback: false,
      },
    ],
    "expo-sqlite",
    [
      "expo-calendar",
      {
        calendarPermission:
          "Flowthread reads your calendar to plan your week around what's already there and writes its moves into the gaps.",
        remindersPermission: "Flowthread adds the things you're waiting on to a Flow list in Reminders so you're nudged to chase them.",
      },
    ],
  ],
  extra: process.env.EAS_PROJECT_ID
    ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
    : {},
};
export default config;
