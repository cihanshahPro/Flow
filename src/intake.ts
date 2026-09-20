import { shortTitle } from "./drafts.ts";

/**
 * The intake: one long dump, many subjects. Flow's first job is not to ask —
 * it is to show it caught everything and sort it into thread starters. The
 * model lists the subjects when it can; this local pass is the floor, so a
 * two-minute recording is never answered with a single question.
 */

export type Subject = { title: string; evidence: string };

/** Signposts people use when they change subject mid-dump, spoken or written. */
const OPENERS =
  /^(?:oh,? and|also|and also|plus|separately|another (?:thing|one)(?: is)?(?: that)?|on top of that|and then there'?s|and then the other (?:one|thing)(?: is)?|and i (?:also|still)|and i keep|i also|unrelated,?|different thing,?|then there'?s|next,?|other than that,?|apart from that,?|besides that,?|the (?:other|next|second|third|fourth|last) (?:thing|one)(?: is)?(?: that)?|one more thing|the first (?:thing|one)(?: is)?(?: that)?|first(?:ly)?,|second(?:ly)?,|third(?:ly)?,|lastly,?|finally,?|starting with)\b[,\s]*(?:regarding|about|to|that)?\s*/i;
/** Mid-sentence signposts that start a new item; the dump is cut there before sentences are read. */
const MID_SIGNPOSTS = /,?\s+(?:and\s+)?(?:then\s+)?(?=(?:the other (?:one|thing) is|another (?:one|thing) is|the (?:next|second|third|last) (?:one|thing) is|one more thing)\b)/gi;
const FIRST_ITEM = /^the first (?:thing|one)\b/i;
const LEAD =
  /^(?:(?:so|well|um|uh|like|basically|honestly|anyway|okay|ok|right|yeah|and|but|then)[,\s]+)*(?:(?:i|we) (?:really |also |still |just )?(?:need|have|want|got|ought|am supposed|are supposed) to |(?:i|we) (?:really |also |still )?(?:should|must|gotta|have got to) |(?:i|we) keep (?:meaning|forgetting|putting off|needing) to |(?:i'?m|i am|we'?re) (?:supposed|meant) to |(?:i'?m|i am|we'?re) (?:also |still )?(?:behind on|worried about|stuck on|late with|stressed about) |(?:i'?m |i am |i keep |i've been )?(?:thinking|worrying|wondering) about |(?:i'?m|i am|we'?re) (?:also |still |currently )?(?:doing|working on|trying to|dealing with) |(?:i|we) (?:am|are) (?:going to|gonna) |there'?s (?:also )?|(?:i|we) (?:still )?(?:haven'?t|have not|didn'?t|did not) )?/i;
const CONTINUES = /^(?:first|then|after that|once|next|it|it'?s|its|he|she|they|that|this|which|but|so|and then|i'?ve|i already|i just|i also already|i get those|one of (?:the|those) things|so that'?s|basically)\b/i;
const HANDS_OFF = /^(.{2,30}?)\s+(?:wants me to|needs me to|asked me to|is asking me to|keeps asking me to)\s+(.+)$/i;
const ABOUT = /^(.{2,30}?)\s+(?:wants|needs|is asking (?:me )?(?:about|for)|keeps asking (?:me )?(?:about|for)|is chasing (?:me )?(?:about|for))\s+(.+)$/i;
const STOP = new Set(
  "i me my mine we our us you your it its this that these those the a an and or but so because to of in on at for with from by as is are was were be been being have has had do does did not no yes if then than about into over just also very really can could would should will shall may might must there here what which who whom when where why how all any some more most other such only own same too s t don ve ll re d m still keep keeps meaning need needs want wants got get many things thing going lot lots stuff bit much right now mind kind sort example basically like".split(" "),
);

export function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/'s$/, ""))
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .replace(MID_SIGNPOSTS, ". ")
    .split(/(?<=[.!?])(?:\s+|(?=[A-Z]))|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

/** A thread name from the first sentence of a subject: the noun phrase, not the filler around it. */
export function subjectTitle(sentence: string): string {
  let body = sentence.replace(OPENERS, "").replace(/^[,\s]+/, "").replace(LEAD, "").trim();
  if (!body) body = sentence;
  // "My sister wants me to sort mum's dinner" is about the dinner, not the sister.
  const asked = body.match(HANDS_OFF) ?? body.match(ABOUT);
  if (asked && asked[1].split(/\s+/).length <= 3) body = asked[2];
  // The subject is the phrase before the verb ("the car insurance renewal"), when that phrase is a phrase.
  // Spoken dumps restate the thing in the second clause ("do an app, start doing an app portfolio"): the fuller head wins.
  const heads = body
    .split(/,\s*/)
    .slice(0, 2)
    .map((clause) => clause.replace(LEAD, "").replace(/^(?:start(?:ing)? (?:doing|to do|on)?|doing|do)\s+/i, "").trim())
    .map((clause) => clause.split(/\s+(?:is|are|was|were|keeps?|needs?|wants?|has|have|hasn'?t|haven'?t|by|at|because|so|but|which|that|who|where|before|after|until|since|and i|and my|and how|and the|and it)\b/i)[0].trim())
    .filter((h) => h && h.length <= 44);
  const head = heads.length > 1 && contentWords(heads[0]).size <= 1 && contentWords(heads[1]).size > contentWords(heads[0]).size ? heads[1] : heads[0] ?? "";
  const raw = (head.split(/\s+/).length >= 2 ? head : shortTitle(body, 40)).replace(/…$/, "").replace(/[.,;:!?]+$/, "").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function clip(s: string, max = 1200): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/**
 * Split a dump into subjects. A new subject starts at a change-of-subject
 * opener ("Also…") or when a sentence shares almost no vocabulary with the
 * one being built. Short sentences ride along with their neighbour.
 */
export function segmentDump(text: string): Subject[] {
  const parts = sentences(text);
  const groups: { sentences: string[]; words: Set<string> }[] = [];
  // A short dump with no change-of-subject words is one subject; only a real dump is cut on vocabulary alone.
  const long = parts.length >= 4;
  for (const s of parts) {
    const words = contentWords(s);
    const current = groups[groups.length - 1];
    const opener = OPENERS.test(s);
    if (!current) {
      // Filler ("So there's a lot going on.") is not a subject.
      if (words.size < 3 && !opener) continue;
      groups.push({ sentences: [s], words });
      continue;
    }
    const small = words.size < 3;
    const related = overlap(words, current.words) >= 0.25 || CONTINUES.test(s) || !long;
    // "Starting with a few things. The first one is…": the intro sentence belongs to the first item.
    const intro = FIRST_ITEM.test(s) && current.sentences.length === 1;
    if (small || intro || (!opener && related) || (opener && overlap(words, current.words) >= 0.6)) {
      current.sentences.push(s);
      for (const w of words) current.words.add(w);
    } else groups.push({ sentences: [s], words });
  }
  const out: Subject[] = [];
  for (const g of groups) {
    if (g.words.size < 3 && out.length) {
      out[out.length - 1].evidence = clip(out[out.length - 1].evidence + " " + g.sentences.join(" "));
      continue;
    }
    const title = subjectTitle(g.sentences.find((x) => FIRST_ITEM.test(x)) ?? g.sentences[0]);
    if (title.length < 4) continue;
    if (out.some((o) => same(o.title, title))) continue;
    out.push({ title, evidence: clip(g.sentences.join(" ")) });
  }
  return out;
}

function same(a: string, b: string): boolean {
  const x = contentWords(a), y = contentWords(b);
  return x.size > 0 && y.size > 0 && overlap(x, y) >= 0.8;
}

/**
 * The subjects of a dump: the local groups, named by the model where it
 * listed the same subject (its titles are better; its evidence is a short
 * quote), plus any grounded subject the model found that the local pass
 * missed, widened to its whole sentence. Order follows the text. At most
 * eight; one subject means an ordinary thread.
 */
export function subjectsOf(text: string, listed: Subject[] = []): Subject[] {
  const normalized = text.replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const grounded = listed
    .map((b) => ({ title: b.title.trim().replace(/[.,;:!?]+$/, ""), evidence: b.evidence.replace(/\s+/g, " ").trim() }))
    .filter((b) => b.title.length >= 3 && b.title.length <= 60 && b.evidence && lower.includes(b.evidence.toLowerCase()));
  const local = segmentDump(text);
  const used = new Set<number>();
  const out: Subject[] = local.map((l) => {
    const i = grounded.findIndex((g, k) => !used.has(k) && l.evidence.toLowerCase().includes(g.evidence.toLowerCase()));
    if (i >= 0) {
      used.add(i);
      return { title: capitalise(grounded[i].title), evidence: l.evidence };
    }
    return l;
  });
  grounded.forEach((g, k) => {
    if (used.has(k)) return;
    const sentence = sentences(normalized).find((x) => x.toLowerCase().includes(g.evidence.toLowerCase())) ?? g.evidence;
    if (out.some((o) => same(o.title, g.title) || o.evidence.toLowerCase().includes(sentence.toLowerCase()))) return;
    out.push({ title: capitalise(g.title), evidence: clip(sentence) });
  });
  const position = (s: Subject) => lower.indexOf(s.evidence.slice(0, 40).toLowerCase());
  return out.sort((a, b) => position(a) - position(b)).slice(0, 8);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
