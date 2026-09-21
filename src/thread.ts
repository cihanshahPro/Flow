import type {
  DraftStep,
  DueHint,
  ThoughtDraft,
  ThreadMessage,
  ThreadChip,
  ThreadPoint,
  ThreadStage,
} from "./drafts.ts";
import { shortTitle } from "./drafts.ts";
import type { Task } from "./model.ts";
import { localDate } from "./model.ts";
import { whenFromAnswer, type When } from "./when.ts";
import { areaPhrase, type Plate } from "./personality.ts";
import type { ThreadContext } from "./ai-policy.ts";
import { QUESTION_ORDER, voice, type Mode, DEFAULT_MODE } from "./flow-voice.ts";
import { PLAIN, formulaFor, formulaPrompt, nextStage, progressOf, understood, type Formula, type Stage, type ThreadState } from "./formula.ts";

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
    // A "next" the model picked must read as a step the person intends, not their whole sentence.
    if (id === "next" && !(detectors.next.test(words) || MOVE_VERBS.test(words))) continue;
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

/** Where this thread is in the seven-question script, read from its messages. */
export function scriptState(thread: Pick<ThoughtDraft, "messages" | "threadPoints" | "aweDone" | "steps">): ThreadState {
  const messages = thread.messages ?? [];
  const answered: Stage[] = [];
  if (messages.some((m) => m.kind === "transcript")) answered.push("mind");
  for (const m of messages) {
    if (m.from !== "flow" || !m.stage) continue;
    if ((m.stage === "summary" || m.answered) && !answered.includes(m.stage)) answered.push(m.stage);
  }
  const known = (id: PointId) => (thread.threadPoints ?? []).find((p) => p.id === id && p.state === "known")?.value;
  // A regex hit on "want" or "because" is not an answer: outcome and challenge count only once their question was answered.
  return {
    points: {
      outcome: answered.includes("want") ? known("outcome") : undefined,
      challenge: answered.includes("challenge") ? known("constraints") : undefined,
      people: known("people"),
      timing: known("timing"),
      dependencies: known("dependencies"),
      motivation: known("motivation"),
    },
    answered,
    elseAsked: messages.filter((m) => m.from === "flow" && m.stage === "else" && m.answered).length,
    elseExhausted: !!thread.aweDone,
    moveAccepted: (thread.steps ?? []).some((s) => s.accepted),
  };
}

/** 0–100: how far Flow is from understanding this thread (see formula.ts). */
export function understoodPercent(thread: Pick<ThoughtDraft, "messages" | "threadPoints" | "aweDone" | "steps">, formula: Pick<Formula, "elseRounds"> = DEFAULT_FORMULA): number {
  const state = scriptState(thread);
  return understood(state.points, progressOf(state, formula));
}

export function isUnderstood(thread: Pick<ThoughtDraft, "messages" | "threadPoints" | "aweDone" | "steps">): boolean {
  // Q3 is only ever asked after the loop closed, so by Q4 the loop is closed for any rhythm.
  return understoodPercent(thread, { elseRounds: 1 }) >= 100;
}

export const DEFAULT_FORMULA: Formula = { ...formulaFor("ISTJ"), script: PLAIN };

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
    // "this Monday" said on a Monday is today; a bare "Monday" is next week's.
    if (ahead === 0) ahead = m[1]?.trim() === "this" ? 0 : 7;
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
  /** Strict: one subject out of a dump joins a thread only when it clearly names that thread's subject, so a wide old thread cannot swallow everything. */
  options: { strict?: boolean } = {},
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
    if (options.strict) {
      const title = contentWords(thread.title);
      let named = 0;
      for (const w of words) if (title.has(w)) named++;
      if (named < 2 && !(named && score >= 0.5)) continue;
    }
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
  if (isUnderstood(thread)) return "understood";
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
    (m) => m.from === "flow" && !m.answered && ["question", "offer", "checkin", "stale", "branch"].includes(m.kind),
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
  if (pending?.kind === "branch") return "Flow heard more than one thing";
  const stage = stageFor(thread, tasks);
  if (stage === "understood" && offerableSteps(thread).length) return "Ready — Flow has moves";
  return STAGE_LABEL[stage];
}

export type ThreadGroup = "active" | "waiting" | "done";

/** Threads list bucket: parked or blocked on someone else = waiting; resolved = done; the rest are active. */
export function threadGroup(thread: ThoughtDraft, tasks: Task[]): ThreadGroup {
  const stage = stageFor(thread, tasks);
  if (stage === "done") return "done";
  if (stage === "parked") return "waiting";
  const open = threadTasks(thread, tasks).filter((t) => !t.done);
  if (open.length && open.every((t) => t.followUp || t.waitingOn?.trim())) return "waiting";
  return "active";
}

