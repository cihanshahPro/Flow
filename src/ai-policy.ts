/**
 * Plan D: which engine shapes a thought, and the cloud contract.
 * Pure logic only (no native or storage imports) so it is unit-testable.
 *
 * Speech → text always runs on the iPhone. Shaping runs:
 *   1. on-device (Apple Foundation Models) when the phone supports it;
 *   2. in the cloud (text only, never audio) with one-time consent and a free monthly quota;
 *   3. otherwise with the local template rules.
 */
import { flowType } from "./flow-voice.ts";
import type { Profile } from "./personality.ts";

export type ShaperKind = "on-device" | "cloud" | "dev-lan" | "template";
export type Consent = "allowed" | "declined" | undefined;

export type Capabilities = { speech: boolean; llm: boolean; reason: string };
export type QuotaRecord = { month: string; used: number };
export type AiState = { consent?: Consent; installId?: string; quota?: QuotaRecord };

export type Selection = {
  kind: ShaperKind;
  reason: string;
  /** True when the one-time cloud consent sheet should be shown first. */
  askConsent?: boolean;
};

export const DEFAULT_FREE_QUOTA = 20;

export function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Used count for the current month; a new month starts at zero. */
export function quotaUsed(record: QuotaRecord | undefined, now: Date): number {
  return record && record.month === monthKey(now) ? Math.max(0, record.used) : 0;
}
export function quotaRemaining(record: QuotaRecord | undefined, now: Date, limit: number): number {
  return Math.max(0, limit - quotaUsed(record, now));
}
export function consumeQuota(record: QuotaRecord | undefined, now: Date): QuotaRecord {
  return { month: monthKey(now), used: quotaUsed(record, now) + 1 };
}
/** Server says the month is spent: mirror it locally so we stop asking. */
export function exhaustQuota(now: Date, limit: number): QuotaRecord {
  return { month: monthKey(now), used: limit };
}

export function parseQuotaLimit(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : DEFAULT_FREE_QUOTA;
}

export function selectShaper(input: {
  caps: Capabilities;
  consent: Consent;
  quotaRemaining: number;
  cloudConfigured: boolean;
  devLan?: boolean;
}): Selection {
  const { caps, consent } = input;
  if (caps.llm) return { kind: "on-device", reason: "apple-intelligence-available" };
  if (input.devLan) return { kind: "dev-lan", reason: `dev-lan (llm: ${caps.reason})` };
  if (!input.cloudConfigured) return { kind: "template", reason: `cloud-not-configured (llm: ${caps.reason})` };
  if (consent === "declined") return { kind: "template", reason: "cloud-consent-declined" };
  if (input.quotaRemaining <= 0) return { kind: "template", reason: "cloud-quota-exhausted" };
  if (consent !== "allowed")
    return { kind: "cloud", reason: `cloud-consent-needed (llm: ${caps.reason})`, askConsent: true };
  return { kind: "cloud", reason: `cloud (llm: ${caps.reason})` };
}

// ---------------------------------------------------------------- shape schema

