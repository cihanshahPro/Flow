import type {
  DraftStep,
  DueHint,
  ThoughtDraft,
  ThreadMessage,
  ThreadChip,
  ThreadPoint,
  ThreadStage,
} from "./drafts.ts";
import type { Task } from "./model.ts";
import { localDate } from "./model.ts";
import { areaPhrase, type Plate } from "./personality.ts";
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
  { id: "outcome", label: "Outcome", question: "What would you want to come out of this? Say the result, not the work." },
  { id: "people", label: "People", question: "Who else is in this?" },
  { id: "timing", label: "Timing", question: "Is there a real date on this?" },
  { id: "constraints", label: "In the way", question: "What's most likely to get in the way?" },
  { id: "motivation", label: "Why it matters", question: "If that happened, what would it change for you?" },
  { id: "dependencies", label: "Depends on", question: "Does anything have to happen first?" },
  { id: "next", label: "First step", question: "What's the first bit you could do, and when?" },
];

/**
 * Flow's question in context: it quotes the person's own outcome when it has
 * one, so the question is about their thing, not a form field.
 */
export function questionFor(point: { id: PointId; question: string }, points: ThreadPoint[] | undefined): string {
  const outcome = (points ?? []).find((p) => p.id === "outcome" && p.state === "known")?.value;
  if (point.id === "outcome" || !outcome) return point.question;
  const quoted = outcome.replace(/[.!?…]+$/, "");
  return `You said “${quoted.length > 70 ? quoted.slice(0, 69).trimEnd() + "…" : quoted}”. ${point.question}`;
}

const NONE_LABELS = new Set(["Just me", "No real date", "Nothing I can see", "Nothing — I can start"]);
const UNSURE_LABELS = new Set(["Not sure where to start", "Not sure yet"]);

/**
 * Suggested answers for a question, from the person's own profile where it
 * has them. Tapping one is a full answer; recording is always the other way.
 */
export function suggestionChips(point: PointId, plate?: Plate): ThreadChip[] {
  const labels: string[] = (() => {
    switch (point) {
      case "outcome":
        return ["Get it done and off my list", "Make a decision", "Get someone else to handle it", "Just get clear on it"];
      case "motivation":
        return ["Peace of mind", "Money", "Someone's counting on me", "It's overdue"];
      case "constraints":
        return [...(plate?.obstacles ?? []).slice(0, 3), "Nothing I can see"];
      case "dependencies":
        return ["Nothing — I can start", "Waiting on someone", "Need information first", "Need money first"];
      case "people":
        return [...(plate?.people ?? []).slice(0, 3), "Just me"];
      case "timing":
        return ["This week", "This month", "No real date"];
      case "next":
        return [whenLabel(plate?.timeWindow), "Tomorrow morning", "This weekend", "Not sure where to start"];
    }
  })();
  return [...new Set(labels)].slice(0, 4).map((label, i) => ({ id: `s${i}`, label }));
}

/** "This evening", "Tomorrow morning"… from the person's usual time window. */
export function whenLabel(timeWindow: string | undefined, now = new Date()): string {
  const hour = now.getHours();
  switch (timeWindow) {
    case "Mornings":
      return hour < 10 ? "This morning" : "Tomorrow morning";
    case "Lunchtime":
      return hour < 13 ? "At lunch today" : "At lunch tomorrow";
    case "Evenings":
      return hour < 20 ? "This evening" : "Tomorrow evening";
    case "Weekends":
      return now.getDay() === 0 || now.getDay() === 6 ? "Today" : "This weekend";
    default:
      return "Next free 15 minutes";
  }
}

