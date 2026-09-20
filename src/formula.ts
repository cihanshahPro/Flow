/**
 * The Flow Formula — what Flow says next inside a thread.
 *
 *   turn = reflect(what was just said, roof) + question(stage, roof) · rhythm(E|I) · lens(T|F or J|P)
 *
 * Nothing here is invented:
 * - The seven questions, in this order: Michael Bungay Stanier, *The Coaching
 *   Habit* (2016) — the GROW model (Whitmore, 1992) compressed into seven words-
 *   long questions.
 * - The four roofs: David Keirsey, *Please Understand Me II* (1998) — the 16
 *   types collapse into four temperaments along concrete/abstract words and
 *   cooperative/utilitarian aims. Only the wording changes per roof.
 * - The dials: Hirsh & Kise, *Introduction to Type and Coaching* — Extraverts
 *   think by talking (keep asking "And what else?"), Introverts think first
 *   (ask once); J closes with a date, P keeps the smallest step.
 * - Reflect-before-ask and ask-before-advising: Miller & Rollnick,
 *   *Motivational Interviewing* (OARS, elicit-provide-elicit).
 * - The move itself: Allen's GTD ("what does done look like", "very next
 *   action") stated as Oettingen's WOOP if-then plan.
 */

import { workingType } from "./personality.ts";

// ---------------------------------------------------------------- the spine

export type Stage = "mind" | "else" | "challenge" | "want" | "summary" | "help" | "trade" | "useful";

/** The seven questions in script order (summary is Flow speaking, not asking). */
export const STAGES: readonly Stage[] = ["mind", "else", "challenge", "want", "summary", "help", "trade", "useful"];

/** Fingerprint points that count toward "understood". `next` is the move; it comes after. */
export type UnderstandingPoint = "outcome" | "challenge" | "people" | "timing" | "dependencies" | "motivation";

export const WEIGHTS: Record<UnderstandingPoint, number> = {
  outcome: 25,
  challenge: 25,
  people: 12.5,
  timing: 12.5,
  dependencies: 12.5,
  motivation: 12.5,
};

/** Which question fills which points. Q1/Q2 are the dump and its pulls; Q3 and Q4 are worth half the meter. */
export const FILLS: Record<Stage, readonly UnderstandingPoint[]> = {
  mind: ["people", "timing", "dependencies", "motivation"],
  else: ["people", "timing", "dependencies", "motivation"],
  challenge: ["challenge"],
  want: ["outcome", "motivation"],
  summary: [],
  help: [],
  trade: [],
  useful: [],
};

/** 0–100. A point counts only with evidence (a quote from the person). */
export function understood(points: Partial<Record<UnderstandingPoint, string | undefined>>): number {
  let total = 0;
  for (const key of Object.keys(WEIGHTS) as UnderstandingPoint[]) {
    if (points[key]?.trim()) total += WEIGHTS[key];
  }
  return Math.round(total);
}

// ---------------------------------------------------------------- roofs

export type Roof = "SP" | "SJ" | "NF" | "NT";
export type Rhythm = "E" | "I";
export type Lens = "T" | "F" | "J" | "P";

export type RoofScript = {
  keirsey: "Artisan" | "Guardian" | "Idealist" | "Rational";
  /** Flow's user-facing name for the type. */
  name: "Operator" | "Steward" | "Catalyst" | "Architect";
  words: "concrete" | "abstract";
  aims: "utilitarian" | "cooperative";
  /** Keirsey's core need — what the person must hear back to feel understood. */
  need: string;
  /** What the reflection leads with. */
  reflects: string;
  /** The questions, in the roof's words. Q1, Q2 and Q7 are identical for everyone. */
  questions: Record<Exclude<Stage, "summary">, string>;
  /** First words of the 100% summary. */
  summaryLead: string;
  /** How the single move is shaped. */
  moveShape: string;
  /** Hype line when the meter reaches 100. */
  full: string;
  /** Hype line when a move is done. */
  done: string;
};

const MIND = "What's on your mind?";
const ELSE = "And what else?";
const HELP = "How can I help?";
const USEFUL = "What was most useful for you?";

