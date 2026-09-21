import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { FlowIntelligence } from "../../modules/flow-intelligence";
import {
  CLOUD_PATH,
  CLOUD_TIMEOUT_MS,
  CloudError,
  cloudRequest,
  consumeQuota,
  contextText,
  exhaustQuota,
  parsePlan,
  parseQuotaLimit,
  parseShape,
  quotaRemaining,
  readCloudResponse,
  selectShaper,
  type Capabilities,
  type ProfileContext,
  type Selection,
  type ThreadContext,
  type Shape,
  type ShaperKind,
  type PlanShape,
} from "../ai-policy";
import { SHAPE_TIMEOUT_MS, ShapeCancelled, ShapeTimeout, raceShape } from "../ai-quality";
import { installId, loadAiState, setCloudConsent, setQuota } from "./ai-state";

declare const __DEV__: boolean | undefined;

export type ShapeInput = { text: string; locale: string; profile: ProfileContext | null; thread?: ThreadContext | null };
export interface Processor {
  kind: ShaperKind;
  /** null means "no shape": the caller keeps the template draft. */
  shape(input: ShapeInput): Promise<Shape | null>;
  /** The intake: the dump as plan items. null means "use the local pass". */
  plan(input: { text: string; locale: string; context: string }): Promise<PlanShape | null>;
}

/** Development-only LAN processor (the old Mac processor). Stripped from release bundles. */
export function devLanConfig(): { url: string; token: string } | null {
  if (typeof __DEV__ === "undefined" || !__DEV__) return null;
  const url = process.env.EXPO_PUBLIC_PROCESSOR_URL;
  const token = process.env.EXPO_PUBLIC_PROCESSOR_TOKEN;
  return url && token ? { url, token } : null;
}

export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

export async function capabilities(): Promise<Capabilities> {
  if (!FlowIntelligence) return { speech: false, llm: false, reason: "no-native-module" };
  try {
    const caps = await FlowIntelligence.capabilities();
    const dev = typeof __DEV__ !== "undefined" && __DEV__;
    // Dev only: behave like a device without Apple Intelligence to exercise the cloud path.
    const out = dev && process.env.EXPO_PUBLIC_FORCE_NO_LLM === "1" ? { ...caps, llm: false, reason: "forced-no-llm" } : caps;
    if (dev) console.log("[Flow caps]", JSON.stringify(out));
    return out;
  } catch {
    return { speech: false, llm: false, reason: "capabilities-failed" };
  }
}

// ---------------------------------------------------------------- transcription

/** Voice → text on the iPhone. The dev LAN path exists only in __DEV__ builds. */
export async function transcribeAudio(uri: string): Promise<{ text: string; shape?: unknown }> {
  const caps = await capabilities();
  if (FlowIntelligence && caps.speech) {
    try {
      return { text: await FlowIntelligence.transcribe(uri, deviceLocale()) };
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message
          ? error.message
          : "Transcription could not finish. Your audio is still saved.",
      );
    }
  }
  const lan = devLanConfig();
  if (lan) return lanTranscribe(lan, uri);
  throw new Error(
    "On-device transcription isn't available on this device yet. Your recording is saved.",
  );
}

