export const harness = {
  notes: [],
  drafts: [],
  fetches: 0,
  failDraft: false,
  offline: false,
  writes: [],
  reset() {
    this.notes = [];
    this.drafts = [];
    this.fetches = 0;
    this.failDraft = false;
    this.offline = false;
    this.writes = [];
  },
};
export class File {
  exists = true;
  size = 100;
  constructor(uri) {
    this.uri = uri;
  }
}
export async function fetch() {
  harness.fetches++;
  if (harness.offline) throw Error("network failed");
  return {
    ok: true,
    json: async () => ({
      text: "Call Alex about the website. Then email the designer.",
    }),
  };
}
export async function loadWorkspace() {
  return { notes: harness.notes, tasks: [] };
}
export async function saveNote(note) {
  harness.writes.push("transcript");
  harness.notes = [structuredClone(note)];
}
export async function loadDrafts() {
  return harness.drafts;
}
export async function saveDraft(draft) {
  if (harness.failDraft) throw Error("draft storage busy");
  harness.writes.push("draft");
  harness.drafts = [structuredClone(draft)];
}