/** One line under a thread's title: the next move, else the nearest date, else its status. */
export function threadLine(thread: ThoughtDraft, tasks: Task[], now = new Date()): string {
  const today = localDate(now);
  const open = threadTasks(thread, tasks).filter((t) => !t.done);
  const waiting = open.find((t) => t.waitingOn?.trim());
  if (waiting) return `Waiting on ${waiting.waitingOn.trim()}${waiting.chaseDate ? ` · check ${waiting.chaseDate}` : ""}`;
  const pending = pendingMessage(thread);
  if (!pending && open.length) {
    const t = [...open].sort((a, b) => (a.plannedDate || "9").localeCompare(b.plannedDate || "9"))[0];
    return `Next: ${cleanMove(t.title, 48)}${t.plannedDate && t.plannedDate > today ? ` · ${t.plannedDate}` : ""}`;
  }
  const due = (thread.dueHints ?? []).map((h) => h.date).filter((d) => d >= today).sort()[0];
  if (!pending && due && thread.state !== "parked" && !thread.resolvedAt) return `${attentionLabel(thread, tasks)} · due ${due}`;
  return attentionLabel(thread, tasks);
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

const MOVE_LEAD =
  /^(?:(?:ok(?:ay)?|so|well|and|then|first|next|also|maybe|probably|just|i'?ll|i will|i'?m going to|i am going to|i can|i could|i'?m gonna|gonna|going to|plan to|i plan to|want to|i want to|need to|i need to|should|i should|i|start by|starting with|step one|the first (?:thing|step) is(?: to)?|first step is(?: to)?|to)\s+)+/i;
const MOVE_WHEN =
  /\s*\b(?:tonight|today|tomorrow(?:\s+(?:morning|afternoon|evening|night))?|this\s+(?:morning|afternoon|evening|weekend)|(?:(?:on|by|before)\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:at|by|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|first thing|later)\b[\s,.]*/gi;

/** A short "verb + object" move from someone's own sentence: no filler, no time words, at most `max` characters. */
export function cleanMove(text: string, max = 60): string {
  let t = text.trim().replace(/[.!?…]+$/, "");
  t = t.replace(MOVE_LEAD, "");
  t = t.replace(MOVE_WHEN, " ").replace(/\s+/g, " ").trim().replace(/^(?:and|then|to)\s+/i, "");
  t = t.replace(/(?:\s+(?:by|for|to|the|of|and|with|my|a|an|in|on|at))+$/i, "");
  if (t.split(/\s+/).filter(Boolean).length < 2) t = text.trim().replace(/[.!?…]+$/, "");
  if (t.length > max) {
    const cut = t.slice(0, max - 1);
    const at = cut.lastIndexOf(" ");
    t = (at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:–-]+$/, "");
    t = t.replace(/(?:\s+(?:by|for|to|the|of|and|with|my|a|an|in|on|at))+$/i, "") + "…";
  }
  return capitalise(t);
}

/** The Next card's one-line move: "This evening: Draft page 1 of the quarterly report". */
export function moveHeadline(
  task: { title: string; plannedDate?: string },
  timeWindow: string | undefined,
  now = new Date(),
): string {
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  let when: string;
  if (!task.plannedDate || task.plannedDate === today) when = whenLabel(timeWindow, now).replace(/^Tomorrow.*/, "Today");
  else if (task.plannedDate === tomorrow) when = "Tomorrow";
  else when = new Date(`${task.plannedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  if (when === "Next free 15 minutes") when = "Today";
  return `${when}: ${cleanMove(task.title, 60 - when.length - 2)}`;
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
  const said = (thread.messages ?? []).filter((m) => m.from === "you").map((m) => m.text).join(" ");
  // Titles are clipped for display ("…the Lisbon…"); the person's first sentence is the full phrase.
  const first = sentences((thread.messages ?? []).find((m) => m.kind === "transcript")?.text ?? "")[0];
  const source = first && MOVE_VERBS.test(first.trim()) ? first : thread.title;
  const title = secondPerson(seed ? cleanMove(seed, 60) : templateMove(source, said));
  return {
    ...thread,
    steps: [{ id: "auto-next", title: clip(title, 80), minutes: 15 }],
  };
}

/** "Renew my passport…" → "Renew your passport…": moves speak to the person. Their own casing is kept. */
export function secondPerson(text: string): string {
  const swap: Record<string, string> = { i: "you", me: "you", my: "your", mine: "yours", myself: "yourself", "i'm": "you're", "i've": "you've", "i'll": "you'll" };
  const out = text.replace(/\b(I'm|I've|I'll|I|me|my|mine|myself)\b/gi, (w) => {
    const r = swap[w.toLowerCase()] ?? w;
    return w[0] === w[0].toUpperCase() && w !== "I" ? capitalise(r) : r;
  });
  return capitalise(out);
}

const MOVE_VERBS =
  /^(?:renew|call|email|text|message|send|write|draft|plan|prepare|update|submit|register|cancel|check|find|ask|visit|order|return|apply|file|read|learn|practice|practise|clean|pay|book|buy|sell|fix|finish|complete|start|stop|make|build|create|schedule|sort|organi[sz]e|move|launch|ship|review|reply|research|compare|choose|decide|pick|get|set|open|close|sign|print|pack|go|meet|talk|tell|share|list|research|study|call|contact|follow|arrange|reserve|refill|replace|repair|renovate|train|run|walk|cook|tidy|declutter|backup|back|save|budget|invest|apply|quit|join|finalise|finalize|design|test|record)\b/i;
const DETERMINER = /^(?:the|a|an|my|our|your|his|her|their|this|that|these|those|some)\b/i;

/**
 * A move from the thread title when the person gave no concrete step. A title that starts with a
 * verb is already a move; a noun phrase becomes "Make a start on the …". The person's casing is kept,
 * except a first word they themselves wrote in lower case (so "Lisbon" stays "Lisbon").
 */
function templateMove(title: string, said: string): string {
  const move = cleanMove(title, 60);
  if (MOVE_VERBS.test(move)) return move;
  const first = move.split(/\s+/)[0];
  const phrase = new RegExp(`\\b${first.toLowerCase()}\\b`).test(said) || DETERMINER.test(move) ? first.toLowerCase() + move.slice(first.length) : move;
  return cleanMove(`Make a start on ${DETERMINER.test(phrase) ? "" : "the "}${phrase}`, 60);
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

/** The moment the person gave for their next move ("Tomorrow morning"), as a real date and time. */
export function moveWhen(thread: Pick<ThoughtDraft, "threadPoints" | "messages">, now = new Date()): When | undefined {
  const known = (id: PointId) => (thread.threadPoints ?? []).find((p) => p.id === id && p.state === "known")?.value;
  // The latest time the person gave wins; "next" may already hold a sentence with no time in it.
  const said = [...(thread.messages ?? [])].reverse().filter((m) => m.from === "you").map((m) => whenFromAnswer(m.text, now)).find(Boolean);
  return said ?? whenFromAnswer(known("next"), now) ?? whenFromAnswer(known("timing"), now);
}

/** A move is an if-then plan: a moment the person actually has, then the step, then the script's trade-off question. Accepted by replying. */
function offerMessage(thread: ThoughtDraft, step: DraftStep, now: string, plate?: Plate, formula: Formula = DEFAULT_FORMULA): ThreadMessage {
  const when = moveWhen(thread, new Date(now))?.label ?? whenLabel(plate?.timeWindow, new Date(now));
  return message(
    thread,
    {
      id: `${thread.id}:offer:${step.id}`,
      from: "flow",
      kind: "offer",
      stepId: step.id,
      stage: "trade",
      text: `${when}: ${capitalise(step.title)}. ${formula.script.questions.trade} Say “do it” and it goes on your Today.`,
    },
    now,
  );
}

const YES = /^(?:yes|yeah|yep|yup|ok(?:ay)?|sure|fine|deal|do it|go|go ahead|go for it|let'?s (?:do it|go)|sounds good|please|on it|👍|✅)\b|\bdo it\b/i;
const NO = /^(?:no|nope|nah|not now|not yet|skip|later|don'?t|pass|maybe later)\b/i;

/** The person's reply to an open move: accept, decline, or neither (they said something else). */
export function readAcceptance(text: string): "accept" | "decline" | null {
  const t = text.trim();
  if (NO.test(t)) return "decline";
  if (YES.test(t)) return "accept";
  return null;
}

/** The person's own words for every point Flow has, after the roof's lead. */
export function summaryText(thread: Pick<ThoughtDraft, "threadPoints">, formula: Formula): string {
  const known = (id: PointId) => (thread.threadPoints ?? []).find((p) => p.id === id && p.state === "known")?.value?.replace(/[.!?…]+$/, "");
  const bits: string[] = [];
  const quote = (v: string) => `“${v.length > 110 ? v.slice(0, 109).trimEnd() + "…" : v}”`;
  const outcome = known("outcome"), challenge = known("constraints"), people = known("people"), timing = known("timing"), deps = known("dependencies"), why = known("motivation");
  if (outcome) bits.push(`You want ${quote(outcome)}.`);
  if (challenge) bits.push(`In the way: ${quote(challenge)}.`);
  const short = (v: string | undefined) => (v && v.length <= 60 ? v : undefined);
  if (short(people)) bits.push(`Who: ${quote(people!)}.`);
  if (short(timing)) bits.push(`When: ${quote(timing!)}.`);
  if (short(deps)) bits.push(`It depends on ${quote(deps!)}.`);
  if (short(why)) bits.push(`Why it matters: ${quote(why!)}.`);
  return `${formula.script.summaryLead} ${bits.join(" ")}`.trim();
}

/** The next script question (or summary + "How can I help?") as messages, or nothing when the script is waiting on the person. */
function continueScript(
  thread: ThoughtDraft,
  added: ThreadMessage[],
  formula: Formula,
  at: string,
  hyped: Set<string>,
  plate?: Plate,
  /** Flow's own answer to "How can I help?": when it starts with a verb, it is the move. */
  moveSeed?: string,
): { thread: ThoughtDraft; added: ThreadMessage[] } {
  let next = thread;
  const push = (m: Omit<ThreadMessage, "id" | "createdAt"> & { id?: string }) => {
    added.push(message({ ...next, messages: [...(next.messages ?? []), ...added] }, m, at));
  };
  const view = () => ({ ...next, messages: [...(next.messages ?? []), ...added] });
  const script = formula.script;
  // One open thing at a time.
  if (pendingMessage(view())) return { thread: next, added };
  const stage = nextStage(scriptState(view()), formula);
  if (stage === "else") push({ from: "flow", kind: "question", stage: "else", text: script.questions.else });
  else if (stage === "challenge") push({ from: "flow", kind: "question", stage: "challenge", pointId: "constraints", text: script.questions.challenge });
  else if (stage === "want") push({ from: "flow", kind: "question", stage: "want", pointId: "outcome", text: script.questions.want });
  else if (stage === "summary" || stage === "help") {
    if (!hyped.has("ready")) {
      push({ from: "flow", kind: "hype", text: script.full });
      hyped.add("ready");
    }
    if (stage === "summary") push({ from: "flow", kind: "ack", stage: "summary", text: summaryText(next, formula) });
    push({ from: "flow", kind: "question", stage: "help", text: script.questions.help });
  } else if (stage === null && scriptState(view()).answered.includes("help") && !next.steps.some((s) => s.accepted)) {
    // "How can I help?" is answered and no move is on the table: offer the one move, with its trade-off.
    const seed = sentences(moveSeed ?? "")[0];
    if (!next.steps.length && seed && MOVE_VERBS.test(seed.trim()))
      next = { ...next, steps: [{ id: "auto-next", title: clip(cleanMove(seed, 60), 80), minutes: 15 }] };
    next = ensureMoves(next);
    const step = offerableSteps(view())[0];
    if (step) added.push(offerMessage(view(), step, at, plate, formula));
    // Nothing in their words to build a move from: GTD's question, once.
    else if (!(next.threadPoints ?? []).some((p) => p.id === "next" && p.state === "known") && !(next.messages ?? []).some((m) => m.pointId === "next"))
      push({ from: "flow", kind: "question", pointId: "next", text: "What's the very next thing you'd do on this?" });
  }
  return { thread: next, added };
}

/**
 * Flow's turn after a recording lands in this thread. `noteId` is the saved
 * recording; `text` is its transcript. The optional `reply` and `question`
 * come from the shaper (on-device or cloud) and win over templated wording.
 */
/**
 * Flow's reply when no AI reply is available: it reflects back what this
 * message settled, in the person's own words, so the turn still reads as a
 * conversation rather than a receipt.
 */
export function templateReply(
  text: string,
  before: ThreadPoint[] | undefined,
  after: ThreadPoint[],
  isFirst: boolean,
  mode: Mode,
  seed: string,
): string {
  const wasKnown = new Set((before ?? []).filter((p) => p.state === "known").map((p) => p.id));
  const fresh = after.filter((p) => p.state === "known" && !wasKnown.has(p.id));
  const asked = /\?\s*$/.test(text.trim()) || /^(what|how|why|when|which|who|should|can|could|do you|is it|any idea)\b/i.test(text.trim());
  if (asked) {
    const known = after.filter((p) => p.state === "known");
    if (!known.length) return "Fair question. I don't have enough yet to say — tell me what you'd want out of this and I'll work from there.";
    const bits = known.slice(0, 3).map((p) => `${p.label.toLowerCase()}: “${(p.value ?? "").slice(0, 60)}”`);
    return `Here's what I have so far — ${bits.join("; ")}. Tell me the piece that's missing and I'll give you a move.`;
  }
  if (isFirst) {
    // Say back the concrete bits the dump already holds, in the person's words; the generic ack only when there are none.
    const bits = fresh.filter((p) => p.id !== "outcome" && p.id !== "next" && (p.value ?? "").length <= 60).slice(0, 2).map((p) => `${p.label.toLowerCase()}: “${p.value}”`);
    return bits.length ? `So — ${bits.join("; ")}. I've got that.` : voice.ack(mode, seed);
  }
  if (fresh.length) {
    const bits = fresh.slice(0, 2).map((p) => `${p.label.toLowerCase()} is “${(p.value ?? "").slice(0, 60)}”`);
    return `Got it — so ${bits.join(", and ")}.`;
  }
  return voice.replyAck(mode, seed);
}

const SIDE_OPENERS = /^(?:oh,? and|also|and also|plus|separately|another thing|on top of that|and then there'?s|and i (?:also|still)|and i keep|i also|unrelated,?|different thing,?)\b/i;

/**
 * Sentences that start like a change of subject ("Also…", "Plus…") and share
 * no vocabulary with the thread are other subjects. Local and deterministic,
 * so splitting works even when the model misses it.
 */
export function detectBranches(text: string, thread: Pick<ThoughtDraft, "title" | "source" | "threadPoints">): { title: string; evidence: string }[] {
  // On the first dump the whole text is the source, so the subject is its opening sentence(s) instead.
  const firstDump = (thread.source ?? "").trim() === text.trim();
  const opening = sentences(text).filter((x) => !SIDE_OPENERS.test(x)).slice(0, 2).join(" ");
  const subject = contentWords(
    // Long evidence (a whole answer) would smuggle a side subject's words into the thread's vocabulary.
    firstDump ? [thread.title, opening].join(" ") : [thread.title, thread.source ?? "", ...(thread.threadPoints ?? []).map((p) => (p.state === "known" && (p.value ?? "").length <= 80 ? p.value! : ""))].join(" "),
  );
  const out: { title: string; evidence: string }[] = [];
  for (const sentence of sentences(text)) {
    if (!SIDE_OPENERS.test(sentence)) continue;
    const words = contentWords(sentence);
    let shared = 0;
    for (const w of words) if (subject.has(w)) shared++;
    if (words.size < 3 || shared / words.size > 0.34) continue;
    const body = sentence
      .replace(SIDE_OPENERS, "")
      .replace(/^[,\s]+/, "")
      .replace(/^(?:i )?(?:keep meaning to|meaning to|keep forgetting to|still need to|need to|have to|want to|should|must) /i, "");
    // The subject is the noun phrase before the verb ("The car insurance renewal"), not a clipped sentence.
    const head = body.split(/\s+(?:is|are|was|were|keeps?|needs?|wants?|has|have|by|at|because|so|but)\b/i)[0].trim();
    const raw = (head.split(/\s+/).length >= 3 && head.length <= 48 ? head : shortTitle(body, 40)).replace(/…$/, "").replace(/[.,;:]+$/, "");
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (title.length >= 4 && !out.some((b) => b.title.toLowerCase() === title.toLowerCase())) out.push({ title, evidence: clip(sentence, 200) });
    if (out.length === 3) break;
  }
  return out;
}

/** True when the shaper's question just repeats what the person said. */
function echoesPerson(question: string, text: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const q = norm(question), t = norm(text);
  if (!q) return false;
  if (t.includes(q)) return true;
  const qw = new Set(q.split(" ").filter((w) => w.length > 3)), tw = new Set(t.split(" "));
  let shared = 0;
  for (const w of qw) if (tw.has(w)) shared++;
  return qw.size >= 4 && shared / qw.size >= 0.8;
}

/** What the AI needs to reply as a turn in this thread, not to one sentence in isolation. */
export function threadContextFor(thread: ThoughtDraft, others: ThoughtDraft[] = [], formula: Formula | null = null): ThreadContext {
  const recent = (thread.messages ?? [])
    .filter((m) => ["transcript", "ack", "question", "reply"].includes(m.kind))
    .slice(-8)
    .map((m) => ({ from: m.from, text: m.text }));
  const open = pendingMessage(thread);
  const f = formula ?? DEFAULT_FORMULA;
  // What Flow will ask after this reply, so the model reflects and never asks its own question.
  const upcoming = open?.kind === "question" || open?.kind === "offer" ? null : nextStage(scriptState(thread), f);
  const askNext = upcoming && upcoming !== "summary" ? f.script.questions[upcoming] : upcoming === "summary" ? f.script.questions.help : undefined;
  return {
    title: thread.title,
    points: (thread.threadPoints ?? []).filter((p) => p.state === "known" && p.value).map((p) => ({ id: p.id, evidence: p.value! })),
    recent,
    ...(open?.kind === "question" ? { openQuestion: open.text } : {}),
    ...(open?.kind === "offer" ? { openMove: open.text } : {}),
    ...(askNext ? { askNext } : {}),
    script: formulaPrompt(formula),
    percent: understoodPercent(thread, f),
    otherThreads: others
      .filter((t) => t.id !== thread.id && !t.example && t.state !== "parked" && !t.resolvedAt)
      .slice(0, 6)
      .map((t) => t.title),
  };
}

export function respondToRecording(
  thread: ThoughtDraft,
  noteId: string,
  text: string,
  options: {
    mode?: Mode;
    /** The person's formula (roof + dials). Defaults to the plainest script, SJ. */
    formula?: Formula | null;
    now?: Date;
    reply?: string;
    question?: string;
    evidence?: Partial<Record<PointId, string>>;
    plate?: Plate;
    /** Other subjects the shaper heard in this message; Flow offers to split them off. */
    branches?: { title: string; evidence: string }[];
    /** An intake turn: the transcript and Flow's reflection, no question until the person opens the thread. */
    quiet?: boolean;
  } = {},
): ThoughtDraft {
  const mode = options.mode ?? DEFAULT_MODE;
  const formula = options.formula ?? DEFAULT_FORMULA;
  const at = (options.now ?? new Date()).toISOString();
  if ((thread.messages ?? []).some((m) => m.kind === "transcript" && m.noteId === noteId))
    return thread;
  const previous = thread.messages ?? [];
  const isFirst = !previous.some((m) => m.kind === "transcript");
  const added: ThreadMessage[] = [];
  const openQuestion = [...previous].reverse().find((m) => m.from === "flow" && m.kind === "question" && !m.answered);
  const openOffer = [...previous].reverse().find((m) => m.from === "flow" && m.kind === "offer" && !m.answered);
  const acceptance = openOffer ? readAcceptance(text) : null;
  // The person's own words, kept verbatim. A recording answers Flow's open question; a yes/no answers an open move.
  let next: ThoughtDraft = {
    ...thread,
    messages: previous.map((m) =>
      (m.id === openQuestion?.id) || (m.id === openOffer?.id && acceptance) ? { ...m, answered: noteId } : m,
    ),
  };
  const push = (m: Omit<ThreadMessage, "id" | "createdAt"> & { id?: string }) => {
    const built = message({ ...next, messages: [...(next.messages ?? []), ...added] }, m, at);
    added.push(built);
    return built;
  };
  const view = () => ({ ...next, messages: [...(next.messages ?? []), ...added] });
  push({ from: "you", kind: "transcript", text, noteId });
  // A recording right after Flow's question answers that question, even when no detector matches its words.
  const asked = openQuestion?.pointId as PointId | undefined;
  // The person's direct answer to a script question is better evidence than a detector's hit on an earlier sentence.
  const saidNothing = /^(?:no|nope|nah|nothing|not really|that'?s (?:it|all|everything)|no,? that'?s it|i think that'?s it)\b/i.test(text.trim()) || text.trim().split(/\s+/).length < 3;
  const points = fingerprint(text, thread.threadPoints, noteId, options.evidence).map((p) =>
    p.id === asked && (p.state !== "known" || openQuestion?.stage) && !saidNothing
      ? { ...p, state: "known" as const, value: clip(text.trim()), sourceNoteIds: [noteId] }
      : p,
  );
  const hints = extractDueHints(text, options.now);
  // "And what else?" closes when the person says there is nothing else (or the rhythm's cap is reached, see formula.ts).
  const aweDone = thread.aweDone || (openQuestion?.stage === "else" && saidNothing);
  next = {
    ...next,
    threadPoints: points,
    aweDone,
    missingPoints: missingQuestions(points, mode),
    dueHints: [...(thread.dueHints ?? []), ...hints.filter((h) => !(thread.dueHints ?? []).some((d) => d.date === h.date))],
  };
  next = { ...next, goalsReady: isUnderstood(view()), threadStatus: isUnderstood(view()) ? "ready" : isFirst ? "dumped" : "understanding" };
  const hyped = new Set(thread.hypeGiven ?? []);
  // The person answered an open move by replying.
  if (openOffer && acceptance === "accept" && openOffer.stepId) {
    next = { ...next, steps: next.steps.map((st) => (st.id === openOffer.stepId ? { ...st, accepted: true, deferred: false } : st)) };
    const when = moveWhen(view(), new Date(at))?.label ?? whenLabel(options.plate?.timeWindow, new Date(at));
    push({ from: "flow", kind: "ack", text: `Done — it's on your Today (${when.toLowerCase()}). I'll ask how it went after.` });
    return { ...withMessages(next, added), hypeGiven: [...hyped] };
  }
  if (openOffer && acceptance === "decline" && openOffer.stepId) {
    next = { ...next, declinedStepIds: [...(thread.declinedStepIds ?? []), openOffer.stepId] };
    const step = offerableSteps(view())[0];
    if (step) {
      push({ from: "flow", kind: "ack", text: "Fair." });
      added.push(offerMessage(view(), step, at, options.plate, formula));
    } else push({ from: "flow", kind: "ack", text: "Fair. I'll hold this thread and bring it back when something changes." });
    return { ...withMessages(next, added), hypeGiven: [...hyped] };
  }
  // A model reply that only repeats the person, or promises to do the work itself, is no reflection; the template says what was settled instead.
  const speaksForFlow = new RegExp("\\bI(?:'ll| will| am going to) " + MOVE_VERBS.source.replace(/^\^/, ""), "i").test(options.reply ?? "");
  const reply = options.reply?.trim() && !echoesPerson(options.reply, text) && !speaksForFlow ? options.reply.trim() : "";
  push({
    from: "flow",
    kind: "ack",
    text: reply || templateReply(text, thread.threadPoints, points, isFirst, mode, noteId),
  });
  if (options.quiet) return { ...withMessages(next, added), hypeGiven: [...hyped] };
  // Several subjects in one breath: offer to give the others their own thread, once.
  const heard = [...(options.branches ?? []), ...detectBranches(text, next)];
  const same = (a: string, b: string) => {
    const x = a.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const y = b.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return x === y || x.includes(y) || y.includes(x);
  };
  // A subject already offered its own thread is not offered again.
  const offeredBefore = (thread.messages ?? []).filter((m) => m.kind === "branch").flatMap((m) => m.branches ?? []);
  const branches = heard
    .filter((b) => b.title.trim() && b.evidence.trim())
    .filter((b, i, all) => all.findIndex((o) => same(o.title, b.title) || same(o.evidence, b.evidence)) === i)
    .filter((b) => !offeredBefore.some((o) => same(o.title, b.title) || same(o.evidence, b.evidence)))
    .slice(0, 3);
  if (branches.length) {
    push({
      from: "flow",
      kind: "branch",
      text:
        branches.length === 1
          ? `“${branches[0].title}” sounds like its own thing — its own thread?`
          : `I heard ${branches.length + 1} separate things. Keep this one on “${next.title}” and give ${branches.map((b) => `“${b.title}”`).join(" and ")} their own threads?`,
      branches,
      chips: [
        { id: "split", label: "Yes" },
        { id: "keep", label: "No" },
      ],
    });
    // One decision at a time: while the split question is open, the next question waits a turn.
    return { ...withMessages(next, added), hypeGiven: [...hyped] };
  }
  // After a finished move, "What was most useful?" is answered: the next move, or the closing check-in.
  if (openQuestion?.stage === "useful") {
    const step = offerableSteps(view())[0];
    if (step) added.push(offerMessage(view(), step, at, options.plate, formula));
    else
      push({
        from: "flow",
        kind: "checkin",
        id: `${thread.id}:check:resolved:${noteId}`,
        text: "That was the last move I had. Is this whole thing resolved now?",
        chips: [
          { id: "yes", label: "Resolved 🎉" },
          { id: "no", label: "There's more" },
        ],
      });
    return { ...withMessages(next, added), hypeGiven: [...hyped] };
  }
  // A move on the table and a reply that is neither yes nor no: the reflection stands; the move stays open.
  if (openOffer) return { ...withMessages(next, added), hypeGiven: [...hyped] };
  const cont = continueScript(next, added, formula, at, hyped, options.plate, reply);
  next = cont.thread;
  return { ...withMessages(next, added), hypeGiven: [...hyped] };
}

/** The person opened a thread Flow had not asked anything in yet (an intake starter): ask now. */
export function wakeThread(thread: ThoughtDraft, options: { formula?: Formula | null; now?: Date; plate?: Plate } = {}): ThoughtDraft {
  if (thread.example || thread.state === "parked" || thread.resolvedAt) return thread;
  if (!(thread.messages ?? []).some((m) => m.kind === "transcript")) return thread;
  if ((thread.messages ?? []).some((m) => m.from === "flow" && (m.kind === "question" || m.kind === "offer"))) return thread;
  const added: ThreadMessage[] = [];
  const hyped = new Set(thread.hypeGiven ?? []);
  const cont = continueScript(thread, added, options.formula ?? DEFAULT_FORMULA, (options.now ?? new Date()).toISOString(), hyped, options.plate);
  return added.length ? { ...withMessages(cont.thread, added), hypeGiven: [...hyped] } : thread;
}

export type ChipEffect =
  | { type: "accept"; stepId: string }
  | { type: "complete"; taskId: string }
  | { type: "park" }
  | { type: "credit"; id: string }
  | { type: "branch"; branches: { title: string; evidence: string }[] };

/** The user tapped one of two chips. Returns the updated thread and what the app must do. */
export function answerChip(
  thread: ThoughtDraft,
  messageId: string,
  chipId: string,
  options: { mode?: Mode; formula?: Formula | null; now?: Date; plate?: Plate } = {},
): { thread: ThoughtDraft; effects: ChipEffect[] } {
  const mode = options.mode ?? DEFAULT_MODE;
  const formula = options.formula ?? DEFAULT_FORMULA;
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
  const view = () => ({ ...next, messages: [...(next.messages ?? []), ...added] });
  push({ from: "you", kind: "reply", text: label });
  const effects: ChipEffect[] = [];
  const hyped = new Set(thread.hypeGiven ?? []);
  const carryOn = () => {
    const cont = continueScript(next, added, formula, at, hyped, plate);
    next = cont.thread;
  };
  if (target.kind === "question" && target.pointId) {
    // A tapped suggestion (older builds) is a full answer to that point, in the person's chosen words.
    const pointId = target.pointId as PointId;
    const unsure = UNSURE_LABELS.has(label);
    const points = (next.threadPoints ?? []).map((p) =>
      p.id === pointId && p.state !== "known" && !unsure ? { ...p, state: "known" as const, value: label, sourceNoteIds: [] } : p,
    );
    next = { ...next, threadPoints: points, missingPoints: missingQuestions(points, mode) };
    next = { ...next, goalsReady: isUnderstood(view()), threadStatus: isUnderstood(view()) ? "ready" : "understanding" };
    push({ from: "flow", kind: "ack", text: voice.replyAck(mode, messageId) });
    carryOn();
  } else if (target.kind === "branch") {
    if (chipId === "split" && target.branches?.length) {
      effects.push({ type: "branch", branches: target.branches });
      // A title that named the split-off subject too ("Fan and passport renewal") is renamed after the opening sentence.
      const stems = (text: string) => new Set([...contentWords(text)].map((w) => w.slice(0, 5)));
      const titleStems = stems(next.title);
      const namesBranch = target.branches.some((b) => [...stems(b.title)].filter((w) => titleStems.has(w)).length >= 2);
      if (namesBranch) {
        const opening = sentences((next.messages ?? []).find((m) => m.kind === "transcript")?.text ?? "").find((x) => !SIDE_OPENERS.test(x));
        if (opening) next = { ...next, title: shortTitle(opening, 40) };
      }
      push({
        from: "flow",
        kind: "ack",
        text: `Done — ${target.branches.map((b) => `“${b.title}”`).join(" and ")} ${target.branches.length === 1 ? "has its own thread" : "have their own threads"} now. This one stays on “${next.title}”.`,
      });
    } else {
      push({ from: "flow", kind: "ack", text: "Okay, keeping it all here." });
    }
    // Now the conversation continues where it would have.
    carryOn();
  } else if (target.kind === "offer" && target.stepId) {
    // Offers from older builds still carry chips.
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
      if (step) added.push(offerMessage(view(), step, at, plate, formula));
      else push({ from: "flow", kind: "ack", text: "Fair. I'll hold this thread and bring it back when something changes." });
    }
  } else if (target.kind === "checkin" && target.id.includes(":check:resolved:")) {
    if (chipId === "yes") {
      next = { ...next, resolvedAt: at };
      effects.push({ type: "credit", id: target.id });
      push({ from: "flow", kind: "hype", text: voice.resolved(mode) });
    } else {
      push({ from: "flow", kind: "question", stage: "help", text: `Okay. ${formula.script.questions.help}` });
    }
  } else if (target.kind === "checkin") {
    if (chipId === "yes") {
      if (target.taskId) effects.push({ type: "complete", taskId: target.taskId });
      effects.push({ type: "credit", id: target.id });
      push({ from: "flow", kind: "hype", text: formula.script.done });
      push({ from: "flow", kind: "question", stage: "useful", text: formula.script.questions.useful });
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
      carryOn();
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

/** The person finished a move from the Next card. Flow celebrates once, then asks the script's last question. */
export function noteMoveDone(
  thread: ThoughtDraft,
  task: Task,
  options: { mode?: Mode; formula?: Formula | null; now?: Date; plate?: Plate } = {},
): ThoughtDraft {
  const formula = options.formula ?? DEFAULT_FORMULA;
  const at = (options.now ?? new Date()).toISOString();
  const id = `${thread.id}:done:${task.id}`;
  if ((thread.messages ?? []).some((m) => m.id === id)) return thread;
  const next: ThoughtDraft = {
    ...thread,
    messages: (thread.messages ?? []).map((m) =>
      m.kind === "checkin" && m.taskId === task.id && !m.answered ? { ...m, answered: "yes" } : m,
    ),
  };
  const added: ThreadMessage[] = [{ id, createdAt: at, from: "flow", kind: "hype", text: formula.script.done }];
  if (!pendingMessage(next))
    added.push({ id: `${thread.id}:useful:${task.id}`, createdAt: at, from: "flow", kind: "question", stage: "useful", text: formula.script.questions.useful });
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
