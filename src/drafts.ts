import type { DirectionContext, Task, Topic } from "./model.ts";
import { localDate } from "./model.ts";
import { extractContactDetails, deviceTimeZone } from "./calendar-model.ts";

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
};

/** Ask for one missing fingerprint feature at a time, without creating tasks. */
export function missingThreadPoints(source: string): string[] {
  const text = source.replace(/\s+/g, " ").trim();
  const hasOutcome = /\b(want|need|goal|build|make|finish|complete|resolve|apply|deal with|figure out|follow up|schedule|create|start|stop)\b/i.test(text);
  const hasTiming = /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|\b\d{1,2}[/:.-]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{4}\b)\b/i.test(text);
  const hasPeople = /\b(i alone|just me|no one else|my lawyer|my doctor|my friend|my partner|my client|with [A-Z][a-z]+|[A-Z][a-z]+ and I)\b/i.test(text);
  const hasConstraint = /\b(because|but|can't|cannot|won't|waiting|budget|money|deadline|blocked|depends|after|before|unless|limited)\b/i.test(text);
  const missing: string[] = [];
  if (!hasOutcome) missing.push("What result would make this thread feel resolved?");
  if (!hasTiming) missing.push("Is there a real date or time Flow should keep with this thread?");
  if (!hasPeople) missing.push("Who else is involved, if anyone?");
  if (!hasConstraint) missing.push("What could block this, or what should Flow keep in mind?");
  return missing;
}
export function threadFingerprint(source: string): ThreadPoint[] {
  const missing = new Set(missingThreadPoints(source));
  const points: Array<[string, string, string]> = [
    ["outcome", "Outcome", "What result would make this thread feel resolved?"],
    ["timing", "Timing", "Is there a real date or time Flow should keep with this thread?"],
    ["people", "People", "Who else is involved, if anyone?"],
    ["constraints", "Constraints", "What could block this, or what should Flow keep in mind?"],
  ];
  return points.map(([id, label, question]) => ({
    id,
    label,
    state: missing.has(question) ? "missing" : "known",
    ...(missing.has(question) ? { value: question } : {}),
  }));
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
  const missing = missingThreadPoints(source);
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
    threadStatus: missing.length ? "dumped" : "ready",
    goalsReady: missing.length === 0,
    missingPoints: missing,
    threadPoints: threadFingerprint(source),
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
  const combined = [plan.source, ...plan.updates, update.source].join("\n\n");
  const missingPoints = missingThreadPoints(combined);
  return {
    ...plan,
    state: "draft",
    threadStatus: missingPoints.length ? "understanding" : "ready",
    goalsReady: missingPoints.length === 0,
    missingPoints,
    threadPoints: threadFingerprint(combined),
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
