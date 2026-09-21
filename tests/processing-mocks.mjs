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
  /** The intake: the plan the LAN processor answers with (null = local pass), the calendar, and what Flow wrote to the phone. */
  plan: null,
  events: [],
  tasks: [],
  calendarWrites: [],
  reset() {
    this.native = null;
    this.ai = {};
    this.cloud = { status: 200, body: null, fail: null };
    this.plan = null;
    this.events = [];
    this.tasks = [];
    this.calendarWrites = [];
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
  if (url.endsWith("/plan")) {
    return { ok: !!harness.plan, status: harness.plan ? 200 : 503, json: async () => (harness.plan ? { plan: harness.plan } : { error: "no plan" }) };
  }
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
  return { notes: harness.notes, tasks: harness.tasks };
}
export async function listRecordIds(kind) {
  return (harness.records ?? []).filter((r) => r.kind === kind).map((r) => r.id);
}
export async function saveRecord(kind, id, payload) {
  harness.records = [...(harness.records ?? []).filter((r) => r.id !== id), { kind, id, payload: structuredClone(payload) }];
}
export async function saveTask(task) {
  harness.tasks = [...harness.tasks.filter((t) => t.id !== task.id), structuredClone(task)];
}
// calendar-read stand-ins
export async function readWeek() {
  return harness.events;
}
export async function calendarConnected() {
  return true;
}
export async function writePlanEvent(input) {
  harness.calendarWrites.push({ kind: "event", ...input });
  return "evt-" + harness.calendarWrites.length;
}
export async function writeReminder(input) {
  harness.calendarWrites.push({ kind: "reminder", ...input });
  return { id: "rem-" + harness.calendarWrites.length, via: "reminders" };
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
