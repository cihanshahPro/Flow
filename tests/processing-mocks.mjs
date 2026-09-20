export const harness = {
  notes: [],
  drafts: [],
  fetches: 0,
  requests: [],
  shape: undefined,
  failDraft: false,
  offline: false,
  writes: [],
  /** Native module stand-in; null = Expo Go / no native build. */
  native: null,
  ai: {},
  cloud: { status: 200, body: null, fail: null },
  reset() {
    this.native = null;
    this.ai = {};
    this.cloud = { status: 200, body: null, fail: null };
    this.notes = [];
    this.drafts = [];
    this.fetches = 0;
    this.requests = [];
    this.shape = undefined;
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
export async function fetch(url, options) {
  harness.requests.push({ ...options, url });
  harness.fetches++;
  if (harness.offline) throw Error("network failed");
  if (url.endsWith("/v1/shape")) {
    if (harness.cloud.fail) throw Error(harness.cloud.fail);
    return {
      ok: harness.cloud.status < 300,
      status: harness.cloud.status,
      json: async () => harness.cloud.body,
    };
  }
  return {
    ok: true,
    json: async () => ({
      text: "Call Alex about the website. Then email the designer.",
      shape: harness.shape,
    }),
  };
}
export async function loadWorkspace() {
  return { notes: harness.notes, tasks: [] };
}
export async function loadProfile() {
  return { version: 1, answers: [], stage: "intro", areaIndex: 0, areas: {} };
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
  // Upsert by id, like the real store.
  harness.drafts = [...harness.drafts.filter((d) => d.id !== draft.id), structuredClone(draft)];
}

export async function loadAiState() {
  return structuredClone(harness.ai);
}
export async function setCloudConsent(consent) {
  harness.ai = { ...harness.ai, consent };
}
export async function setQuota(quota) {
  harness.ai = { ...harness.ai, quota };
}
export async function installId() {
  return "install-test";
}
export const FlowIntelligence = new Proxy(
  {},
  {
    get(_, key) {
      return harness.native?.[key];
    },
  },
);
