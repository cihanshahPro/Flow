import { ZodError } from "zod";
import { INSTRUCTIONS, buildUserPrompt } from "./prompt";
import { SHAPE_TOOL, requestSchema, shapeSchema, type Shape } from "./schema";
import { installUsed, nextMonthStart, recordInstallUse, takeGlobal, type KV } from "./limits";

export interface Env {
  ANTHROPIC_API_KEY: string;
  QUOTA: KV;
  IP_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  MODEL?: string;
  FREE_MONTHLY_QUOTA?: string;
  GLOBAL_DAILY_CAP?: string;
  MAX_TEXT_CHARS?: string;
}

type Code = "quota_exceeded" | "unauthorized" | "invalid_input" | "too_long" | "rate_limited" | "unavailable";
const STATUS: Record<Code, number> = {
  quota_exceeded: 402, unauthorized: 401, invalid_input: 400, too_long: 413, rate_limited: 429, unavailable: 503,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (code: Code, message: string) => json({ error: { code, message } }, STATUS[code]);
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const UUID = /^[0-9a-zA-Z-]{16,64}$/;

export function extractShape(data: unknown): Shape {
  const content = ((data ?? {}) as { content?: { type: string; name?: string; input?: unknown }[] }).content ?? [];
  const tool = content.find((c) => c.type === "tool_use" && c.name === SHAPE_TOOL.name);
  return shapeSchema.parse(tool?.input);
}

async function callAnthropic(env: Env, text: string, context: string, thread = ""): Promise<Shape> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: env.MODEL || "claude-haiku-4-5",
      max_tokens: 1200,
      temperature: 0,
      system: INSTRUCTIONS,
      tools: [SHAPE_TOOL],
      tool_choice: { type: "tool", name: SHAPE_TOOL.name },
      messages: [{ role: "user", content: buildUserPrompt(text, context, thread) }],
    }),
  });
  if (!res.ok) {
    console.error("anthropic status", res.status); // status only, never content
    throw new Error("upstream " + res.status);
  }
  return extractShape(await res.json());
}

function threadText(t: NonNullable<ReturnType<typeof requestSchema.parse>["thread"]>): string {
  const lines: string[] = [];
  if (t.title.trim()) lines.push(`THREAD SO FAR — title: ${t.title}`);
  if (t.points.length) lines.push("Known: " + t.points.map((p) => `${p.id}: "${p.evidence.slice(0, 120)}"`).join("; "));
  if (t.recent.length) {
    lines.push("Recent turns:");
    for (const m of t.recent) lines.push(`${m.from === "you" ? "Person" : "Flow"}: ${m.text.slice(0, 300)}`);
  }
  if (t.openQuestion) lines.push(`Flow's open question (the person is answering it): ${t.openQuestion}`);
  if (t.openMove) lines.push(`Move on the table, waiting for yes or no: ${t.openMove}`);
  if (typeof t.percent === "number") lines.push(`Understood so far: ${t.percent}%${t.percent >= 100 ? " — Flow gets it; help is allowed now" : " — no advice, no moves yet"}`);
  if (t.askNext) lines.push(`The app will ask next, after your reply: "${t.askNext}". Do not ask it yourself; do not ask anything else.`);
  if (t.script) lines.push(t.script);
  if (t.otherThreads?.length) lines.push("Person's other open threads: " + t.otherThreads.join(" | "));
  return lines.join("\n");
}

function contextText(p: NonNullable<ReturnType<typeof requestSchema.parse>["profile"]>): string {
  const l: string[] = [];
  if (p.type) l.push(`Working type: ${p.type}. ${p.typeLine ?? ""}`.trim());
  if (p.focus) l.push(`Current focus: ${p.focus}`);
  if (p.areas?.length) l.push(`On their plate: ${p.areas.join(", ")}`);
  if (p.people?.length) l.push(`People around them: ${p.people.join(", ")}`);
  if (p.timeWindow) l.push(`Usual free time: ${p.timeWindow}`);
  if (p.obstacles?.length) l.push(`What usually gets in the way: ${p.obstacles.join(", ")}`);
  return l.join("\n");
}

export async function handle(request: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/shape") return json({ error: { code: "invalid_input", message: "Not found" } }, 404);
  if (request.method !== "POST") return fail("invalid_input", "POST only");

  const install = request.headers.get("X-Flow-Install") ?? "";
  if (!UUID.test(install)) return fail("unauthorized", "Missing install id");

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.IP_LIMITER && !(await env.IP_LIMITER.limit({ key: ip })).success)
    return fail("rate_limited", "Too many requests, try again in a minute");

  const raw = await request.text();
  const maxText = num(env.MAX_TEXT_CHARS, 22000);
  if (raw.length > maxText * 2 + 5000) return fail("too_long", "This note is too long");
  let body;
  try {
    body = requestSchema.parse(JSON.parse(raw));
  } catch (e) {
    return fail("invalid_input", e instanceof ZodError ? "Invalid request" : "Invalid JSON");
  }
  const text = body.text.trim();
  if (!text) return fail("invalid_input", "Empty text");
  if (text.length > maxText) return fail("too_long", "This note is too long");

  const limit = num(env.FREE_MONTHLY_QUOTA, 20);
  const used = await installUsed(env.QUOTA, install, now);
  const resetsAt = nextMonthStart(now);
  if (used >= limit) return fail("quota_exceeded", "Monthly free limit reached");

  // The global cap protects the bill: once hit, every client falls back to the template.
  if (!(await takeGlobal(env.QUOTA, now, num(env.GLOBAL_DAILY_CAP, 400)))) return fail("unavailable", "Busy, try later");

  let shape: Shape;
  try {
    shape = await callAnthropic(env, text, body.profile ? contextText(body.profile) : "", body.thread ? threadText(body.thread) : "");
  } catch {
    return fail("unavailable", "Could not shape this note"); // failures do not count against the quota
  }
  await recordInstallUse(env.QUOTA, install, now, used);
  return json({ version: 1, shape, quota: { limit, used: used + 1, resetsAt } });
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
