import http from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const execute = promisify(execFile);
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
export function createVoiceServer({ token, transcribe, log = console.log }) {
  if (!token || token.length < 32)
    throw Error(
      "A private testing token of at least 32 characters is required.",
    );
  let busy = false;
  const server = http.createServer(async (req, res) => {
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
    if (req.method !== "POST" || req.url !== "/process") {
      reply(404, { error: "Not found" });
      req.resume();
      return;
    }
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
      log(JSON.stringify({ id, stage: "transcribing", bytes }));
      const text = (await transcribe(Buffer.concat(chunks)))
        .replace(/\[(?:BLANK_AUDIO|silence|music)\]/gi, "")
        .trim();
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
      reply(200, { text, engine: "whisper.cpp/base" });
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
  const server = createVoiceServer({
    token: process.env.FLOW_PROCESSOR_TOKEN,
    transcribe: (bytes) => transcribeAudio(bytes, config),
  });
  server.listen(
    Number(process.env.FLOW_PROCESSOR_PORT || 8084),
    process.env.FLOW_PROCESSOR_HOST || "127.0.0.1",
    () => console.log("Flow local voice processor ready"),
  );
}