/** The calendar day an if-then move lands on, matching whenLabel. */
export function plannedDateFor(timeWindow: string | undefined, now = new Date()): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = (n: number) => localDate(new Date(base.getTime() + n * 864e5));
  const hour = now.getHours();
  switch (timeWindow) {
    case "Mornings":
      return hour < 10 ? days(0) : days(1);
    case "Lunchtime":
      return hour < 13 ? days(0) : days(1);
    case "Evenings":
      return hour < 20 ? days(0) : days(1);
    case "Weekends": {
      const d = base.getDay();
      return d === 0 || d === 6 ? days(0) : days((6 - d + 7) % 7);
    }
    default:
      return days(0);
  }
}

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
  extra: Partial<Record<PointId, string>> = {},
): ThreadPoint[] {
  const detected = { ...detectPoints(text) };
  // Shaper evidence is accepted only when it is the person's own words.
  const normalized = text.replace(/\s+/g, " ").toLowerCase();
  for (const [id, evidence] of Object.entries(extra)) {
    if (!evidence || !POINTS.some((p) => p.id === id)) continue;
    const words = evidence.replace(/\s+/g, " ").trim();
    if (words && normalized.includes(words.toLowerCase())) detected[id as PointId] = clip(words);
  }
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
  if (thread.resolvedAt) return "done";
  const mine = threadTasks(thread, tasks);
  if (mine.some((t) => !t.done)) return "moving";
  if (isReady(thread.threadPoints)) return "understood";
  return "dumped";
}

export const STAGE_LABEL: Record<ThreadStage, string> = {
  dumped: "Flow is working on this",
  understood: "Ready",
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
  if (thread.state === "parked") return STAGE_LABEL.parked;
  if (thread.resolvedAt) return STAGE_LABEL.done;
  const pending = pendingMessage(thread);
  if (pending?.kind === "question") return "Flow has a question";
  if (pending?.kind === "offer") return "Flow has a move for you";
  if (pending?.kind === "checkin") return "Quick check-in";
  if (pending?.kind === "stale") return "Still on this?";
  const stage = stageFor(thread, tasks);
  if (stage === "understood" && offerableSteps(thread).length) return "Ready — Flow has moves";
  return STAGE_LABEL[stage];
}

/** Moves Flow can offer: steps not yet accepted or declined, at most three. */
export function offerableSteps(thread: ThoughtDraft): DraftStep[] {
  const declined = new Set(thread.declinedStepIds ?? []);
  const offered = new Set(
    (thread.messages ?? []).filter((m) => m.kind === "offer" && !m.answered).map((m) => m.stepId),
  );
  return thread.steps.filter((s) => !s.accepted && !declined.has(s.id) && !offered.has(s.id)).slice(0, 3);
}

const GENERIC_ANSWERS = new Set([
  "get it done and off my list", "make a decision", "get someone else to handle it", "just get clear on it",
  "not sure where to start", "not sure yet", "this weekend", "this week", "this month", "no real date",
]);
/** True when an answer is a real "verb + object" move, not a time label or a canned chip. */
export function concreteMove(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/[.!?…]+$/, "");
  if (GENERIC_ANSWERS.has(v)) return false;
  if (/^(?:(?:this|tomorrow|next|at|in the|first thing|tonight|today)\b[\w\s]*|morning|evening|afternoon|lunch(?:time)?|next free 15 minutes)$/.test(v) && v.split(/\s+/).length <= 4) return false;
  return v.split(/\s+/).length >= 2;
}

/**
 * A ready thread always has at least one move to offer. When the person's
 * words held no explicit action, the move is their own "next" or outcome
 * sentence, so nothing is invented.
 */
