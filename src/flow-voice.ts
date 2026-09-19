import { scoreAnswers, ITEMS } from "./personality.ts";

/**
 * Flow's four interaction modes. They change wording, order and density of
 * prompts only. The quiz is the Mini-IPIP (Big Five); the mode is Flow's own
 * adaptation of those scores, not a validated type.
 */
export type Mode = "explorer" | "builder" | "analyst" | "connector";

export type FlowType = {
  mode: Mode;
  name: string;
  line: string;
  promise: string;
};

const TYPES: Record<Mode, Omit<FlowType, "mode">> = {
  explorer: {
    name: "Catalyst",
    line: "You have a lot of ideas at once.",
    promise:
      "Flow will hold them so you only ever have to look at one thing.",
  },
  builder: {
    name: "Steward",
    line: "You like a clear order and a quiet finish line.",
    promise: "Flow will keep the sequence and tell you exactly what's next.",
  },
  analyst: {
    name: "Architect",
    line: "You want the facts and the dependencies before you move.",
    promise: "Flow will map what's blocking what, then show the move.",
  },
  connector: {
    name: "Coordinator",
    line: "People and promises are what your days are made of.",
    promise: "Flow will keep who, when and what together for you.",
  },
};

export function modeFor(answers: number[] | undefined): Mode | null {
  if (!Array.isArray(answers) || answers.length !== ITEMS.length) return null;
  let scores;
  try {
    scores = scoreAnswers(answers);
  } catch {
    return null;
  }
  if (scores.Extraversion >= 3.25 && scores.Agreeableness >= 3.25)
    return "connector";
  if (scores.Conscientiousness >= 3.25 && scores.Agreeableness < 3.25)
    return "analyst";
  if (scores.Conscientiousness >= 3.25) return "builder";
  return "explorer";
}

export function flowType(answers: number[] | undefined): FlowType | null {
  const mode = modeFor(answers);
  return mode ? { mode, ...TYPES[mode] } : null;
}

/** Order in which Flow asks about missing points, by mode. */
export const QUESTION_ORDER: Record<Mode, string[]> = {
  explorer: ["outcome", "motivation", "next", "timing", "people", "constraints", "dependencies"],
  builder: ["outcome", "next", "timing", "dependencies", "constraints", "people", "motivation"],
  analyst: ["outcome", "constraints", "dependencies", "timing", "next", "people", "motivation"],
  connector: ["people", "outcome", "timing", "next", "constraints", "motivation", "dependencies"],
};

function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return items[Math.abs(h) % items.length];
}

const ACK: Record<Mode, string[]> = {
  explorer: ["Got it — I'm holding this one.", "Okay, that's in. Nothing else to do right now.", "Saved. I'll connect it to what I already know."],
  builder: ["Logged. Here's what I have so far.", "Got it. I'll keep this in order.", "Saved and filed with the rest."],
  analyst: ["Noted. Here's what's established so far.", "Got it. Facts so far below.", "Recorded. I'll keep the dependencies straight."],
  connector: ["Got it — I'll keep everyone in this straight.", "Saved. I've noted who's involved.", "Okay, I've got it. Nothing to sort out on your end."],
};

const REPLY_ACK: Record<Mode, string[]> = {
  explorer: ["That helps. One thread, one step closer.", "Nice — that fills in a piece.", "Got it, adding that."],
  builder: ["Good. That's another point confirmed.", "Logged. The picture is filling in.", "Got it. Next."],
  analyst: ["That resolves one unknown.", "Noted. That narrows it.", "Good — that's a fact I can use."],
  connector: ["Thanks — that makes the people part clearer.", "Got it. I've added that.", "Helpful. Keeping it with the rest."],
};

const FULL: Record<Mode, string> = {
  explorer: "🚀✨🔥 Okay NOW I get it. Full picture. Let's go.",
  builder: "✅🧭 Clear picture. Solid work.",
  analyst: "📐✅ Every point is covered. That's a complete model.",
  connector: "🙌💛 Got the whole story — who, when and why. Nice.",
};

const DONE: Record<Mode, string[]> = {
  explorer: ["🎉💪🔥 That's one down. Told you.", "🔥🔥 Boom. Done. On to the next."],
  builder: ["✔️📈 Done and logged.", "✅ One finished. Sequence holds."],
  analyst: ["✔️ Resolved. Dependency cleared.", "📈 Done. One fewer unknown."],
  connector: ["🎉💛 Done! That's a promise kept.", "🙌 Finished. People will notice."],
};

const BACK: Record<Mode, string> = {
  explorer: "👀🙌 Look who came back. Picking up where we left off.",
  builder: "👋 Good — picking up where we left off.",
  analyst: "👋 Welcome back. State is unchanged; here's where we were.",
  connector: "👋💛 Welcome back. Here's where we left it.",
};

const LEVEL: Record<Mode, string> = {
  explorer: "🏆🔥🔥🔥 {level}. You're on a run.",
  builder: "🏆 {level}. Consistent.",
  analyst: "🏆📈 {level}. The numbers agree.",
  connector: "🏆💛 {level}. People are lucky to have you on it.",
};

export const OFFER_INTRO: Record<Mode, string> = {
  explorer: "I've got a couple of small moves for this. Want to see them?",
  builder: "I have a short sequence for this. Want to see the first move?",
  analyst: "Given the constraints, I see a few viable moves. Want to see them?",
  connector: "I have a couple of moves — the first involves someone you mentioned. Want to see?",
};

export const STILL_ON_IT: Record<Mode, string> = {
  explorer: "This one's been quiet a while. Still on your mind, or park it?",
  builder: "No movement here for a while. Still active, or park it?",
  analyst: "No new input on this thread. Still relevant, or park it?",
  connector: "Haven't heard about this one lately. Still on, or park it?",
};

export const voice = {
  ack: (mode: Mode, seed: string) => pick(ACK[mode], seed),
  replyAck: (mode: Mode, seed: string) => pick(REPLY_ACK[mode], seed),
  fullPicture: (mode: Mode) => FULL[mode],
  done: (mode: Mode, seed: string) => pick(DONE[mode], seed),
  back: (mode: Mode) => BACK[mode],
  levelUp: (mode: Mode, level: string) => LEVEL[mode].replace("{level}", level),
  offerIntro: (mode: Mode) => OFFER_INTRO[mode],
  stillOnIt: (mode: Mode) => STILL_ON_IT[mode],
};

/** Emoji Flow rains when it gasses the user up. */
export function celebrationEmoji(mode: Mode): string[] {
  return {
    explorer: ["🚀", "✨", "🔥", "🎉", "💫"],
    builder: ["✅", "🧭", "📈", "🏆", "✔️"],
    analyst: ["📐", "📈", "✅", "🔎", "🏆"],
    connector: ["💛", "🙌", "🎉", "🤝", "✨"],
  }[mode];
}

export const DEFAULT_MODE: Mode = "explorer";
