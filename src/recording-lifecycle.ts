export type AppLifecycle = {
  readonly currentState: string | null;
  addEventListener(event: "change", listener: (state: string) => void): { remove(): void };
};

// iOS permission sheets temporarily make the app inactive. Wait for their dismissal
// instead of silently abandoning an already-authorized recording.
export function waitForRecordingForeground(
  app: AppLifecycle,
  cancelled: () => boolean,
  timeoutMs = 8000,
): Promise<void> {
  if (cancelled() || app.currentState === "background")
    return Promise.reject(new Error("Recording was cancelled when the app left the foreground. Tap Start recording to try again."));
  if (app.currentState === "active") return Promise.resolve();
  return new Promise((resolve, reject) => {
    let finished = false;
    let subscription: { remove(): void } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      subscription?.remove();
      if (timer) clearTimeout(timer);
      if (error) reject(error); else resolve();
    }
    subscription = app.addEventListener("change", (state) => {
      if (cancelled() || state === "background")
        finish(new Error("Recording was cancelled when the app left the foreground. Tap Start recording to try again."));
      else if (state === "active") finish();
    });
    timer = setTimeout(() => finish(new Error("The microphone is not ready yet. Close any permission dialog, then tap Start recording.")), timeoutMs);
    // Cover a state change between the initial check and subscribing.
    if (app.currentState === "active") finish();
  });
}