export function ensureMoves(thread: ThoughtDraft): ThoughtDraft {
  if (thread.steps.length) return thread;
  const points = thread.threadPoints ?? [];
  const known = (id: PointId) => points.find((p) => p.id === id && p.state === "known")?.value;
  const seed = [known("next"), known("outcome")].find((v) => v && concreteMove(v));
  if (!known("next") && !known("outcome")) return thread;
  const title = seed
    ? seed.replace(/[.!?…]+$/, "").replace(/^(first|then|next|tonight|tomorrow)\s+/i, "")
    : `Take the first small step on ${thread.title.toLowerCase()}`;
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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A move is an if-then plan: a moment the person actually has, then the step. */
function offerMessage(thread: ThoughtDraft, step: DraftStep, now: string, plate?: Plate): ThreadMessage {
  return message(
    thread,
    {
      id: `${thread.id}:offer:${step.id}`,
      from: "flow",
      kind: "offer",
      stepId: step.id,
      text: `${whenLabel(plate?.timeWindow, new Date(now))}: ${capitalise(step.title)}`,
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
  options: {
    mode?: Mode;
    now?: Date;
    reply?: string;
    question?: string;
    evidence?: Partial<Record<PointId, string>>;
    plate?: Plate;
  } = {},
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
  const points = fingerprint(text, thread.threadPoints, noteId, options.evidence);
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
  // A shaper question about something the person already answered is noise; fall back to the template.
  const known = new Set(points.filter((p) => p.state === "known").map((p) => p.id));
  const asksKnown = (q: string) => {
    const norm = q.trim().toLowerCase().replace(/[^a-z ]/g, "");
    return POINTS.some((p) => known.has(p.id) && (norm === p.question.toLowerCase().replace(/[^a-z ]/g, "") || (p.id === "people" && /^who (else )?is involved/.test(norm)) || (p.id === "timing" && /^(when|is there a (real )?(date|time))/.test(norm))));
  };
  if (options.question && asksKnown(options.question)) options = { ...options, question: undefined };
  const hyped = new Set(thread.hypeGiven ?? []);
  const ask = (point: { id: PointId; question: string }) =>
    push({
      from: "flow",
      kind: "question",
      pointId: point.id,
      text: options.question?.trim() || questionFor(point, points),
      chips: suggestionChips(point.id, options.plate),
    });
  if (isReady(points)) {
    next = ensureMoves(next);
    if (!hyped.has("ready")) {
      push({ from: "flow", kind: "hype", text: voice.fullPicture(mode) });
      hyped.add("ready");
    }
    const step = offerableSteps(next)[0];
    if (step) added.push(offerMessage(next, step, at, options.plate));
    else if (!isFirst || !hyped.has("ready")) {
      const point = nextMissingPoint(points, mode);
      if (point) ask(point);
    }
  } else {
    const point = nextMissingPoint(points, mode);
    if (point) ask(point);
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
  options: { mode?: Mode; now?: Date; plate?: Plate } = {},
): { thread: ThoughtDraft; effects: ChipEffect[] } {
  const mode = options.mode ?? DEFAULT_MODE;
  const at = (options.now ?? new Date()).toISOString();
  const plate = options.plate;
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
  if (target.kind === "question" && target.pointId) {
    // A tapped suggestion is a full answer to that point, in the person's chosen words.
    const pointId = target.pointId as PointId;
    const unsure = UNSURE_LABELS.has(label);
    const points = (next.threadPoints ?? []).map((p) =>
      p.id === pointId && p.state !== "known" && !unsure
        ? { ...p, state: "known" as const, value: NONE_LABELS.has(label) ? label : label, sourceNoteIds: [] }
        : p,
    );
    next = {
      ...next,
      threadPoints: points,
      missingPoints: missingQuestions(points, mode),
      goalsReady: isReady(points),
      threadStatus: isReady(points) ? "ready" : "understanding",
    };
    if (isReady(points)) {
      next = ensureMoves(next);
      if (!hyped.has("ready")) {
        push({ from: "flow", kind: "hype", text: voice.fullPicture(mode) });
        hyped.add("ready");
      }
      const step = offerableSteps(next)[0];
      if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at, plate));
      else {
        const point = nextMissingPoint(points, mode);
        if (point) push({ from: "flow", kind: "question", pointId: point.id, text: questionFor(point, points), chips: suggestionChips(point.id, plate) });
      }
    } else {
      push({ from: "flow", kind: "ack", text: voice.replyAck(mode, messageId) });
      const point = unsure ? nextMissingPoint(points.filter((p) => p.id !== pointId), mode) : nextMissingPoint(points, mode);
      if (point) push({ from: "flow", kind: "question", pointId: point.id, text: questionFor(point, points), chips: suggestionChips(point.id, plate) });
    }
  } else if (target.kind === "offer" && target.stepId) {
    if (chipId === "do") {
      effects.push({ type: "accept", stepId: target.stepId });
      next = {
        ...next,
        steps: next.steps.map((s) => (s.id === target.stepId ? { ...s, accepted: true, deferred: false } : s)),
      };
      push({ from: "flow", kind: "ack", text: "On it. It's your Next card now — I'll check back after." });
    } else {
      next = { ...next, declinedStepIds: [...(thread.declinedStepIds ?? []), target.stepId] };
      const step = offerableSteps(next)[0];
      if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at, plate));
      else push({ from: "flow", kind: "ack", text: "Fair. I'll hold this thread and bring it back when something changes." });
    }
  } else if (target.kind === "checkin" && target.id.includes(":check:resolved:")) {
    if (chipId === "yes") {
      next = { ...next, resolvedAt: at };
      effects.push({ type: "credit", id: target.id });
      push({ from: "flow", kind: "hype", text: voice.resolved(mode) });
    } else {
      push({ from: "flow", kind: "question", pointId: "next", text: "Okay. What's the next move on this, and when?", chips: suggestionChips("next", plate) });
    }
  } else if (target.kind === "checkin") {
    if (chipId === "yes") {
      if (target.taskId) effects.push({ type: "complete", taskId: target.taskId });
      effects.push({ type: "credit", id: target.id });
      push({ from: "flow", kind: "hype", text: voice.done(mode, target.id) });
      const step = isReady(next.threadPoints) ? offerableSteps(next)[0] : undefined;
      if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at, plate));
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
        added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at, plate));
      else if (point) push({ from: "flow", kind: "question", pointId: point.id, text: questionFor(point, next.threadPoints), chips: suggestionChips(point.id, plate) });
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

