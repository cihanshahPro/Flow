import type {
  DraftStep,
  DueHint,
  ThoughtDraft,
  ThreadMessage,
  ThreadPoint,
  ThreadStage,
} from "./drafts.ts";
import type { Task } from "./model.ts";
import { localDate } from "./model.ts";
import { QUESTION_ORDER, voice, type Mode, DEFAULT_MODE } from "./flow-voice.ts";

/**
 * A thread is one conversation between the user and Flow about one subject.
 * The user only ever records or taps one of two chips; Flow does the rest.
 * Everything here is pure so it can be tested without a device.
 */

export type PointId =
  | "outcome"
  | "people"
  | "timing"
  | "constraints"
  | "motivation"
  | "dependencies"
  | "next";

export const POINTS: { id: PointId; label: string; question: string }[] = [
  { id: "outcome", label: "Outcome", question: "What result would make this feel resolved?" },
  { id: "people", label: "People", question: "Who else is involved, if anyone?" },
  { id: "timing", label: "Timing", question: "Is there a real date or time attached to this?" },
  { id: "constraints", label: "Constraints", question: "What could block this, or what should Flow keep in mind?" },
  { id: "motivation", label: "Why it matters", question: "Why does this matter to you right now?" },
  { id: "dependencies", label: "Depends on", question: "Does anything need to happen first?" },
  { id: "next", label: "Next context", question: "What's the very first thing you'd do on this?" },
];

