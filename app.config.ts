import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Flow",
  slug: "anchor-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "anchor",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_BUNDLE_ID || "com.example.anchor",
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: process.env.APP_BUNDLE_ID || "com.example.anchor",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#102E2C",
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
          "Flow records a voice note only when you tap Record.",
        enableBackgroundRecording: false,
      },
    ],
    "expo-sqlite",
    [
      "expo-calendar",
      {
        calendarPermission:
          "Flow saves your chosen actions and alerts to Calendar and checks linked events to avoid duplicates.",
      },
    ],
  ],
  extra: process.env.EAS_PROJECT_ID
    ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
    : {},
};
export default config;