export const ROOFS: Record<Roof, RoofScript> = {
  SP: {
    keirsey: "Artisan",
    name: "Operator",
    words: "concrete",
    aims: "utilitarian",
    need: "impact, right now",
    reflects: "what's happening and what's been tried",
    questions: {
      mind: MIND,
      else: ELSE,
      challenge: "What's actually in the way right now?",
      want: "What do you want to have happen?",
      help: HELP,
      trade: "If you do this now, what gets dropped?",
      useful: USEFUL,
    },
    summaryLead: "Here's the play as I see it:",
    moveShape: "one action, today, minutes not hours",
    full: "⚡ Got the whole play.",
    done: "⚡ Nice move.",
  },
  SJ: {
    keirsey: "Guardian",
    name: "Steward",
    words: "concrete",
    aims: "cooperative",
    need: "what's expected, by whom, by when",
    reflects: "duties and dates",
    questions: {
      mind: MIND,
      else: ELSE,
      challenge: "Which part of this is on you and isn't handled yet?",
      want: "What needs to be done, and by when?",
      help: HELP,
      trade: "If you commit to this, what are you saying no to?",
      useful: USEFUL,
    },
    summaryLead: "Here's where things stand:",
    moveShape: "owner, date and what done looks like",
    full: "✅ Clear picture. Every piece accounted for.",
    done: "✅ Handled.",
  },
  NF: {
    keirsey: "Idealist",
    name: "Catalyst",
    words: "abstract",
    aims: "cooperative",
    need: "that it matters, and who it's for",
    reflects: "the people and what it means to you",
    questions: {
      mind: MIND,
      else: ELSE,
      challenge: "What's the part of this that's weighing on you?",
      want: "What would make this feel right for you?",
      help: HELP,
      trade: "If you say yes to this, what are you saying no to?",
      useful: USEFUL,
    },
    summaryLead: "Here's what I'm hearing:",
    moveShape: "one honest step, framed around the people in it",
    full: "🌱 I've got the whole picture now.",
    done: "🌱 That's you at your best.",
  },
  NT: {
    keirsey: "Rational",
    name: "Architect",
    words: "abstract",
    aims: "utilitarian",
    need: "the model, and why the move works",
    reflects: "what depends on what",
    questions: {
      mind: MIND,
      else: ELSE,
      challenge: "What's the real problem underneath this?",
      want: "What outcome are you actually after?",
      help: HELP,
      trade: "If you go with this, what does it cost you?",
      useful: USEFUL,
    },
    summaryLead: "Here's the model:",
    moveShape: "the highest-leverage step, with the why",
    full: "🎯 Complete model. Every dependency mapped.",
    done: "🎯 Right lever.",
  },
};

/** Keirsey's rule: S+P Artisan, S+J Guardian, N+F Idealist, N+T Rational. */
export function roofFor(code: string): Roof {
  const c = code.toUpperCase();
  if (c[1] === "S") return c[3] === "P" ? "SP" : "SJ";
  return c[2] === "F" ? "NF" : "NT";
}

/** The two letters the roof leaves free: rhythm (E/I) and the lens (T/F under S roofs, J/P under N roofs). */
export function dialsFor(code: string): { rhythm: Rhythm; lens: Lens } {
  const c = code.toUpperCase();
  const rhythm: Rhythm = c[0] === "E" ? "E" : "I";
  const lens: Lens = c[1] === "S" ? (c[2] === "F" ? "F" : "T") : c[3] === "J" ? "J" : "P";
  return { rhythm, lens };
}

/** Max rounds of "And what else?" — Extraverts think by talking, Introverts already said the considered version. */
export const ELSE_ROUNDS: Record<Rhythm, number> = { E: 3, I: 1 };

export type Formula = {
  code: string;
  roof: Roof;
  script: RoofScript;
  rhythm: Rhythm;
  lens: Lens;
  elseRounds: number;
  /** Closure: J — the move carries a date and done-state; P — the smallest first step, no date forced. */
  closes: "dated" | "smallest-step";
  /** What the reflection leads with: T — facts and sequence; F — people and meaning. */
  leads: "facts" | "people";
};