/** A thread is ready for moves once this many points are known, including the outcome. */
export const READY_KNOWN = 5;
export const TOTAL_POINTS = POINTS.length;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const detectors: Record<PointId, RegExp> = {
  outcome:
    /\b(want|wants|need|needs|goal|build|make|finish|complete|resolve|apply|deal with|figure out|follow up|schedule|create|start|stop|get (?:it |this |that )?done|sort out|fix|launch|sell|buy|book|move|land|ship|pay|clean|organi[sz]e)\b/i,
  timing:
    /\b(today|tomorrow|tonight|this morning|this afternoon|this evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|next month|this weekend|deadline|due\b|by (?:the )?(?:end of|\d)|\d{1,2}[/.-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}|\b20\d{2}\b|\d{1,2}(?::\d{2})? ?(?:am|pm))\b/i,
  people:
    /\b(i alone|just me|no one else|nobody else|my (?:lawyer|doctor|dentist|friend|partner|client|clients|brother|sister|mom|mum|dad|parents|boss|team|manager|accountant|wife|husband|girlfriend|boyfriend|landlord|neighbou?r|kids?|son|daughter|coach|therapist|colleague|roommate)|with [A-Z][a-z]+|[A-Z][a-z]+ and I\b|(?:call|email|text|ask|tell|meet|see) [A-Z][a-z]+)\b/,
  constraints:
    /\b(because|but|can'?t|cannot|won'?t|couldn'?t|waiting|budget|money|expensive|cheap|deadline|blocked|depends|unless|limited|only if|as long as|not allowed|no time|too busy|strict)\b/i,
  motivation:
    /\b(so that|matters|important|otherwise|penalty|worried|afraid|scared|excited|tired of|sick of|dream|the point is|i feel|feels|stress(?:ed|ful)?|anxious|proud|relief|relieved|love|hate|for my|for the kids|for us)\b/i,
  dependencies:
    /\b(after|before|first|then|once|until|requires|depends on|waiting (?:for|on)|need(?:s)? to .{1,40} (?:before|first)|as soon as)\b/i,
  next:
    /\b(first step|first thing|next step|next i|start by|starting with|tonight i|tomorrow i|i'?ll|i will|going to|gonna|plan to|then i|i can just|i could just|step one)\b/i,
};

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clip(s: string, max = 140): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/** Detect which points the person's own words already answer; the evidence is their sentence. */
export function detectPoints(text: string): Partial<Record<PointId, string>> {
  const found: Partial<Record<PointId, string>> = {};
  const parts = sentences(text);
  for (const point of POINTS) {
    const hit = parts.find((s) => detectors[point.id].test(s));
    if (hit) found[point.id] = clip(hit);
  }
  return found;
}

/**
 * Merge new evidence into the existing fingerprint. Known points never go back
 * to missing; the first evidence for a point is kept so the thread's history
 * stays stable.
 */
export function fingerprint(
  text: string,
  prior: ThreadPoint[] = [],
  noteId?: string,
): ThreadPoint[] {
  const detected = detectPoints(text);
  return POINTS.map((point) => {
    const previous = prior.find((p) => p.id === point.id);
    if (previous?.state === "known") return previous;
    const evidence = detected[point.id];
    if (evidence)
      return {
        id: point.id,
        label: point.label,
        state: "known" as const,
        value: evidence,
        ...(noteId ? { sourceNoteIds: [noteId] } : {}),
      };
    return { id: point.id, label: point.label, state: "missing" as const, value: point.question };
  });
}

export function clarity(points: ThreadPoint[] | undefined): { known: number; total: number } {
  const known = (points ?? []).filter((p) => p.state === "known").length;
  return { known, total: TOTAL_POINTS };
}

export function isReady(points: ThreadPoint[] | undefined): boolean {
  const known = (points ?? []).filter((p) => p.state === "known");
  return known.length >= READY_KNOWN && known.some((p) => p.id === "outcome");
}

export function missingQuestions(points: ThreadPoint[] | undefined, mode: Mode): string[] {
  const missing = new Set((points ?? []).filter((p) => p.state !== "known").map((p) => p.id));
  return QUESTION_ORDER[mode]
    .filter((id) => missing.has(id))
    .map((id) => POINTS.find((p) => p.id === id)!.question);
}

export function nextMissingPoint(points: ThreadPoint[] | undefined, mode: Mode) {
  const missing = new Set((points ?? []).filter((p) => p.state !== "known").map((p) => p.id));
  const id = QUESTION_ORDER[mode].find((candidate) => missing.has(candidate as PointId));
  return id ? POINTS.find((p) => p.id === id)! : null;
}

/** Dates the person mentioned, resolved to calendar days so Flow can check in after them. */
export function extractDueHints(text: string, now = new Date()): DueHint[] {
  const hints = new Map<string, DueHint>();
  const day = (d: Date) => localDate(d);
  const add = (date: Date, phrase: string) => {
    const key = day(date);
    if (!hints.has(key)) hints.set(key, { date: key, phrase });
  };
  const lower = text.toLowerCase();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/.test(lower)) add(new Date(base.getTime() + 864e5), "tomorrow");
  if (/\b(tonight|today|this evening|this afternoon)\b/.test(lower)) add(base, "today");
  for (const [i, name] of WEEKDAYS.entries()) {
    const m = lower.match(new RegExp(`\\b(next |this )?${name}\\b`));
    if (!m) continue;
    let ahead = (i - base.getDay() + 7) % 7;
    if (ahead === 0) ahead = 7;
    if (m[1]?.trim() === "next" && ahead < 7) ahead += 7;
    add(new Date(base.getTime() + ahead * 864e5), m[0].trim());
  }
  if (/\bthis weekend\b/.test(lower)) {
    const ahead = (6 - base.getDay() + 7) % 7 || 7;
    add(new Date(base.getTime() + ahead * 864e5), "this weekend");
  }
  if (/\bnext week\b/.test(lower)) add(new Date(base.getTime() + 7 * 864e5), "next week");
  if (/\bend of (the )?month\b/.test(lower))
    add(new Date(base.getFullYear(), base.getMonth() + 1, 0), "end of the month");
  for (const m of lower.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/g)) {
    const month = MONTHS.indexOf(m[1]);
    const date = new Date(base.getFullYear(), month, Number(m[2]));
    if (date < base) date.setFullYear(date.getFullYear() + 1);
    add(date, m[0]);
  }
  for (const m of lower.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) {
    const month = Number(m[1]) - 1,
      d = Number(m[2]);
    if (month < 0 || month > 11 || d < 1 || d > 31) continue;
    const date = new Date(base.getFullYear(), month, d);
    if (date < base) date.setFullYear(date.getFullYear() + 1);
    add(date, m[0]);
  }
  return [...hints.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const STOP = new Set(
  "i me my mine we our us you your it its this that these those the a an and or but so because to of in on at for with from by as is are was were be been being have has had do does did not no yes if then than about into over just also very really can could would should will shall may might must there here what which who whom when where why how all any some more most other such only own same too s t don ve ll re d m".split(" "),
);
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/'s$/, ""))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Decide whether a new recording continues an open thread. It joins when it
 * shares enough of the thread's own vocabulary; otherwise it becomes a new one.
 */
export function routeRecording(
  text: string,
  threads: ThoughtDraft[],
  tasks: Task[] = [],
): string | null {
  const words = contentWords(text);
  if (words.size < 3) return null;
  let best: { id: string; score: number } | null = null;
  for (const thread of threads) {
    if (thread.example || thread.state === "parked") continue;
    if (stageFor(thread, tasks) === "done") continue;
    const theirs = contentWords([thread.title, thread.source, ...thread.updates].join(" "));
    let shared = 0;
    for (const w of words) if (theirs.has(w)) shared++;
    const score = shared / Math.min(words.size, Math.max(theirs.size, 1));
    if (shared >= 3 && score >= 0.34 && (!best || score > best.score))
      best = { id: thread.id, score };
  }
  return best?.id ?? null;
}

export function threadTasks(thread: ThoughtDraft, tasks: Task[]): Task[] {
  const prefix = `flow:${thread.id}:`;
  return tasks.filter((t) => t.id.startsWith(prefix));
}

export function stageFor(thread: ThoughtDraft, tasks: Task[]): ThreadStage {
  if (thread.state === "parked") return "parked";
  const mine = threadTasks(thread, tasks);
  if (mine.length && mine.every((t) => t.done)) return "done";
  if (mine.some((t) => !t.done)) return "moving";
  if (isReady(thread.threadPoints)) return "understood";
  return "dumped";
}

export const STAGE_LABEL: Record<ThreadStage, string> = {
  dumped: "Flow is working on this",
  understood: "Ready — Flow has moves",
  moving: "In motion",
  done: "Done",
  parked: "Parked",
};

/** The Flow message that still needs the user, if any. */
export function pendingMessage(thread: ThoughtDraft): ThreadMessage | null {
  const open = (thread.messages ?? []).filter(
    (m) => m.from === "flow" && !m.answered && ["question", "offer", "checkin", "stale"].includes(m.kind),
  );
  return open[open.length - 1] ?? null;
}

export function attentionLabel(thread: ThoughtDraft, tasks: Task[]): string {
  const pending = pendingMessage(thread);
  if (pending?.kind === "question") return "Flow has a question";
  if (pending?.kind === "offer") return "Flow has a move for you";
  if (pending?.kind === "checkin") return "Quick check-in";
  if (pending?.kind === "stale") return "Still on this?";
  return STAGE_LABEL[stageFor(thread, tasks)];
}

/** Moves Flow can offer: steps not yet accepted or declined, at most three. */
export function offerableSteps(thread: ThoughtDraft): DraftStep[] {
  const declined = new Set(thread.declinedStepIds ?? []);
  const offered = new Set(
    (thread.messages ?? []).filter((m) => m.kind === "offer" && !m.answered).map((m) => m.stepId),
  );
  return thread.steps.filter((s) => !s.accepted && !declined.has(s.id) && !offered.has(s.id)).slice(0, 3);
}

/**
 * A ready thread always has at least one move to offer. When the person's
 * words held no explicit action, the move is their own "next" or outcome
 * sentence, so nothing is invented.
 */
export function ensureMoves(thread: ThoughtDraft): ThoughtDraft {
  if (thread.steps.length) return thread;
  const points = thread.threadPoints ?? [];
  const seed =
    points.find((p) => p.id === "next" && p.state === "known")?.value ??
    points.find((p) => p.id === "outcome" && p.state === "known")?.value;
  if (!seed) return thread;
  const title = seed.replace(/[.!?…]+$/, "").replace(/^(first|then|next|tonight|tomorrow)\s+/i, "");
  return {
    ...thread,
    steps: [{ id: "auto-next", title: clip(title, 80), minutes: 15 }],
  };
}

function message(
  thread: ThoughtDraft,
  partial: Omit<ThreadMessage, "id" | "createdAt"> & { id?: string },
  now: string,
): ThreadMessage {
  const n = (thread.messages ?? []).length;
  return { id: partial.id ?? `${thread.id}:m${n}`, createdAt: now, ...partial };
}

function withMessages(thread: ThoughtDraft, added: ThreadMessage[]): ThoughtDraft {
  return added.length ? { ...thread, messages: [...(thread.messages ?? []), ...added] } : thread;
}

function offerMessage(thread: ThoughtDraft, step: DraftStep, now: string): ThreadMessage {
  return message(
    thread,
    {
      id: `${thread.id}:offer:${step.id}`,
      from: "flow",
      kind: "offer",
      stepId: step.id,
      text: step.title,
      chips: [
        { id: "do", label: "Do this" },
        { id: "skip", label: "Not now" },
      ],
    },
    now,
  );
}

/**
 * Flow's turn after a recording lands in this thread. `noteId` is the saved
 * recording; `text` is its transcript. The optional `reply` and `question`
 * come from the Mac mini shaper and win over templated wording.
 */
export function respondToRecording(
  thread: ThoughtDraft,
  noteId: string,
  text: string,
  options: { mode?: Mode; now?: Date; reply?: string; question?: string } = {},
): ThoughtDraft {
  const mode = options.mode ?? DEFAULT_MODE;
  const at = (options.now ?? new Date()).toISOString();
  if ((thread.messages ?? []).some((m) => m.kind === "transcript" && m.noteId === noteId))
    return thread;
  const previous = thread.messages ?? [];
  const isFirst = !previous.some((m) => m.kind === "transcript");
  const added: ThreadMessage[] = [];
  // The person's own words, kept verbatim.
  let next: ThoughtDraft = {
    ...thread,
    messages: previous.map((m) =>
      m.from === "flow" && !m.answered && m.kind === "question" ? { ...m, answered: noteId } : m,
    ),
  };
  const push = (m: Omit<ThreadMessage, "id" | "createdAt"> & { id?: string }) => {
    const built = message({ ...next, messages: [...(next.messages ?? []), ...added] }, m, at);
    added.push(built);
    return built;
  };
  push({ from: "you", kind: "transcript", text, noteId });
  const points = fingerprint(text, thread.threadPoints, noteId);
  const hints = extractDueHints(text, options.now);
  next = {
    ...next,
    threadPoints: points,
    missingPoints: missingQuestions(points, mode),
    goalsReady: isReady(points),
    threadStatus: isReady(points) ? "ready" : isFirst ? "dumped" : "understanding",
    dueHints: [...(thread.dueHints ?? []), ...hints.filter((h) => !(thread.dueHints ?? []).some((d) => d.date === h.date))],
  };
  push({
    from: "flow",
    kind: "ack",
    text: options.reply?.trim() || (isFirst ? voice.ack(mode, noteId) : voice.replyAck(mode, noteId)),
  });
  const hyped = new Set(thread.hypeGiven ?? []);
  if (isReady(points)) {
    next = ensureMoves(next);
    if (!hyped.has("ready")) {
      push({ from: "flow", kind: "hype", text: voice.fullPicture(mode) });
      hyped.add("ready");
    }
    const step = offerableSteps(next)[0];
    if (step) added.push(offerMessage(next, step, at));
    else if (!isFirst || !hyped.has("ready")) {
      const point = nextMissingPoint(points, mode);
      if (point) push({ from: "flow", kind: "question", pointId: point.id, text: options.question?.trim() || point.question });
    }
  } else {
    const point = nextMissingPoint(points, mode);
    if (point)
      push({ from: "flow", kind: "question", pointId: point.id, text: options.question?.trim() || point.question });
  }
  return { ...withMessages(next, added), hypeGiven: [...hyped] };
}

export type ChipEffect =
  | { type: "accept"; stepId: string }
  | { type: "complete"; taskId: string }
  | { type: "park" }
  | { type: "credit"; id: string };

/** The user tapped one of two chips. Returns the updated thread and what the app must do. */
export function answerChip(
  thread: ThoughtDraft,
  messageId: string,
  chipId: string,
  options: { mode?: Mode; now?: Date } = {},
): { thread: ThoughtDraft; effects: ChipEffect[] } {
  const mode = options.mode ?? DEFAULT_MODE;
  const at = (options.now ?? new Date()).toISOString();
  const target = (thread.messages ?? []).find((m) => m.id === messageId);
  if (!target || target.answered || !target.chips?.some((c) => c.id === chipId))
    return { thread, effects: [] };
  const label = target.chips.find((c) => c.id === chipId)!.label;
  let next: ThoughtDraft = {
    ...thread,
    messages: (thread.messages ?? []).map((m) => (m.id === messageId ? { ...m, answered: chipId } : m)),
  };
  const added: ThreadMessage[] = [];
  const push = (m: Omit<ThreadMessage, "id" | "createdAt"> & { id?: string }) => {
    added.push(message({ ...next, messages: [...(next.messages ?? []), ...added] }, m, at));
  };
  push({ from: "you", kind: "reply", text: label });
  const effects: ChipEffect[] = [];
  const hyped = new Set(thread.hypeGiven ?? []);
  if (target.kind === "offer" && target.stepId) {
    if (chipId === "do") {
      effects.push({ type: "accept", stepId: target.stepId });
      push({ from: "flow", kind: "ack", text: "On it. It's your Next card now — I'll check back after." });
    } else {
      next = { ...next, declinedStepIds: [...(thread.declinedStepIds ?? []), target.stepId] };
      const step = offerableSteps(next)[0];
      if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at));
      else push({ from: "flow", kind: "ack", text: "Fair. I'll hold this thread and bring it back when something changes." });
    }
  } else if (target.kind === "checkin") {
    if (chipId === "yes") {
      if (target.taskId) effects.push({ type: "complete", taskId: target.taskId });
      effects.push({ type: "credit", id: target.id });
      push({ from: "flow", kind: "hype", text: voice.done(mode, target.id) });
      const step = isReady(next.threadPoints) ? offerableSteps(next)[0] : undefined;
      if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at));
    } else {
      push({ from: "flow", kind: "ack", text: "No problem. I'll ask again later, not every hour." });
    }
  } else if (target.kind === "stale") {
    if (chipId === "park") {
      effects.push({ type: "park" });
      next = { ...next, state: "parked" };
      push({ from: "flow", kind: "ack", text: "Parked. It stays here; nothing is lost." });
    } else {
      push({ from: "flow", kind: "ack", text: voice.back(mode) });
      const point = nextMissingPoint(next.threadPoints, mode);
      const step = offerableSteps(next)[0];
      if (isReady(next.threadPoints) && step)
        added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at));
      else if (point) push({ from: "flow", kind: "question", pointId: point.id, text: point.question });
    }
  }
  return { thread: { ...withMessages(next, added), hypeGiven: [...hyped] }, effects };
}