/** The person finished a move from the Next card. Flow celebrates once and offers the next move if there is one. */
export function noteMoveDone(
  thread: ThoughtDraft,
  task: Task,
  options: { mode?: Mode; now?: Date; plate?: Plate } = {},
): ThoughtDraft {
  const mode = options.mode ?? DEFAULT_MODE;
  const at = (options.now ?? new Date()).toISOString();
  const id = `${thread.id}:done:${task.id}`;
  if ((thread.messages ?? []).some((m) => m.id === id)) return thread;
  let next: ThoughtDraft = {
    ...thread,
    messages: (thread.messages ?? []).map((m) =>
      m.kind === "checkin" && m.taskId === task.id && !m.answered ? { ...m, answered: "yes" } : m,
    ),
  };
  const added: ThreadMessage[] = [
    { id, createdAt: at, from: "flow", kind: "hype", text: voice.done(mode, task.id) },
  ];
  const step = isReady(next.threadPoints) && !pendingMessage(next) ? offerableSteps(next)[0] : undefined;
  if (step) added.push(offerMessage({ ...next, messages: [...(next.messages ?? []), ...added] }, step, at, options.plate));
  else if (!pendingMessage(next))
    added.push({
      id: `${thread.id}:check:resolved:${task.id}`,
      createdAt: at,
      from: "flow",
      kind: "checkin",
      text: "That was the last move I had. Is this whole thing resolved now?",
      chips: [
        { id: "yes", label: "Resolved 🎉" },
        { id: "no", label: "There's more" },
      ],
    });
  return withMessages(next, added);
}