/** The full formula for one 16-letter type. */
export function formulaFor(code: string): Formula {
  const roof = roofFor(code);
  const { rhythm, lens } = dialsFor(code);
  const c = code.toUpperCase();
  return {
    code: c,
    roof,
    script: ROOFS[roof],
    rhythm,
    lens,
    elseRounds: ELSE_ROUNDS[rhythm],
    closes: c[3] === "J" ? "dated" : "smallest-step",
    leads: c[2] === "F" ? "people" : "facts",
  };
}

/** From the Mini-IPIP answers. Null until the test is done — Flow then uses the SJ script, the plainest of the four. */
export function formulaFromAnswers(answers: number[] | undefined): Formula | null {
  if (!answers) return null;
  const type = workingType(answers);
  return type ? formulaFor(type.code) : null;
}

export const DEFAULT_ROOF: Roof = "SJ";

// ---------------------------------------------------------------- next stage

export type ThreadState = {
  points: Partial<Record<UnderstandingPoint, string | undefined>>;
  /** Stages whose question has been asked and answered. */
  answered: readonly Stage[];
  /** How many times "And what else?" has been asked so far. */
  elseAsked: number;
  /** The last "And what else?" answer added nothing new. */
  elseExhausted?: boolean;
  /** A move exists and has been accepted by replying. */
  moveAccepted?: boolean;
  /** The move has been done (task completed). */
  moveDone?: boolean;
};

/**
 * The next thing Flow says. Fixed order; never skips ahead; "And what else?"
 * repeats within the rhythm cap until it stops adding points. Summary and the
 * move exist only at 100.
 */
export function nextStage(state: ThreadState, formula: Pick<Formula, "elseRounds">): Stage | null {
  const has = (s: Stage) => state.answered.includes(s);
  if (!has("mind")) return "mind";
  if (state.elseAsked < formula.elseRounds && !state.elseExhausted) return "else";
  if (!has("challenge")) return "challenge";
  if (!has("want")) return "want";
  if (understood(state.points) < 100) return null; // wait; live with an empty point rather than drill down
  if (!has("summary")) return "summary";
  if (!has("help")) return "help";
  if (state.moveAccepted && !has("trade")) return "trade";
  if (state.moveDone && !has("useful")) return "useful";
  return null;
}

/** The exact words for a stage under a roof. Summary returns the lead; the body is the person's own evidence. */
export function wording(stage: Stage, roof: Roof): string {
  const script = ROOFS[roof];
  return stage === "summary" ? script.summaryLead : script.questions[stage];
}

/** Compact text for the AI prompts, so every shaper follows the same script. */
export function formulaPrompt(formula: Formula | null): string {
  const f = formula ?? formulaFor("ISTJ");
  const s = f.script;
  return [
    `PERSON: ${s.keirsey} (${f.code}). Use ${s.words} words. They need to hear ${s.need}. Reflect ${s.reflects} first.`,
    `RHYTHM: ${f.rhythm === "E" ? "they think by talking — keep pulling, up to 3 rounds of the AWE question" : "they think first — ask 'And what else?' once, one bubble per turn, keep replies short"}.`,
    `CLOSE: ${f.closes === "dated" ? "the move carries a date and what done looks like" : "the move is the smallest first step; do not force a date"}.`,
    `SCRIPT (ask only these, in order, one per turn, after one sentence reflecting what they just said):`,
    `1 ${s.questions.mind}`,
    `2 ${s.questions.else} (repeat per RHYTHM until nothing new)`,
    `3 ${s.questions.challenge}`,
    `4 ${s.questions.want}`,
    `— at 100%: "${s.summaryLead}" + every point in their words —`,
    `5 ${s.questions.help}`,
    `6 ${s.questions.trade} (only after they accept the move by replying)`,
    `7 ${s.questions.useful} (the check-in after the move)`,
    `MOVE: one, shaped as ${s.moveShape}, stated as an if-then. Never before question 5 is answered.`,
    `NEVER: invent a question, narrow down ("what exactly", "roughly when"), ask two things, offer options.`,
  ].join("\n");
}
