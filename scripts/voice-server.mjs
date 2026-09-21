import http from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const execute = promisify(execFile);

/** The intake, planned by Claude when FLOW_ANTHROPIC_KEY is set (the on-device shaper is the fallback). Same tool contract as the worker. */
/**
 * The brain through a Claude subscription, no API credits: Claude Code's headless mode
 * (`claude -p`) on this machine, logged in once with `claude` → /login. The instructions
 * are the same contract; the answer is asked for as one JSON object shaped like the tool.
 */
export async function askClaudeCode(text, context, { model = "claude-sonnet-4-5", instructions, tool, bin = "claude", timeoutMs = 120000 }) {
  const { spawn } = await import("node:child_process");
  const schema = JSON.stringify(tool.input_schema);
  const system = instructions + "\n\nAnswer with ONE JSON object only, no prose, no code fence, matching this JSON schema exactly:\n" + schema;
  const prompt = (context ? context.slice(0, 6000) + "\n\n" : "") + (tool.name === "flow_chat" ? "PERSON'S NEW MESSAGE:\n" : "PERSON'S WORDS:\n") + text;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-p", "--output-format", "json", "--model", model, "--system-prompt", system, "--tools", "", "--no-session-persistence"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("claude code timed out")); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out);
        if (res.is_error) return reject(new Error(String(res.result || "claude code error")));
        const body = String(res.result ?? "");
        const m = body.match(/\{[\s\S]*\}/);
        if (!m) return reject(new Error("no json in answer"));
        resolve(JSON.parse(m[0]));
      } catch (e) {
        reject(new Error(`claude code (${code}): ${(err || out).slice(0, 200)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

/** The chat inside a thread, by Claude. Same tool contract as the worker's /v1/chat. */
export async function chatWithClaude(text, context, { key, model = "claude-sonnet-5", fetchImpl = fetch, instructions, tool }) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: instructions,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: (context ? context.slice(0, 6000) + "\n\n" : "") + "PERSON'S NEW MESSAGE:\n" + text }],
    }),
  });
  if (!res.ok) throw new Error("anthropic " + res.status);
  const data = await res.json();
  const call = (data.content ?? []).find((c) => c.type === "tool_use" && c.name === tool.name);
  if (!call) throw new Error("no tool call");
  return call.input;
}

export async function planWithClaude(text, context, { key, model = "claude-sonnet-5", fetchImpl = fetch, instructions, tool }) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1600,
      temperature: 0,
      system: instructions,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: (context ? context.slice(0, 4000) + "\n\n" : "") + "PERSON'S WORDS:\n" + text }],
    }),
  });
  if (!res.ok) throw new Error("anthropic " + res.status);
  const data = await res.json();
  const call = (data.content ?? []).find((c) => c.type === "tool_use" && c.name === tool.name);
  if (!call) throw new Error("no tool call");
  return call.input;
}

/** Dev only: keep every intake as a fixture so real dumps become replayable tests. */
export async function keepFixture(dir, kind, payload) {
  if (!dir) return;
  try {
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(dir, `${stamp}-${kind}.json`), JSON.stringify(payload, null, 2));
  } catch {
    /* fixtures are best effort */
  }
}
const MAX_BYTES = 32 * 1024 * 1024;
export async function transcribeAudio(bytes, config) {
  await mkdir(config.temp, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(join(config.temp, "voice-"));
  try {
    const input = join(folder, "input.audio"),
      wav = join(folder, "audio.wav"),
      output = join(folder, "transcript");
    await writeFile(input, bytes, { mode: 0o600 });
    await execute(
      config.ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-t",
        "600",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wav,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    await execute(
      config.whisper,
      [
        "-m",
        config.model,
        "-f",
        wav,
        "-l",
        "auto",
        "-t",
        "4",
        "-otxt",
        "-of",
        output,
        "-np",
        "-nt",
      ],
      { timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
    );
    return (await readFile(output + ".txt", "utf8")).trim();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
export function shapeText(text, binary, context = "", mode = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "",
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Organizer timed out"));
    }, 160000);
    child.stdout.on("data", (data) => {
      output += data;
      if (output.length > 100000) {
        child.kill("SIGKILL");
        finish(new Error("Organizer response too large"));
      }
    });
    child.stderr.resume();
    child.on("error", (error) => finish(error));
    child.stdin.on("error", (error) => finish(error));
    child.on("close", (code) => {
      try {
        if (code !== 0) throw Error("Organizer unavailable");
        finish(null, JSON.parse(output));
      } catch (error) {
        finish(error);
      }
    });
    child.stdin.end(context || mode ? JSON.stringify({ text, context, ...(mode ? { mode } : {}) }) : text);
  });
}
export function createVoiceServer({
  token,
  transcribe,
  shape,
  plan,
  chat,
  webOrigin,
  fixturesDir,
  config = { temp: "/tmp" },
  log = console.log,
}) {
  if (!token || token.length < 32)
    throw Error(
      "A private testing token of at least 32 characters is required.",
    );
  let busy = false;
  const server = http.createServer(async (req, res) => {
    if (webOrigin && req.headers.origin === webOrigin) {
      res.setHeader("Access-Control-Allow-Origin", webOrigin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS" && req.url === "/process") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        });
        res.end();
        return;
      }
    }
    const reply = (status, payload) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(payload));
    };
    const supplied = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from("Bearer " + token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      reply(401, {
        error: "This testing app is not paired with the processor.",
      });
      req.resume();
      return;
    }
    // Dev: hand a phone's mirrored data back, so any device (the simulator) can test on the owner's real recordings.
    if (req.method === "GET" && req.url.startsWith("/mirror/")) {
      const install = decodeURIComponent(req.url.slice(8)).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
      try {
        const body = await readFile(join(fixturesDir || config.temp, "mirror", `${install}.json`), "utf8");
        const snap = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snap.data ?? snap));
      } catch {
        reply(404, { error: "No mirror for that install." });
      }
      return;
    }
    if (req.method !== "POST" || (req.url !== "/process" && req.url !== "/plan" && req.url !== "/chat" && req.url !== "/mirror")) {
      reply(404, { error: "Not found" });
      req.resume();
      return;
    }
    if (req.url === "/mirror") {
      // Dev only: the phone's whole data set, kept as the latest snapshot per install plus a history.
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) {
          reply(413, { error: "Mirror too large." });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      }
      try {
        const snapshot = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const install = String(snapshot.install ?? "unknown").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || "unknown";
        const dir = join(fixturesDir || config.temp, "mirror");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${install}.json`), JSON.stringify(snapshot, null, 2));
        await writeFile(join(dir, `${install}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(snapshot));
        log(JSON.stringify({ stage: "mirror", install, build: snapshot.build, reason: snapshot.reason, threads: snapshot.data?.threads?.length, records: snapshot.data?.records?.length }));
        reply(200, { ok: true });
      } catch {
        reply(400, { error: "Bad mirror payload." });
      }
      return;
    }
    const wantPlan = req.url === "/plan";
    const wantChat = req.url === "/chat";
    if (busy) {
      reply(503, {
        error:
          "The Mac mini is processing another recording. Your audio is saved; retry shortly.",
      });
      req.resume();
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > MAX_BYTES) {
      reply(413, { error: "Recording exceeds the 32 MB testing limit." });
      req.resume();
      return;
    }
    busy = true;
    const id = randomUUID();
    const started = Date.now();
    let bytes = 0;
    try {
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          reply(413, { error: "Recording exceeds the 32 MB testing limit." });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      }
      if (!bytes) {
        reply(400, { error: "The recording is empty." });
        return;
      }
      const isText =
        req.headers["content-type"]?.startsWith("application/json");
      let text;
      let context = "";
      if (isText) {
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          reply(400, { error: "The thought could not be read." });
          return;
        }
        if (
          typeof input.text !== "string" ||
          !input.text.trim() ||
          input.text.length > 20000
        ) {
          reply(400, { error: "Use a thought of 1–20,000 characters." });
          return;
        }
        text = input.text.trim();
        // The thread so far, when the text continues a thread; never logged.
        if (typeof input.context === "string" && input.context.length <= 8000) context = input.context;
        if (wantChat) {
          let chatOut = null, via = "apple-local";
          if (chat) {
            try {
              chatOut = await chat(text, context);
              via = "claude";
            } catch (e) {
              log(JSON.stringify({ id, stage: "claude-chat-unavailable", detail: String(e?.message ?? e) }));
            }
          }
          if (!chatOut && shape) {
            try {
              chatOut = await shape(text, context, "chat");
            } catch {
              log(JSON.stringify({ id, stage: "chat-unavailable" }));
            }
          }
          if (!chatOut) {
            reply(503, { error: "The assistant is unavailable." });
            return;
          }
          await keepFixture(fixturesDir, "chat", { at: new Date().toISOString(), text, context, via, chat: chatOut });
          reply(200, { chat: chatOut, via });
          log(JSON.stringify({ id, stage: "complete", elapsedMs: Date.now() - started, via }));
          return;
        }
      } else {
        log(JSON.stringify({ id, stage: "transcribing", bytes }));
        text = (await transcribe(Buffer.concat(chunks)))
          .replace(/\[(?:BLANK_AUDIO|silence|music)\]/gi, "")
          .trim();
      }
      if (!text) {
        reply(422, {
          error:
            "No clear speech was detected. Your audio is saved and can be played or retried.",
        });
        return;
      }
      if (text.length > 20000) {
        reply(422, {
          error:
            "Transcript is too long for one draft. Your original audio is saved.",
        });
        return;
      }
      let organization;
      let planner = "apple-local";
      if (wantPlan && plan) {
        try {
          log(JSON.stringify({ id, stage: "planning", via: "claude" }));
          organization = await plan(text, context);
          planner = "claude";
        } catch (e) {
          log(JSON.stringify({ id, stage: "claude-unavailable", detail: String(e?.message ?? e) }));
        }
      }
      if (!organization && shape) {
        try {
          log(JSON.stringify({ id, stage: wantPlan ? "planning" : "organizing" }));
          organization = await shape(text, context, wantPlan ? "plan" : "");
        } catch {
          log(JSON.stringify({ id, stage: "organizer-unavailable" }));
        }
      }
      if (wantPlan) {
        if (!organization) {
          reply(503, { error: "The planner is unavailable." });
          return;
        }
        await keepFixture(fixturesDir, "plan", { at: new Date().toISOString(), text, context, planner, plan: organization });
        reply(200, { plan: organization, planner });
        log(JSON.stringify({ id, stage: "complete", elapsedMs: Date.now() - started, planner }));
        return;
      }
      await keepFixture(fixturesDir, "shape", { at: new Date().toISOString(), text, context, shape: organization });
      reply(200, {
        text,
        shape: organization,
        engine: isText ? "apple-foundation-models" : "whisper.cpp/base",
        organizer: organization ? "apple-local" : "unavailable",
      });
      log(
        JSON.stringify({
          id,
          stage: "complete",
          elapsedMs: Date.now() - started,
        }),
      );
    } catch {
      log(
        JSON.stringify({
          id,
          stage: "failed",
          elapsedMs: Date.now() - started,
        }),
      );
      if (!res.headersSent)
        reply(503, {
          error:
            "The Mac mini could not transcribe this recording. Your audio is saved; retry processing.",
        });
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 240000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = {
    model: process.env.FLOW_WHISPER_MODEL,
    temp: process.env.FLOW_PROCESSING_TMP,
    ffmpeg: process.env.FLOW_FFMPEG || "/opt/homebrew/bin/ffmpeg",
    whisper: process.env.FLOW_WHISPER || "/opt/homebrew/bin/whisper-cli",
  };
  if (!config.model || !config.temp)
    throw Error("Set FLOW_WHISPER_MODEL and FLOW_PROCESSING_TMP.");
  const key = process.env.FLOW_ANTHROPIC_KEY;
  // FLOW_CLAUDE_CODE=1: the brain through the Claude subscription on this Mac (claude -p), no API key.
  const viaCode = process.env.FLOW_CLAUDE_CODE === "1";
  const contract = key || viaCode ? await import("./plan-contract.mjs") : null;
  const codeModel = process.env.FLOW_PLAN_MODEL || "claude-sonnet-4-5";
  const server = createVoiceServer({
    token: process.env.FLOW_PROCESSOR_TOKEN,
    webOrigin: process.env.FLOW_PROCESSOR_WEB_ORIGIN,
    fixturesDir: process.env.FLOW_FIXTURES_DIR,
    config,
    transcribe: (bytes) => transcribeAudio(bytes, config),
    shape: process.env.FLOW_SHAPER_BIN
      ? (text, context, mode) => shapeText(text, process.env.FLOW_SHAPER_BIN, context, mode)
      : undefined,
    plan: key && contract ? (text, context) => planWithClaude(text, context, { key, model: process.env.FLOW_PLAN_MODEL, instructions: contract.PLAN_INSTRUCTIONS, tool: contract.PLAN_TOOL })
      : viaCode && contract ? (text, context) => askClaudeCode(text, context, { model: codeModel, instructions: contract.PLAN_INSTRUCTIONS, tool: contract.PLAN_TOOL, bin: process.env.FLOW_CLAUDE_BIN || "claude" })
      : undefined,
    chat: key && contract ? (text, context) => chatWithClaude(text, context, { key, model: process.env.FLOW_PLAN_MODEL, instructions: contract.CHAT_INSTRUCTIONS, tool: contract.CHAT_TOOL })
      : viaCode && contract ? (text, context) => askClaudeCode(text, context, { model: codeModel, instructions: contract.CHAT_INSTRUCTIONS, tool: contract.CHAT_TOOL, bin: process.env.FLOW_CLAUDE_BIN || "claude" })
      : undefined,
  });
  if (key) console.log("Flow planner: Claude " + (process.env.FLOW_PLAN_MODEL || "claude-sonnet-5"));
  else if (viaCode) console.log("Flow planner: Claude Code (subscription) " + codeModel);
  if (process.env.FLOW_FIXTURES_DIR) console.log("Flow fixtures: " + process.env.FLOW_FIXTURES_DIR);
  server.listen(
    Number(process.env.FLOW_PROCESSOR_PORT || 8084),
    process.env.FLOW_PROCESSOR_HOST || "127.0.0.1",
    () => console.log("Flow local voice processor ready"),
  );
}
