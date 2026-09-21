/** Word tools shared by the intake and the map (kept apart so neither imports the other). */
/** Mid-sentence signposts that start a new item; the dump is cut there before sentences are read. */
const MID_SIGNPOSTS = /,?\s+(?:and\s+)?(?:then\s+)?(?=(?:the other (?:one|thing) is|another (?:one|thing) is|the (?:next|second|third|last) (?:one|thing) is|one more thing)\b)/gi;
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

