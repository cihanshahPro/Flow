import { File } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { database } from "./storage";

async function tableExists(name: string) {
  const db = await database();
  return !!(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name));
}

/** Everything Flow keeps on this phone as readable JSON (recordings excluded). */
export async function exportAllData(): Promise<string> {
  const db = await database();
  const records = (await db.getAllAsync<{ id: string; kind: string; payload: string }>("SELECT id,kind,payload FROM records")).map((r) => ({
    id: r.id,
    kind: r.kind,
    data: JSON.parse(r.payload),
  }));
  const threads = (await tableExists("flow_drafts"))
    ? (await db.getAllAsync<{ payload: string }>("SELECT payload FROM flow_drafts")).map((r) => JSON.parse(r.payload))
    : [];
  return JSON.stringify({ app: "Flow", exportedAt: new Date().toISOString(), records, threads }, null, 2);
}

/** Permanently removes every record, thread, recording file and scheduled reminder. */
export async function deleteAllData(): Promise<void> {
  const db = await database();
  const rows = await db.getAllAsync<{ payload: string }>("SELECT payload FROM records WHERE kind='note'");
  for (const r of rows) {
    try {
      const uri = JSON.parse(r.payload).audioUri;
      if (uri) {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
    } catch {}
  }
  for (const t of ["records", "flow_drafts", "calendar_links", "preferences"]) {
    if (await tableExists(t)) await db.runAsync(`DELETE FROM ${t}`);
  }
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
