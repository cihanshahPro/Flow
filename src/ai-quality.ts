/**
 * Output quality for AI-shaped choices and timing for the shaping call.
 * Pure logic (no native or storage imports) so it is unit-testable.
 */

/** Words that mark an empty or evasive option. */
export const FORBIDDEN_OPTION_WORDS = ["skip", "none", "n/a", "na", "other", "nothing"] as const;

/** Flow waits this long for a shaper before it falls back to the template draft. */
export const SHAPE_TIMEOUT_MS = 30_000;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9/]+/).filter(Boolean);

export function hasForbiddenWord(text: string): boolean {
  const t = tokens(text);
  return FORBIDDEN_OPTION_WORDS.some((w) => t.includes(w));
}

/** A branch label is concrete when it is 2–6 words and holds no forbidden word. */
export function isConcreteLabel(label: string): boolean {
  const n = words(label).length;
  return n >= 2 && n <= 6 && !hasForbiddenWord(label);
}

/** The full action needs at least a verb and an object, and no forbidden word. */
export function isConcreteAction(action: string): boolean {
  return words(action).length >= 2 && !hasForbiddenWord(action);
}

/** "<time>: <verb + object>", at most 60 characters. */
export function isMoveHeadline(headline: string): boolean {
  if (headline.length > 60) return false;
  const m = /^([^:]{2,24}): (.+)$/.exec(headline);
  return !!m && words(m[2]).length >= 2 && !hasForbiddenWord(m[2]);
}

/** Keep the valid options; when fewer than `min` survive, top up from the template ones (no repeats). */
export function completeOptions<T extends { title: string }>(valid: T[], template: T[], min = 2, max = 3): T[] {
  const out = [...valid];
  const seen = new Set(out.map((o) => o.title.toLowerCase()));
  for (const t of template) {
    if (out.length >= Math.min(min, max)) break;
    if (seen.has(t.title.toLowerCase())) continue;
    seen.add(t.title.toLowerCase());
    out.push(t);
  }
  return out;
}

export class ShapeTimeout extends Error {
  constructor() {
    super("timeout");
  }
}
export class ShapeCancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Rejects with ShapeTimeout after `ms`, or ShapeCancelled when the signal aborts. Timers are always cleared. */
export function raceShape<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(new ShapeCancelled());
    const onAbort = () => finish(() => reject(new ShapeCancelled()));
    const timer = setTimeout(() => finish(() => reject(new ShapeTimeout())), ms);
    function finish(fn: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    }
    signal?.addEventListener("abort", onAbort);
    work.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}