/** Flow re-reads a thread on its own (on open, on foreground, on a timer) and adds check-ins. */
export function evaluateThread(
  thread: ThoughtDraft,
  tasks: Task[],
  options: { mode?: Mode; now?: Date } = {},
): ThoughtDraft {
  const mode = options.mode ?? DEFAULT_MODE;
  const now = options.now ?? new Date();
  const at = now.toISOString();
  const today = localDate(now);
  if (thread.example || thread.state === "parked") return thread;
  const messages = thread.messages ?? [];
  if (!messages.length) return thread;
  const stage = stageFor(thread, tasks);
  if (stage === "done") return thread;
  const existing = new Set(messages.map((m) => m.id));
  const added: ThreadMessage[] = [];
  const pending = pendingMessage(thread);
  // One open Flow message at a time. Never stack questions.
  if (!pending) {
    for (const task of threadTasks(thread, tasks)) {
      if (task.done || !task.plannedDate || task.plannedDate >= today) continue;
      const id = `${thread.id}:check:task:${task.id}`;
      if (existing.has(id)) continue;
      added.push({
        id,
        createdAt: at,
        from: "flow",
        kind: "checkin",
        taskId: task.id,
        text: `How did “${task.title}” go?`,
        chips: [
          { id: "yes", label: "Done 🎉" },
          { id: "no", label: "Not yet" },
        ],
      });
      break;
    }
  }
  if (!pending && !added.length) {
    for (const hint of thread.dueHints ?? []) {
      if (hint.date >= today) continue;
      const id = `${thread.id}:check:due:${hint.date}`;
      if (existing.has(id)) continue;
      added.push({
        id,
        createdAt: at,
        from: "flow",
        kind: "checkin",
        text: `It's past ${hint.phrase} — did that part happen?`,
        chips: [
          { id: "yes", label: "Yes 🎉" },
          { id: "no", label: "Not yet" },
        ],
      });
      break;
    }
  }
  if (!pending && !added.length) {
    const last = messages[messages.length - 1];
    const quietDays = (now.getTime() - new Date(last.createdAt).getTime()) / 864e5;
    const lastStale = [...messages].reverse().find((m) => m.kind === "stale");
    const staleDays = lastStale ? (now.getTime() - new Date(lastStale.createdAt).getTime()) / 864e5 : Infinity;
    if (quietDays >= 3 && staleDays >= 7) {
      added.push({
        id: `${thread.id}:stale:${today}`,
        createdAt: at,
        from: "flow",
        kind: "stale",
        text: voice.stillOnIt(mode),
        chips: [
          { id: "still", label: "Still on it" },
          { id: "park", label: "Park it" },
        ],
      });
    }
  }
  if (!added.length) return thread;
  return { ...withMessages(thread, added), lastEvaluatedAt: at };
}

/** People Flow has heard about across threads, for the Me screen. */
export function peopleMentioned(threads: ThoughtDraft[]): string[] {
  const names = new Map<string, number>();
  for (const t of threads) {
    const text = [t.source, ...t.updates].join(" ");
    for (const m of text.matchAll(/\b(?:[Ww]ith|[Cc]all|[Ee]mail|[Tt]ext|[Aa]sk|[Tt]ell|[Mm]eet|[Ss]ee|and) ([A-Z][a-z]{2,})\b/g)) {
      if (["Flow", "The", "Then", "And", "But", "When", "This", "That", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].includes(m[1])) continue;
      names.set(m[1], (names.get(m[1]) ?? 0) + 1);
    }
  }
  return [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 8);
}

/** Something that came up in more than one thread. Never becomes a task on its own. */
export function repeatedPattern(threads: ThoughtDraft[]): { title: string; count: number } | null {
  const counts = new Map<string, { title: string; count: number }>();
  for (const thread of threads) {
    if (thread.example) continue;
    const seen = new Set<string>();
    for (const step of thread.steps) {
      const key = step.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      counts.set(key, { title: current?.title ?? step.title, count: (current?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].filter((x) => x.count > 1).sort((a, b) => b.count - a.count)[0] ?? null;
}
