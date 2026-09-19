const listeners = new Set();
const files = new Map();
export const harness = {
  permission: { granted: true, canAskAgain: true },
  permissionDialog: false,
  starts: 0,
  stops: 0,
  reset() {
    files.clear();
    listeners.clear();
    this.permission = { granted: true, canAskAgain: true };
    this.permissionDialog = false;
    this.starts = 0;
    this.stops = 0;
    AppState.currentState = "active";
    recorder.uri = null;
  },
  state(value) {
    AppState.currentState = value;
    for (const fn of listeners) fn(value);
  },
  savedFiles() {
    return [...files.keys()].filter((x) => x.includes("anchor-voice-"));
  },
};
export const AppState = {
  currentState: "active",
  addEventListener(event, fn) {
    listeners.add(fn);
    return {
      remove() {
        listeners.delete(fn);
      },
    };
  },
};
export const Platform = { OS: "ios" };
export const Linking = { openSettings: async () => {} };
export const StyleSheet = { create: (x) => x };
export const ScrollView = "ScrollView",
  ActivityIndicator = "ActivityIndicator";
export const Pressable = "Pressable",
  Text = "Text",
  TextInput = "TextInput",
  View = "View";
export const SafeAreaView = "SafeAreaView",
  KeyboardAvoidingView = "KeyboardAvoidingView",
  Modal = "Modal";
export const RecordingPresets = { HIGH_QUALITY: {} };
export async function requestRecordingPermissionsAsync() {
  if (harness.permissionDialog) {
    harness.state("inactive");
    setTimeout(() => harness.state("active"), 15);
  }
  return harness.permission;
}
export async function setAudioModeAsync() {}
const recorder = {
  uri: null,
  async prepareToRecordAsync() {
    this.uri = "file://cache/test.m4a";
  },
  record() {
    harness.starts++;
    files.set(this.uri, "test-audio-bytes");
  },
  async stop() {
    harness.stops++;
  },
};
export function useAudioRecorder() {
  return recorder;
}
export function useAudioRecorderState() {
  return { isRecording: false, durationMillis: 0 };
}
export function useAudioPlayer() {
  return { play() {}, pause() {}, async seekTo() {} };
}
export function useAudioPlayerStatus() {
  return { playing: false, duration: 2, currentTime: 0 };
}
export const Paths = {
  document: {
    uri: "file://documents/",
    list() {
      return [...files.keys()]
        .filter((x) => x.startsWith(this.uri))
        .map((x) => new File(x));
    },
  },
};
export class File {
  constructor(base, name) {
    this.uri = typeof base === "string" ? base : base.uri;
    if (name) this.uri += name;
  }
  get name() {
    return this.uri.split("/").pop();
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri)?.length ?? 0;
  }
  get modificationTime() {
    return 1;
  }
  textSync() {
    if (!this.exists) throw Error("missing");
    return files.get(this.uri);
  }
  create() {
    files.set(this.uri, "");
  }
  write(text) {
    files.set(this.uri, text);
  }
  copy(dest) {
    files.set(dest.uri, this.textSync());
  }
  move(dest) {
    this.copy(dest);
    files.delete(this.uri);
    this.uri = dest.uri;
  }
  delete() {
    files.delete(this.uri);
  }
}

// Minimal Animated/Dimensions/Easing so decorative components render in tests.
class AnimatedValue {
  constructor(v) {
    this.value = v;
  }
  setValue(v) {
    this.value = v;
  }
  interpolate() {
    return 0;
  }
}
const animation = () => ({ start(cb) { cb?.({ finished: true }); }, stop() {} });
export const Animated = {
  Value: AnimatedValue,
  View: "Animated.View",
  Text: "Animated.Text",
  timing: () => animation(),
  parallel: () => animation(),
};
export const Easing = { in: (f) => f, quad: (x) => x };
export const Dimensions = { get: () => ({ width: 390, height: 844 }) };
export const Alert = { alert() {} };
// expo-notifications is never exercised in tests; the planner is pure.
export const SchedulableTriggerInputTypes = { DATE: "date" };
export function setNotificationHandler() {}
export async function getAllScheduledNotificationsAsync() { return []; }
export async function cancelScheduledNotificationAsync() {}
export async function getPermissionsAsync() { return { granted: false, canAskAgain: false }; }
export async function requestPermissionsAsync() { return { granted: false, canAskAgain: false }; }
export async function scheduleNotificationAsync() {}
