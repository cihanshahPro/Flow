import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Flowthread",
  slug: "flowthread",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "flowthread",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_BUNDLE_ID || "com.kodavena.flowthread",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSSpeechRecognitionUsageDescription:
        "Flowthread turns your voice note into text on your iPhone. Audio never leaves your device.",
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
    [
      "expo-audio",
      {
        microphonePermission:
          "Flowthread records a voice note only when you tap Record.",
        enableBackgroundRecording: false,
      },
    ],
    "expo-sqlite",
    [
      "expo-calendar",
      {
        calendarPermission:
          "Flowthread saves your chosen actions and alerts to Calendar and checks linked events to avoid duplicates.",
      },
    ],
  ],
  extra: process.env.EAS_PROJECT_ID
    ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
    : {},
};
export default config;