/** A level changed because of something in this thread. Flow says so here, once per level. */
export function noteLevelUp(thread: ThoughtDraft, level: string, mode: Mode, now = new Date()): ThoughtDraft {
  const id = `${thread.id}:level:${level.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if ((thread.messages ?? []).some((m) => m.id === id)) return thread;
  return withMessages(thread, [
    { id, createdAt: now.toISOString(), from: "flow", kind: "hype", text: voice.levelUp(mode, level) },
  ]);
}

const AREA_KEYWORDS: Record<string, string[]> = {
  "Work project": ["work", "project", "deadline", "launch", "boss", "team", "manager", "office", "colleague", "meeting", "report"],
  "Job or clients": ["job", "client", "interview", "cv", "resume", "hire"],
  "Money & bills": ["money", "bill", "bills", "rent", "tax", "taxes", "invoice", "pay", "budget", "bank"],
  "Paperwork or legal": ["form", "forms", "paperwork", "lawyer", "legal", "visa", "passport", "insurance", "claim", "contract"],
  Health: ["doctor", "dentist", "health", "gym", "sleep", "appointment", "therapy", "exercise"],
  "Home & repairs": ["home", "house", "flat", "apartment", "repair", "fix", "garage", "kitchen", "landlord", "clean"],
  Family: ["family", "mom", "mum", "dad", "parents", "kids", "son", "daughter", "brother", "sister"],
  Relationship: ["partner", "wife", "husband", "girlfriend", "boyfriend", "relationship", "date"],
  Studying: ["study", "exam", "course", "class", "essay", "thesis", "school", "university"],
  "A side project": ["side project", "app", "website", "portfolio", "startup", "idea"],
  "Moving or travel": ["move", "moving", "trip", "travel", "flight", "pack", "visa"],
};

/**
 * What Flow suggests recording next: the first area from the person's own
 * profile that no open thread covers yet. The user is never asked to record
 * "whatever"; there is always a specific prompt.
 */
export function suggestPrompt(
  plate: Plate | undefined,
  threads: ThoughtDraft[],
): { title: string; prompt: string; area?: string } {
  const open = threads.filter((t) => !t.example && t.state !== "parked" && !t.resolvedAt);
  const corpus = open.map((t) => [t.title, t.source, ...t.updates].join(" ").toLowerCase()).join("\n");
  for (const [i, area] of (plate?.areas ?? []).entries()) {
    // The first thread is prompted from the first area, so once any thread is open that area is taken.
    if (i === 0 && open.length) continue;
    const words = AREA_KEYWORDS[area] ?? [area.toLowerCase()];
    const covered = words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(corpus));
    if (!covered)
      return {
        area,
        title: area,
        prompt: `What's the one thing in ${areaPhrase(area)} hanging over you? Say where it stands, what you'd want out of it, who's involved, and what's in the way.`,
      };
  }
  if (!open.length)
    return { title: "Start a thread", prompt: "Say everything about one thing that's on your mind: where it stands, what you'd want out of it, who's involved, what's in the way." };
  return { title: "Anything new?", prompt: "Something new since last time, or something that's been nagging at you. One thing at a time." };
}

/**
 * A thread saved by an older build has words but no conversation. Flow opens
 * one from the saved source so it reads like every other thread; the note id
 * is the draft's own id, which is what older builds used for the recording.
 */
export function backfillConversation(thread: ThoughtDraft, options: { mode?: Mode; plate?: Plate; now?: Date } = {}): ThoughtDraft {
  if (thread.example || (thread.messages ?? []).length || !thread.source?.trim()) return thread;
  let next = respondToRecording(
    { ...thread, threadPoints: undefined, missingPoints: undefined },
    thread.sourceNoteIds?.[0] ?? thread.id,
    thread.source,
    { mode: options.mode, plate: options.plate, now: options.now ?? new Date(thread.createdAt) },
  );
  for (const [i, update] of thread.updates.entries()) {
    next = respondToRecording(next, `${thread.id}:update:${i}`, update, { mode: options.mode, plate: options.plate, now: options.now ?? new Date(thread.createdAt) });
  }
  return next;
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
