import { afterEach, describe, expect, it, vi } from "vitest";
import { handle, type Env } from "../src/index";
import { monthKey } from "../src/limits";

const SHAPE = {
  title: "Contact Alex", summary: "contact Alex about a free project", reply: "Alex, got it.", question: "",
  points: [{ id: "people", evidence: "contact Alex" }],
  choices: [{ label: "Contact Alex", action: "Ask Alex about a project", smallAction: "Open Alex's contact", evidence: "contact Alex", reason: "A start." }],
};
const anthropicOk = () =>
  new Response(JSON.stringify({ content: [{ type: "tool_use", name: "submit_shape", input: SHAPE }] }), { status: 200 });

function kv() {
  const m = new Map<string, string>();
  return { m, get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}
const mkEnv = (over: Partial<Env> = {}): Env & { store: ReturnType<typeof kv> } => {
  const store = kv();
  return { ANTHROPIC_API_KEY: "test", QUOTA: store, store, ...over } as Env & { store: ReturnType<typeof kv> };
};
const NOW = new Date("2026-09-19T10:00:00Z");
const ID = "11111111-2222-3333-4444-555555555555";
const req = (body: unknown, headers: Record<string, string> = { "X-Flow-Install": ID }) =>
  new Request("https://x/v1/shape", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const valid = { version: 1, text: "I should contact Alex about a free project", locale: "en-US", tier: "free", profile: null };
const code = async (r: Response) => ((await r.json()) as any).error?.code;

afterEach(() => vi.unstubAllGlobals());

describe("shape worker", () => {
  it("returns a valid shape and quota, without leaking the key or text into KV", async () => {
    const fetchMock = vi.fn(async () => anthropicOk());
    vi.stubGlobal("fetch", fetchMock);
    const env = mkEnv();
    const res = await handle(req(valid), env, NOW);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.version).toBe(1);
    expect(body.shape.title).toBe("Contact Alex");
    expect(body.quota).toEqual({ limit: 20, used: 1, resetsAt: "2026-10-01T00:00:00.000Z" });
    const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(sent.model).toBe("claude-haiku-4-5");
    expect(JSON.stringify([...env.store.m])).not.toMatch(/Alex|test/);
  });

  it("uses MODEL from config", async () => {
    const fetchMock = vi.fn(async () => anthropicOk());
    vi.stubGlobal("fetch", fetchMock);
    await handle(req(valid), mkEnv({ MODEL: "claude-sonnet-5" }), NOW);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).model).toBe("claude-sonnet-5");
  });

  it("validates the schema", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await code(await handle(req({ ...valid, version: 2 }), mkEnv(), NOW))).toBe("invalid_input");
    expect(await code(await handle(req("not json"), mkEnv(), NOW))).toBe("invalid_input");
    expect(await code(await handle(req({ ...valid, text: "  " }), mkEnv(), NOW))).toBe("invalid_input");
    expect(await code(await handle(req({ ...valid, profile: { type: "Wizard" } }), mkEnv(), NOW))).toBe("invalid_input");
    expect(await code(await handle(req(valid, {}), mkEnv(), NOW))).toBe("unauthorized");
    const long = await handle(req({ ...valid, text: "a".repeat(22001) }), mkEnv(), NOW);
    expect(long.status).toBe(413);
    expect(await code(long)).toBe("too_long");
  });

  it("enforces the monthly per-install quota and resets next month", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicOk()));
    const env = mkEnv({ FREE_MONTHLY_QUOTA: "2" });
    expect((await handle(req(valid), env, NOW)).status).toBe(200);
    expect((await handle(req(valid), env, NOW)).status).toBe(200);
    const third = await handle(req(valid), env, NOW);
    expect(await code(third)).toBe("quota_exceeded");
    expect(env.store.m.get(`${monthKey(NOW)}:${ID}`)).toBe("2");
    expect((await handle(req(valid), env, new Date("2026-10-01T00:00:01Z"))).status).toBe(200);
    // a different install is unaffected
    expect((await handle(req(valid, { "X-Flow-Install": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), env, NOW)).status).toBe(200);
  });

  it("rate limits per IP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicOk()));
    const env = mkEnv({ IP_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await handle(req(valid), env, NOW);
    expect(res.status).toBe(429);
    expect(await code(res)).toBe("rate_limited");
  });

  it("stops everyone at the global daily cap", async () => {
    const fetchMock = vi.fn(async () => anthropicOk());
    vi.stubGlobal("fetch", fetchMock);
    const env = mkEnv({ GLOBAL_DAILY_CAP: "1" });
    expect((await handle(req(valid), env, NOW)).status).toBe(200);
    const res = await handle(req(valid, { "X-Flow-Install": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), env, NOW);
    expect(await code(res)).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // next day starts fresh
    expect((await handle(req(valid), env, new Date("2026-09-20T00:00:01Z"))).status).toBe(200);
  });

  it("maps Anthropic failures and bad output to unavailable without using quota", async () => {
    const env = mkEnv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await code(await handle(req(valid), env, NOW))).toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "hi" }] }), { status: 200 })));
    expect(await code(await handle(req(valid), env, NOW))).toBe("unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await code(await handle(req(valid), env, NOW))).toBe("unavailable");
    expect(env.store.m.get(`${monthKey(NOW)}:${ID}`)).toBeUndefined();
  });

  it("rejects wrong paths and methods", async () => {
    expect((await handle(new Request("https://x/other", { method: "POST" }), mkEnv(), NOW)).status).toBe(404);
    expect((await handle(new Request("https://x/v1/shape"), mkEnv(), NOW)).status).toBe(400);
  });
});
