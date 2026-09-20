import { scoreAnswers, ITEMS, workingType } from "./personality.ts";
import { roofFor, type Roof } from "./formula.ts";

/**
 * Flow's four interaction modes: Keirsey's four temperaments (Please
 * Understand Me II), one per roof of the 16 working types. They change
 * wording, order and density of prompts only.
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
    name: "Operator",
    line: "You move fast and want to see it work.",
    promise: "Flow will give you one move at a time and get out of the way.",
  },
};

const MODE_FOR_ROOF: Record<Roof, Mode> = { SP: "connector", SJ: "builder", NF: "explorer", NT: "analyst" };

/** Keirsey's rule on the 16-letter working type: SP Artisan, SJ Guardian, NF Idealist, NT Rational. */
export function modeFor(answers: number[] | undefined): Mode | null {
  if (!Array.isArray(answers) || answers.length !== ITEMS.length) return null;
  try {
    scoreAnswers(answers);
  } catch {
    return null;
  }
  const type = workingType(answers);
  return type ? MODE_FOR_ROOF[roofFor(type.code)] : null;
}

export function flowType(answers: number[] | undefined): FlowType | null {
  const mode = modeFor(answers);
  return mode ? { mode, ...TYPES[mode] } : null;
}

/**
 * Order in which Flow asks about missing points. The backbone is WOOP
 * (Oettingen: Wish → Outcome → Obstacle → Plan): outcome first, then why it
 * matters, then what is in the way, then the first step. Modes only move
 * people and timing around inside that.
 */
export const QUESTION_ORDER: Record<Mode, string[]> = {
  explorer: ["outcome", "motivation", "constraints", "next", "people", "timing", "dependencies"],
  builder: ["outcome", "next", "constraints", "dependencies", "timing", "motivation", "people"],
  analyst: ["outcome", "constraints", "dependencies", "motivation", "timing", "next", "people"],
  connector: ["outcome", "people", "motivation", "constraints", "timing", "next", "dependencies"],
};

function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return items[Math.abs(h) % items.length];
}

const ACK: Record<Mode, string[]> = {
  explorer: ["Got it — I'm holding this one.", "Okay, that's in.", "Saved. I'll connect it to what I already know."],
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

const RESOLVED: Record<Mode, string> = {
  explorer: "🎉🎉🔥 Thread closed. That's the whole thing, done.",
  builder: "🏁✅ Resolved and closed. Clean finish.",
  analyst: "🏁📈 Resolved. Filed as complete.",
  connector: "🎉💛 Resolved — and everyone involved is sorted. Lovely.",
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
  resolved: (mode: Mode) => RESOLVED[mode],
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
