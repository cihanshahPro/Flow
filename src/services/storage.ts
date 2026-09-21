import * as SQLite from "expo-sqlite";
import type { Note, Task } from "../model";
import { validateTask } from "../model";

let connection: Promise<SQLite.SQLiteDatabase> | undefined;
export function database() {
  if (!connection)
    connection = SQLite.openDatabaseAsync("anchor-mobile.db")
      .then(async (db) => {
        await db.execAsync(
          "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL); PRAGMA user_version = 1;",
        );
        return db;
      })
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  return connection;
}
export async function loadWorkspace(): Promise<{
  tasks: Task[];
  notes: Note[];
}> {
  const rows = await (
    await database()
  ).getAllAsync<{ kind: string; payload: string }>(
    "SELECT kind, payload FROM records ORDER BY rowid DESC",
  );
  return {
    tasks: rows
      .filter((r) => r.kind === "task")
      .map((r) => JSON.parse(r.payload)),
    notes: rows
      .filter((r) => r.kind === "note")
      .map((r) => JSON.parse(r.payload)),
  };
}
export async function saveTask(task: Task) {
  validateTask(task);
  await (
    await database()
  ).runAsync(
    "INSERT INTO records (id,kind,payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    task.id,
    "task",
    JSON.stringify(task),
  );
}
export async function saveNote(note: Note) {
  if (!note.title.trim() || (!note.text.trim() && !note.audioUri))
    throw new Error("Write a thought or record some audio first.");
  if (note.text.length > 20000)
    throw new Error("Keep each text note under 20,000 characters.");
  await (
    await database()
  ).runAsync(
    "INSERT INTO records (id,kind,payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    note.id,
    "note",
    JSON.stringify(note),
  );
}
export async function registerVoiceNote(note: Note) {
  if (!note.audioUri || !note.title.trim())
    throw new Error("The recording is missing its saved audio file.");
  // Retrying registration must not overwrite an explicit edit made after an earlier commit.
  await (
    await database()
  ).runAsync(
    "INSERT INTO records (id,kind,payload) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING",
    note.id,
    "note",
    JSON.stringify(note),
  );
}
export async function removeTask(id: string) {
  await (
    await database()
  ).runAsync("DELETE FROM records WHERE id=? AND kind=?", id, "task");
}

/** Anything else worth keeping as one JSON row (intake records for replay, etc.). */
export async function saveRecord(kind: string, id: string, payload: unknown) {
  await (
    await database()
  ).runAsync(
    "INSERT INTO records (id,kind,payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    id,
    kind,
    JSON.stringify(payload),
  );
}

export async function listRecordIds(kind: string): Promise<string[]> {
  const rows = await (await database()).getAllAsync<{ id: string }>("SELECT id FROM records WHERE kind=?", kind);
  return rows.map((r) => r.id);
}
