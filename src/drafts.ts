import type { DirectionContext, Task, Topic } from "./model.ts";
import { localDate } from "./model.ts";
import { extractContactDetails, deviceTimeZone } from "./calendar-model.ts";
import { fingerprint, missingQuestions, isReady } from "./thread.ts";
import { DEFAULT_MODE } from "./flow-voice.ts";

export type DraftStep = {
  id: string;
  title: string;
  minutes: number;
  accepted?: boolean;
  deferred?: boolean;
  label?: string;
  smallAction?: string;
  reason?: string;
  evidence?: string;
  chosenTitle?: string;
};
/** A thread is the user's ongoing understanding of one subject, before it is a task list. */
export type ThreadStatus = "dumped" | "understanding" | "ready" | "active" | "paused" | "complete";
export type ThreadPoint = {
  id: string;
  label: string;
  value?: string;
  state: "known" | "missing" | "suggested";
  sourceNoteIds?: string[];
};
export type ThoughtDraft = {
  sourceNoteIds?: string[];
  id: string;
  title: string;
  topic: Topic;
  source: string;
  updates: string[];
  steps: DraftStep[];
  state: "draft" | "parked";
  createdAt: string;
  example?: boolean;
  summary?: string;
  organizer?: "apple-local";
  direction?: DirectionContext;
  /** New fields are additive so existing local drafts remain readable. */
  threadStatus?: ThreadStatus;
  threadPoints?: ThreadPoint[];
  missingPoints?: string[];
  goalsReady?: boolean;
  goalIds?: string[];
  level?: number;
  /** Conversation with Flow. See src/thread.ts; all fields stay optional. */
  messages?: ThreadMessage[];
  stage?: ThreadStage;
  dueHints?: DueHint[];
  hypeGiven?: string[];
  declinedStepIds?: string[];
  lastEvaluatedAt?: string;
  lastOpenedAt?: string;
  /** Set only when the person confirms the whole thread is resolved. */
  resolvedAt?: string;
};
export type ThreadStage = "dumped" | "understood" | "moving" | "done" | "parked";
export type DueHint = { date: string; phrase: string };
export type ThreadChip = { id: string; label: string };
export type ThreadMessage = {
  id: string;
  from: "flow" | "you";
  kind:
    | "transcript"
    | "ack"
    | "question"
    | "hype"
    | "offer"
    | "checkin"
    | "stale"
    | "reply";
  text: string;
  createdAt: string;
  noteId?: string;
  pointId?: string;
  stepId?: string;
  taskId?: string;
  chips?: ThreadChip[];
  /** Chip id or note id that answered this message. */
  answered?: string;
};

/** Ask for one missing fingerprint feature at a time, without creating tasks. */
export function missingThreadPoints(source: string): string[] {
  return missingQuestions(fingerprint(source), DEFAULT_MODE);
}
export function threadFingerprint(source: string): ThreadPoint[] {
  return fingerprint(source);
}
const actionStart =
  /^(?:i (?:need|want|have) to |(?:we|i) should |let'?s |please )?(?:call|email|ask|send|finish|start|build|make|choose|pick|book|find|write|prepare|follow up|check|review|talk|contact|collect|buy|research|schedule|create|apply|visit|read|plan|update|design|test|record)\b/i;
export function suggestDraft(
  id: string,
  text: string,
  now = new Date(),
): ThoughtDraft {
  const source = text.trim();
  if (!source || source.length > 20000)
    throw new Error("Use between 1 and 20,000 characters.");
  const points = fingerprint(source);
  const missing = missingQuestions(points, DEFAULT_MODE);
  const sentences = source
    .split(/(?:\n+|[.!?]+\s+|;\s*|,?\s+then\s+)/i)
    .map((s) =>
      s
        .trim()
        .replace(/^then\s+/i, "")
        .replace(/[.!?]+$/, ""),
    )
    .filter(Boolean);
  const seen = new Set<string>();
  const actions = sentences
    .filter((s) => actionStart.test(s))
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);
  return {
    id,
    title: sentences[0].replace(/^i (?:want|need|have) to /i, "").slice(0, 90),
    topic: /\b(client|portfolio|website|work|business|invoice|job)\b/i.test(
      source,
    )
      ? "Work"
      : "Ideas",
    source,
    updates: [],
    steps: actions.map((title, i) => ({
      id: String(i),
      title: title.replace(/^i (?:need|want|have) to /i, "").slice(0, 280),
      minutes: Math.max(
        1,
        Math.min(
          480,
          Number(title.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1] ?? 15),
        ),
      ),
    })),
    state: "draft",
    createdAt: now.toISOString(),
    // A first dump that already answers every point is ready; nothing forces a second recording.
    threadStatus: isReady(points) ? "ready" : "dumped",
    goalsReady: isReady(points),
    missingPoints: missing,
    threadPoints: points,
  };
}
export function refineDraft(draft: ThoughtDraft, update: string): ThoughtDraft {
  if (!update.trim() || update.length > 20000)
    throw new Error("Add a short update first.");
  const next = suggestDraft(draft.id, update);
  const keys = new Set(draft.steps.map((s) => s.title.toLowerCase()));
  const additions = next.steps
    .filter((s) => !keys.has(s.title.toLowerCase()))
    .slice(0, Math.max(0, 3 - draft.steps.filter((s) => !s.accepted).length));
  return {
    ...draft,
    updates: [...draft.updates, update.trim()],
    steps: [
      ...draft.steps,
      ...additions.map((s, i) => ({
        ...s,
        id: `u${draft.updates.length}-${i}`,
      })),
    ],
  };
}
export function taskForStep(
  draft: ThoughtDraft,
  step: DraftStep,
  date = localDate(),
): Task {
  return {
    id: `flow:${draft.id}:${step.id}`,
    title: step.title,
    topic: draft.topic,
    minutes: step.minutes,
    done: false,
    plannedDate: date,
    plannedTime: "",
    deadline: "",
    waitingOn: "",
    chaseDate: "",
    notes: [draft.source, ...draft.updates].join("\n\nUpdate: "),
    createdAt: new Date().toISOString(),
    timeZone: deviceTimeZone(),
    reminderMinutes: 15,
    ...(draft.direction ? { direction: draft.direction } : {}),
    ...extractContactDetails(draft.source),
  };
}
export function exampleDraft(id: string): ThoughtDraft {
  return {
    id,
    title: "Land my first website client",
    topic: "Work",
    source:
      "I want to build websites for clients. I need one example to show first. Then I can ask Alex for introductions. I have afternoons available.",
    updates: [],
    state: "draft",
    createdAt: new Date().toISOString(),
    example: true,
    steps: [
      {
        id: "example",
        title: "Choose one project for my portfolio",
        minutes: 15,
      },
      { id: "intro", title: "Ask Alex about an introduction", minutes: 10 },
    ],
  };
}

