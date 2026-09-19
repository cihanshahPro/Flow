import type { DirectionContext } from "./model.ts";
import type { ThoughtDraft } from "./drafts.ts";
// Small, reversible suggestions. Never represent these as extracted user statements.
const STARTERS: Record<string, { title: string; why: string }> = {
  "Build something": {
    title: "Open your current project and identify its next unfinished screen",
    why: "Start from work you already have. If there is no project yet, record what you want to build instead.",
  },
  "Find work or clients": {
    title: "Open your contacts and shortlist one person to approach",
    why: "One possible contact is enough to start. Nothing is sent for you.",
  },
  "Finish a project": {
    title: "Open the project and mark one unfinished item to complete next",
    why: "Use the existing project to define a small finish line.",
  },
  "Reply to someone": {
    title: "Open your messages and find the oldest reply you owe",
    why: "Find the conversation first. You can decide what to say afterward.",
  },
  "Follow up": {
    title:
      "Open the conversation you are waiting on and check the last message",
    why: "Review what has already happened before drafting a follow-up.",
  },
  "Make plans": {
    title: "Check your calendar for one available time",
    why: "Find a real opening before arranging anything.",
  },
  "Bills or taxes": {
    title:
      "Find the most recent bill or tax notice and check its stated due date",
    why: "Start from the actual document. Flow will not guess financial deadlines.",
  },
  "Forms or appointments": {
    title:
      "Open the form or appointment notice and check what it asks for next",
    why: "The source document provides the next requirement.",
  },
  "A case or claim": {
    title:
      "Find the latest case or claim message and check for a requested response",
    why: "Use the actual correspondence; this does not provide legal advice or invent a deadline.",
  },
  "Home or repairs": {
    title: "Take one photo of the home issue you want to address",
    why: "A concrete reference makes the next decision easier.",
  },
  "Shopping or errands": {
    title: "Check what is missing before your next errand",
    why: "Start with one necessary item, using what you can see.",
  },
  Transport: {
    title: "Check the next journey or vehicle task already on your calendar",
    why: "Start with an existing commitment rather than a new plan.",
  },
  "Movement or exercise": {
    title: "Put your walking shoes somewhere easy to reach",
    why: "Prepare a small starting cue. Choose movement that fits your circumstances.",
  },
  "Health follow-up": {
    title:
      "Find the latest appointment instructions and check the next requested step",
    why: "Follow the information from your care team; Flow does not infer medical needs.",
  },
  "Rest or a hobby": {
    title: "Put one item for your chosen hobby or quiet break within reach",
    why: "Make a small break easier to begin.",
  },
  "An upcoming event": {
    title: "Open the event details and check its date and location",
    why: "Confirm the existing details before scheduling anything.",
  },
  "A deadline": {
    title: "Find the original deadline notice and confirm its date",
    why: "Use the source, not a guessed date.",
  },
  "An idea for later": {
    title:
      "Save a short voice note about the idea without turning it into a commitment",
    why: "Keep the idea available while today stays focused.",
  },
};
export function starterFor(direction: DirectionContext) {
  return (
    STARTERS[direction.choice] ?? {
      title: "Review the latest note related to this direction",
      why: "Start with information you already have.",
    }
  );
}
export function starterDraft(direction: DirectionContext): ThoughtDraft {
  const starter = starterFor(direction);
  return {
    id: `starter:${direction.directionId}`,
    title: direction.choice,
    topic: direction.areaId === "work" ? "Work" : "Life",
    direction,
    source: `Selected interest: ${direction.choice}. Flow suggested a starting step; this is not a transcript.`,
    summary: starter.why,
    updates: [],
    state: "draft",
    createdAt: new Date().toISOString(),
    steps: [
      { id: "first", title: starter.title, minutes: 5, reason: starter.why },
    ],
  };
}