async function lanTranscribe(lan: { url: string; token: string }, uri: string) {
  const file = new File(uri);
  if (!file.exists || !file.size) throw new Error("The saved recording could not be read.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 420000);
  try {
    const response = await fetch(lan.url + "/process", {
      method: "POST",
      headers: { Authorization: "Bearer " + lan.token, "Content-Type": "application/octet-stream" },
      body: file,
      signal: controller.signal,
    });
    const result = (await response.json()) as { text?: string; shape?: unknown; error?: string };
    if (!response.ok) throw new Error(result.error || "Transcription could not finish.");
    if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 20000)
      throw new Error("No usable transcript came back. Your audio is still saved.");
    return { text: result.text.trim(), shape: result.shape };
  } catch (error) {
    if (error instanceof Error && !/network|fetch|abort/i.test(error.message)) throw error;
    throw new Error("Could not reach the development processor. Your audio is still saved; retry processing.");
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------- processors

export const OnDeviceProcessor: Processor = {
  kind: "on-device",
  async shape({ text, profile, thread }) {
    if (!FlowIntelligence) throw new Error("no native module");
    return parseShape(await FlowIntelligence.shapeThought(text, contextText(profile, thread)));
  },
  async plan({ text, context }) {
    if (!FlowIntelligence?.planThought) throw new Error("no native plan");
    return parsePlan(await FlowIntelligence.planThought(text, context), text);
  },
};

async function cloudPost(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const base = process.env.EXPO_PUBLIC_SHAPE_URL;
  if (!base) throw new CloudError("unavailable", "cloud not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(base.replace(/\/$/, "") + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Flow-Install": await installId(), "X-Flow-Client": "flowthread-ios/1" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw controller.signal.aborted ? new CloudError("timeout", "cloud timed out") : new CloudError("network", (error as Error)?.message || "network failed");
  } finally {
    clearTimeout(timer);
  }
  return { status: response.status, json: await response.json().catch(() => null) };
}

export const CloudProcessor: Processor = {
  kind: "cloud",
  async shape({ text, locale, profile, thread }) {
    const base = process.env.EXPO_PUBLIC_SHAPE_URL;
    if (!base) throw new CloudError("unavailable", "cloud not configured");
    const body = cloudRequest(text, locale, profile, thread);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(base.replace(/\/$/, "") + CLOUD_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Anonymous install ID. App Attest / DeviceCheck is added in phase 2b.
          "X-Flow-Install": await installId(),
          "X-Flow-Client": "flowthread-ios/1",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw controller.signal.aborted
        ? new CloudError("timeout", "cloud timed out")
        : new CloudError("network", (error as Error)?.message || "network failed");
    } finally {
      clearTimeout(timer);
    }
    const json = await response.json().catch(() => null);
    return readCloudResponse(response.status, json);
  },
  async plan({ text, locale, context }) {
    const { status, json } = await cloudPost("/v1/plan", { version: 1, text, locale, context });
    const b = (json ?? {}) as Record<string, unknown>;
    if (status < 200 || status >= 300) throw new CloudError(status === 429 ? "rate_limited" : "unavailable", `cloud status ${status}`);
    return parsePlan(b.plan, text);
  },
};

export const DevLanProcessor: Processor = {
  kind: "dev-lan",
  async shape({ text, profile, thread }) {
    const lan = devLanConfig();
    if (!lan) throw new Error("dev lan not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(lan.url + "/process", {
        method: "POST",
        headers: { Authorization: "Bearer " + lan.token, "Content-Type": "application/json" },
        body: JSON.stringify(contextText(profile, thread) ? { text, context: contextText(profile, thread) } : { text }),
        signal: controller.signal,
      });
      const result = (await response.json()) as { shape?: unknown; error?: string };
      if (!response.ok || !result.shape) throw new Error(result.error || "no shape");
      return parseShape(result.shape);
    } finally {
      clearTimeout(timer);
    }
  },
  async plan({ text, context }) {
    const lan = devLanConfig();
    if (!lan) throw new Error("dev lan not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(lan.url + "/plan", {
        method: "POST",
        headers: { Authorization: "Bearer " + lan.token, "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
        signal: controller.signal,
      });
      const result = (await response.json()) as { plan?: unknown; error?: string };
      if (!response.ok || !result.plan) throw new Error(result.error || "no plan");
      return parsePlan(result.plan, text);
    } finally {
      clearTimeout(timer);
    }
  },
};

export const TemplateProcessor: Processor = { kind: "template", shape: async () => null, plan: async () => null };

const PROCESSORS: Record<ShaperKind, Processor> = {
  "on-device": OnDeviceProcessor,
  cloud: CloudProcessor,
  "dev-lan": DevLanProcessor,
  template: TemplateProcessor,
};

// ---------------------------------------------------------------- selector + debug log

export type ShaperLogEntry = Selection & { at: string; outcome: "ok" | "fallback"; detail?: string };
const log: ShaperLogEntry[] = [];
function record(entry: Omit<ShaperLogEntry, "at">) {
  log.unshift({ ...entry, at: new Date().toISOString() });
  log.length = Math.min(log.length, 20);
  if (typeof __DEV__ !== "undefined" && __DEV__)
    console.log(`[Flow shaper] ${entry.kind} (${entry.reason}) → ${entry.outcome}${entry.detail ? ": " + entry.detail : ""}`);
}
/** Most recent shaper decisions, newest first (debug only). */
export const shaperLog = (): readonly ShaperLogEntry[] => log;

export type ShapeOptions = {
  /** Shows the one-time cloud consent sheet; resolves true for Allow. */
  askCloudConsent?: () => Promise<boolean>;
  /** The thread this text continues, so the reply is a turn in a conversation. */
  thread?: ThreadContext | null;
  now?: Date;
  /** Abort to stop waiting: Flow falls back to the template draft. */
  signal?: AbortSignal;
  timeoutMs?: number;
};
export type ShapeOutcome = { shape: Shape | null; kind: ShaperKind; reason: string };