/** Validate model output before it becomes an actionable draft. Source remains intact. */
export function shapedDraft(
  id: string,
  source: string,
  value: unknown,
): ThoughtDraft {
  const base = suggestDraft(id, source);
  if (!value || typeof value !== "object")
    throw new Error("The organizer returned an unreadable draft.");
  const plan = value as Record<string, unknown>;
  const bounded = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
      ? v.trim()
      : "";
  const title = bounded(plan.title, 120),
    summary = bounded(plan.summary, 600);
  if (
    !title ||
    !summary ||
    !Array.isArray(plan.choices) ||
    plan.choices.length > 3
  )
    throw new Error("The organizer returned an incomplete draft.");
  const seen = new Set<string>();
  const steps: DraftStep[] = [];
  for (const [i, raw] of plan.choices.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const label = bounded(raw.label, 80),
      action = bounded(raw.action, 280),
      smallAction = bounded(raw.smallAction, 180),
      reason = bounded(raw.reason, 300);
    const evidence = bounded(raw.evidence, 800).replace(/^["“]|["”]$/g, "");
    const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
    if (
      !label ||
      !action ||
      !smallAction ||
      !reason ||
      !evidence ||
      !normalized(source).includes(normalized(evidence)) ||
      seen.has(action.toLowerCase())
    )
      continue;
    seen.add(action.toLowerCase());
    steps.push({
      id: `ai-${i}`,
      title: action,
      minutes: 15,
      label,
      smallAction,
      reason,
      evidence,
    });
  }
  if (plan.choices.length && !steps.length)
    throw new Error(
      "The suggested actions could not be matched to your words.",
    );
  // An extractive preview cannot turn a time budget into a promised deadline.
  const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
  const faithfulSummary = normalized(source).includes(normalized(summary))
    ? summary
    : source.slice(0, 300) + (source.length > 300 ? "…" : "");
  return {
    ...base,
    title,
    summary: faithfulSummary,
    steps,
    organizer: "apple-local",
  };
}

/** Flow's own words from the shaper: a short reply, one question, and grounded evidence per point. */
export type ShapedVoice = {
  reply?: string;
  question?: string;
  evidence: Partial<Record<string, string>>;
};
export function shapedVoice(value: unknown, source: string): ShapedVoice {
  const out: ShapedVoice = { evidence: {} };
  if (!value || typeof value !== "object") return out;
  const plan = value as Record<string, unknown>;
  const bounded = (v: unknown, max: number) =>
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : "";
  const reply = bounded(plan.reply, 200);
  const question = bounded(plan.question, 160);
  // A reply must not smuggle in advice or facts: keep it short and free of URLs.
  if (reply && !/https?:\/\//i.test(reply)) out.reply = reply;
  if (question && /\?$/.test(question)) out.question = question;
  const normalized = source.replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(plan.points)) {
    for (const raw of plan.points.slice(0, 7)) {
      if (!raw || typeof raw !== "object") continue;
      const id = bounded((raw as Record<string, unknown>).id, 20).toLowerCase();
      const evidence = bounded((raw as Record<string, unknown>).evidence, 200).replace(/^["“]|["”]$/g, "");
      if (id && evidence && normalized.includes(evidence.replace(/\s+/g, " ").toLowerCase()))
        out.evidence[id] = evidence;
    }
  }
  return out;
}

/** Attach a saved update to its existing plan without changing original words or chosen IDs. */
export function appendPlanUpdate(
  plan: ThoughtDraft,
  update: ThoughtDraft,
): ThoughtDraft {
  if (plan.sourceNoteIds?.includes(update.id)) return plan;
  const titles = new Set(plan.steps.map((step) => step.title.toLowerCase()));
  const additions = update.steps
    .filter((step) => !titles.has(step.title.toLowerCase()))
    .slice(
      0,
      Math.max(
        0,
        3 -
          plan.steps.filter((step) => !step.accepted && !step.deferred).length,
      ),
    );
  const points = fingerprint(update.source, plan.threadPoints, update.id);
  const missingPoints = missingQuestions(points, DEFAULT_MODE);
  return {
    ...plan,
    state: "draft",
    threadStatus: isReady(points) ? "ready" : "understanding",
    goalsReady: isReady(points),
    missingPoints,
    threadPoints: points,
    sourceNoteIds: [...(plan.sourceNoteIds ?? []), update.id],
    updates: [...plan.updates, update.source],
    steps: [
      ...plan.steps,
      ...additions.map((step, i) => ({
        ...step,
        id: `update:${update.id}:${i}`,
      })),
    ],
  };
}
