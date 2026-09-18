import type { Task, Topic } from "./model.ts";
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
export type ThoughtDraft = {
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
};
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
