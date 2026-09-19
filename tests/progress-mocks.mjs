import { DatabaseSync } from "node:sqlite";
export const Platform = { OS: "ios" };
export const harness = {
  db: null,
  failWrite: false,
  failCommit: false,
  writes: 0,
  activeTransactions: 0,
  maxTransactions: 0,
  reset() {
    this.db?.close();
    this.db = new DatabaseSync(":memory:");
    this.db.exec(
      "CREATE TABLE records (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE flow_drafts (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);",
    );
    this.failWrite = false;
    this.failCommit = false;
    this.writes = 0;
    this.activeTransactions = 0;
    this.maxTransactions = 0;
    Platform.OS = "ios";
  },
  saveRecord(id, kind, value) {
    this.db
      .prepare("INSERT OR REPLACE INTO records VALUES (?,?,?)")
      .run(id, kind, JSON.stringify(value));
  },
  progress() {
    const row = this.db
      .prepare("SELECT payload FROM records WHERE id='flow-progress-v1'")
      .get();
    return row ? JSON.parse(row.payload) : undefined;
  },
};
const transaction = async (callback) => {
  harness.activeTransactions++;
  harness.maxTransactions = Math.max(
    harness.maxTransactions,
    harness.activeTransactions,
  );
  harness.db.exec("BEGIN EXCLUSIVE TRANSACTION");
  try {
    await callback(adapter);
    if (harness.failCommit) throw new Error("commit failed");
    harness.db.exec("COMMIT");
  } catch (error) {
    harness.db.exec("ROLLBACK");
    throw error;
  } finally {
    harness.activeTransactions--;
  }
};
const adapter = {
  async execAsync(sql) {
    harness.db.exec(sql);
  },
  async getAllAsync(sql, ...params) {
    return harness.db.prepare(sql).all(...params);
  },
  async runAsync(sql, ...params) {
    if (harness.failWrite) throw new Error("storage busy");
    harness.writes++;
    return harness.db.prepare(sql).run(...params);
  },
  withTransactionAsync: transaction,
  withExclusiveTransactionAsync: transaction,
};
export async function database() {
  return adapter;
}
