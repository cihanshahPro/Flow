// Dev: walk one dump through the script for a given type. node --experimental-strip-types scripts/sim-thread.mjs ENTJ
import { respondToRecording, understoodPercent, answerChip } from "../src/thread.ts";
import { suggestDraft } from "../src/drafts.ts";
import { formulaFor } from "../src/formula.ts";
const code = process.argv[2] ?? "ISTJ";
const formula = formulaFor(code);
const now = new Date("2026-09-21T09:00:00");
let t = suggestDraft("t1", "Work project is behind because the designer keeps missing deadlines and my manager wants a demo Friday. Also the landlord is asking about the lease renewal.", now);
const awe = ["Three of five screens are done, the last two are with the designer and he keeps going quiet for days", "his boss will be in the room", "that's it"];
const replies = [
  ...awe.slice(0, formula.elseRounds),
  "that it looks like it's on me when it's the designer",
  "show up Friday with the delay clearly not mine and still have something to show",
  "tell me what to say to my manager",
  "message my manager tonight",
  "nothing really. do it",
];
let n = 0;
const show = () => {
  for (const m of t.messages.slice(n)) console.log(`${m.from === "you" ? "  YOU" : "FLOW "}${m.stage ? "[" + m.stage + "]" : ""}${m.chips ? "{" + m.chips.map((c) => c.label).join("/") + "}" : ""}: ${m.text}`);
  n = t.messages.length;
  console.log(`   —— ${understoodPercent(t, formula)}%`);
};
t = respondToRecording(t, "n0", t.source, { formula, now });
show();
const branch = t.messages.find((m) => m.kind === "branch" && !m.answered);
if (branch) { t = answerChip(t, branch.id, "split", { formula, now }).thread; show(); }
for (const [i, r] of replies.entries()) {
  const open = t.messages.filter((m) => m.from === "flow" && !m.answered && ["question", "offer"].includes(m.kind)).at(-1);
  if (!open) { console.log("   (nothing open; stop)"); break; }
  t = respondToRecording(t, "n" + (i + 1), r, { formula, now });
  show();
}
console.log("steps:", t.steps.map((s) => `${s.title}${s.accepted ? " ✓" : ""}`));
