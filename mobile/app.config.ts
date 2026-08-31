import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Sunshine",
  slug: "sunshine-ai",
  scheme: "sunshine",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  // The canvas is always dark; never let iOS light mode wash it out.
  userInterfaceStyle: "dark",
  backgroundColor: "#000000",
  ios: {
    bundleIdentifier: "com.sunshine.ai",
    // iPhone-first: no tablet layout work in scope.
    supportsTablet: false,
    infoPlist: {
      NSMicrophoneUsageDescription:
        "Sunshine listens so you can talk with it and steer what appears on screen.",
      UIViewControllerBasedStatusBarAppearance: false,
      // Portrait only. Expo's `orientation` also emits upside-down, which modern
      // iPhones never actually use and which this canvas is not composed for.
      UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
    },
  },
  android: {
    package: "com.sunshine.ai",
    adaptiveIcon: {
      backgroundColor: "#000000",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    [
      "@config-plugins/react-native-webrtc",
      {
        // react-native-webrtc links the camera APIs even though this app is audio only,
        // so the string has to exist. It is never requested at runtime.
        cameraPermission: "Sunshine does not use the camera.",
        microphonePermission:
          "Sunshine listens so you can talk with it and steer what appears on screen.",
      },
    ],
    "@livekit/react-native-expo-plugin",
    ["expo-video", { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", resizeMode: "contain", backgroundColor: "#000000" },
    ],
  ],
  extra: {
    eas: { projectId: undefined },
  },
};

export default config;
