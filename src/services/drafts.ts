import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { database } from "./storage";
import { taskForStep, type ThoughtDraft, type DraftStep } from "../drafts";
import { validateTask } from "../model";
async function db() {
  const connection = await database();
  await connection.execAsync(
    "CREATE TABLE IF NOT EXISTS flow_drafts (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);",
  );
  return connection;
}
export async function loadDrafts(): Promise<ThoughtDraft[]> {
  return (
    await (
      await db()
    ).getAllAsync<{ payload: string }>(
      "SELECT payload FROM flow_drafts ORDER BY rowid DESC",
    )
  ).map((r) => JSON.parse(r.payload));
}
export async function saveDraft(draft: ThoughtDraft) {
  await (
    await db()
  ).runAsync(
    "INSERT INTO flow_drafts(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    draft.id,
    JSON.stringify(draft),
  );
}
export async function acceptStep(draft: ThoughtDraft, step: DraftStep) {
  const connection = await db();
  const task = taskForStep(draft, step);
  validateTask(task);
  const write = async (tx: SQLiteDatabase) => {
    const row = await tx.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM flow_drafts WHERE id=?",
      draft.id,
    );
    if (!row) throw new Error("Save this draft first.");
    const latest: ThoughtDraft = JSON.parse(row.payload);
    const original = latest.steps.find((s) => s.id === step.id);
    if (!original) throw new Error("This draft changed. Open it again.");
    if (original.accepted) return;
    await tx.runAsync(
      "INSERT INTO records(id,kind,payload) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING",
      task.id,
      "task",
      JSON.stringify(task),
    );
    await tx.runAsync(
      "UPDATE flow_drafts SET payload=? WHERE id=?",
      JSON.stringify({
        ...latest,
        steps: latest.steps.map((s) =>
          s.id === step.id
            ? { ...s, accepted: true, deferred: false, chosenTitle: step.title }
            : s,
        ),
      }),
      draft.id,
    );
  };
  if (Platform.OS === "web")
    await connection.withTransactionAsync(() => write(connection));
  else await connection.withExclusiveTransactionAsync(write);
}
