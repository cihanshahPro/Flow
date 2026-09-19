/**
 * iOS 27 (Xcode 27 SDK) asserts at launch unless the app adopts the UIScene life cycle.
 * Expo SDK 57 ships ExpoAppSceneDelegate but its prebuild template does not use it yet, so
 * this plugin (re-applied on every prebuild) wires it in:
 *  - Info.plist gets a UIApplicationSceneManifest pointing at EXExpoAppSceneDelegate;
 *  - AppDelegate conforms to ExpoReactNativeFactoryProvider and no longer creates the window
 *    (the scene delegate does).
 * Remove once the Expo template does this itself (SDK 58).
 */
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

module.exports = function withIosScene(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "EXExpoAppSceneDelegate" },
        ],
      },
    };
    return c;
  });
  return withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    if (src.includes("ExpoReactNativeFactoryProvider")) return c;
    src = src.replace("class AppDelegate: ExpoAppDelegate {", "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    src = src.replace(/#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\n#endif\n/, "");
    if (!src.includes("ExpoReactNativeFactoryProvider {") || src.includes("startReactNative"))
      throw new Error("with-ios-scene: AppDelegate template changed; update the plugin.");
    c.modResults.contents = src;
    return c;
  });
};