export async function shapeText(
  text: string,
  profile: ProfileContext | null,
  options: ShapeOptions = {},
): Promise<ShapeOutcome> {
  const now = options.now ?? new Date();
  const limit = parseQuotaLimit(process.env.EXPO_PUBLIC_FREE_SHAPE_QUOTA);
  const [caps, state] = await Promise.all([capabilities(), loadAiState().catch(() => ({}) as never)]);
  let selection = selectShaper({
    caps,
    consent: state?.consent,
    quotaRemaining: quotaRemaining(state?.quota, now, limit),
    cloudConfigured: !!process.env.EXPO_PUBLIC_SHAPE_URL,
    devLan: !!devLanConfig(),
  });
  if (selection.askConsent) {
    if (!options.askCloudConsent) selection = { kind: "template", reason: "cloud-consent-needed-no-ui" };
    else {
      const allowed = await options.askCloudConsent().catch(() => false);
      await setCloudConsent(allowed ? "allowed" : "declined");
      selection = allowed
        ? { kind: "cloud", reason: "cloud-consent-just-given" }
        : { kind: "template", reason: "cloud-consent-declined" };
    }
  }
  try {
    const shape = await raceShape(
      PROCESSORS[selection.kind].shape({ text, locale: deviceLocale(), profile, thread: options.thread ?? null }),
      options.timeoutMs ?? SHAPE_TIMEOUT_MS,
      options.signal,
    );
    if (selection.kind === "cloud") await setQuota(consumeQuota(state?.quota, now));
    record({ ...selection, outcome: "ok" });
    return { shape, kind: shape ? selection.kind : "template", reason: selection.reason };
  } catch (error) {
    if (error instanceof CloudError && error.code === "quota_exceeded") await setQuota(exhaustQuota(now, limit));
    const detail =
      error instanceof ShapeTimeout ? "timeout" : error instanceof ShapeCancelled ? "cancelled" : error instanceof CloudError ? error.code : (error as Error)?.message;
    if (error instanceof ShapeTimeout) console.warn(`[Flow shaper] ${selection.kind} timed out after ${options.timeoutMs ?? SHAPE_TIMEOUT_MS} ms; using the template draft`);
    record({ ...selection, outcome: "fallback", detail });
    return { shape: null, kind: "template", reason: `${selection.reason} → template (${detail})` };
  }
}

/** The intake's one model call. Falls back to null (the local pass) the same way shapeText falls back to the template. */
export async function planText(text: string, context: string, options: ShapeOptions = {}): Promise<{ plan: PlanShape | null; kind: ShaperKind; reason: string }> {
  const now = options.now ?? new Date();
  const limit = parseQuotaLimit(process.env.EXPO_PUBLIC_FREE_SHAPE_QUOTA);
  const [caps, state] = await Promise.all([capabilities(), loadAiState().catch(() => ({}) as never)]);
  let selection = selectShaper({ caps, consent: state?.consent, quotaRemaining: quotaRemaining(state?.quota, now, limit), cloudConfigured: !!process.env.EXPO_PUBLIC_SHAPE_URL, devLan: !!devLanConfig() });
  if (selection.askConsent) {
    if (!options.askCloudConsent) selection = { kind: "template", reason: "cloud-consent-needed-no-ui" };
    else {
      const allowed = await options.askCloudConsent().catch(() => false);
      await setCloudConsent(allowed ? "allowed" : "declined");
      selection = allowed ? { kind: "cloud", reason: "cloud-consent-just-given" } : { kind: "template", reason: "cloud-consent-declined" };
    }
  }
  try {
    const plan = await raceShape(PROCESSORS[selection.kind].plan({ text, locale: deviceLocale(), context }), options.timeoutMs ?? SHAPE_TIMEOUT_MS, options.signal);
    if (selection.kind === "cloud") await setQuota(consumeQuota(state?.quota, now));
    record({ ...selection, outcome: "ok" });
    return { plan, kind: plan ? selection.kind : "template", reason: selection.reason };
  } catch (error) {
    const detail = error instanceof ShapeTimeout ? "timeout" : error instanceof ShapeCancelled ? "cancelled" : error instanceof CloudError ? error.code : (error as Error)?.message;
    record({ ...selection, outcome: "fallback", detail });
    return { plan: null, kind: "template", reason: `${selection.reason} → local (${detail})` };
  }
}
