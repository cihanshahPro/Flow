export const Platform = { OS: "ios" };
export const db = {
  drafts: new Map(),
  records: new Map(),
  reset() { this.drafts.clear(); this.records.clear(); },
};
const conn = {
  execAsync: async () => {},
  getAllAsync: async () => [...db.drafts.values()].map((payload) => ({ payload })),
  getFirstAsync: async (_q, id) => (db.drafts.has(id) ? { payload: db.drafts.get(id) } : null),
  runAsync: async (q, ...a) => {
    if (q.startsWith("INSERT INTO records")) { if (!db.records.has(a[0])) db.records.set(a[0], a[2]); }
    else if (q.startsWith("UPDATE flow_drafts")) db.drafts.set(a[1], a[0]);
    else if (q.startsWith("INSERT INTO flow_drafts")) db.drafts.set(a[0], a[1]);
  },
  withExclusiveTransactionAsync: async (fn) => fn(conn),
  withTransactionAsync: async (fn) => fn(),
};
export async function database() { return conn; }