export const POINT_IDS = ["outcome", "people", "timing", "constraints", "motivation", "dependencies", "next"] as const;
export type ShapeChoice = { label: string; action: string; smallAction: string; evidence: string; reason: string };
export type ShapePoint = { id: (typeof POINT_IDS)[number]; evidence: string };
/** Identical to the JSON the processor server and the native module return. */
export type Shape = {
  title: string;
  summary: string;
  reply: string;
  question: string;
  points: ShapePoint[];
  choices: ShapeChoice[];
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

/** Strict structural check; grounding against the source happens in shapedDraft. */
export function parseShape(value: unknown): Shape {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!raw || typeof raw !== "object") throw new Error("shape: not an object");
  const o = raw as Record<string, unknown>;
  const title = str(o.title, 200), summary = str(o.summary, 2000);
  const reply = str(o.reply ?? "", 400), question = str(o.question ?? "", 400);
  if (!title?.trim() || !summary?.trim() || reply === null || question === null)
    throw new Error("shape: missing text fields");
  if (!Array.isArray(o.choices) || o.choices.length > 3) throw new Error("shape: bad choices");
  const points = Array.isArray(o.points) ? o.points : [];
  if (points.length > 7) throw new Error("shape: too many points");
  const choices = o.choices.map((c) => {
    const r = (c ?? {}) as Record<string, unknown>;
    const out = {
      label: str(r.label, 200), action: str(r.action, 400), smallAction: str(r.smallAction, 400),
      evidence: str(r.evidence, 1000), reason: str(r.reason, 400),
    };
    if (Object.values(out).some((x) => x === null)) throw new Error("shape: bad choice");
    return out as ShapeChoice;
  });
  const parsedPoints = points.flatMap((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const id = r.id as ShapePoint["id"];
    const evidence = str(r.evidence, 1000);
    return POINT_IDS.includes(id) && evidence ? [{ id, evidence }] : [];
  });
  return { title, summary, reply, question, points: parsedPoints, choices };
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- profile context

/** What the shaper may know about the person. Never raw quiz answers. */
export type ProfileContext = {
  type?: "Catalyst" | "Steward" | "Architect" | "Coordinator";
  typeLine?: string;
  focus?: string;
  areas?: string[];
  people?: string[];
  timeWindow?: string;
  obstacles?: string[];
};

export function profileContext(profile: Profile | null | undefined): ProfileContext | null {
  if (!profile) return null;
  const t = flowType(profile.answers);
  const plate = profile.plate;
  const ctx: ProfileContext = {};
  if (t) {
    ctx.type = t.name as ProfileContext["type"];
    ctx.typeLine = t.line;
  }
  if (profile.focus) ctx.focus = profile.focus.slice(0, 120);
  if (plate?.areas?.length) ctx.areas = plate.areas.slice(0, 8);
  if (plate?.people?.length) ctx.people = plate.people.slice(0, 8);
  if (plate?.timeWindow) ctx.timeWindow = plate.timeWindow;
  if (plate?.obstacles?.length) ctx.obstacles = plate.obstacles.slice(0, 5);
  return Object.keys(ctx).length ? ctx : null;
}

/** Plain-text context for the on-device prompt. */
export function contextText(ctx: ProfileContext | null): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.type) lines.push(`Working type: ${ctx.type}. ${ctx.typeLine ?? ""}`.trim());
  if (ctx.focus) lines.push(`Current focus: ${ctx.focus}`);
  if (ctx.areas) lines.push(`On their plate: ${ctx.areas.join(", ")}`);
  if (ctx.people) lines.push(`People around them: ${ctx.people.join(", ")}`);
  if (ctx.timeWindow) lines.push(`Usual free time: ${ctx.timeWindow}`);
  if (ctx.obstacles) lines.push(`What usually gets in the way: ${ctx.obstacles.join(", ")}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- cloud contract v1

export const CLOUD_PATH = "/v1/shape";
export const CLOUD_TIMEOUT_MS = 30000;
export const CLOUD_MAX_TEXT = 22000;

/** POST {EXPO_PUBLIC_SHAPE_URL}/v1/shape. Text only: audio is never sent. */
export type CloudShapeRequest = {
  version: 1;
  text: string;
  locale: string;
  profile: ProfileContext | null;
  tier: "free";
};
export type CloudErrorCode =
  | "quota_exceeded"
  | "unauthorized"
  | "invalid_input"
  | "too_long"
  | "rate_limited"
  | "unavailable";
export type CloudShapeResponse =
  | { version: 1; shape: Shape; quota?: { limit: number; used: number; resetsAt: string } }
  | { error: { code: CloudErrorCode; message: string } };

export function cloudRequest(text: string, locale: string, profile: ProfileContext | null): CloudShapeRequest {
  if (!text.trim()) throw new Error("cloud: empty text");
  if (text.length > CLOUD_MAX_TEXT) throw new Error("cloud: text too long");
  return { version: 1, text, locale, profile, tier: "free" };
}

export class CloudError extends Error {
  code: CloudErrorCode | "timeout" | "network" | "bad_response";
  constructor(code: CloudError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Interpret an HTTP status + JSON body from the cloud shaper. */
export function readCloudResponse(status: number, body: unknown): Shape {
  const b = (body ?? {}) as Record<string, unknown>;
  if (status < 200 || status >= 300) {
    const err = (b.error ?? {}) as { code?: string; message?: string };
    const code = (
      ["quota_exceeded", "unauthorized", "invalid_input", "too_long", "rate_limited", "unavailable"] as const
    ).find((c) => c === err.code) ?? (status === 429 ? "rate_limited" : "unavailable");
    throw new CloudError(code, err.message || `cloud status ${status}`);
  }
  if (b.version !== 1) throw new CloudError("bad_response", "cloud: unknown version");
  try {
    return parseShape(b.shape);
  } catch (e) {
    throw new CloudError("bad_response", (e as Error).message);
  }
}
