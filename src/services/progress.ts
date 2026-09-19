import { Platform } from "react-native";
import type { SQLiteDatabase } from "expo-sqlite";
import { database } from "./storage";
import { newProfile, type Profile } from "../personality.ts";
import type { Task } from "../model.ts";
import type { ThoughtDraft } from "../drafts.ts";
import { reconcileProgress, type ProgressRecord } from "../progress.ts";

const progressId = "flow-progress-v1";
let queue: Promise<unknown> = Promise.resolve();

// Read from SQLite rather than caller snapshots. The queue prevents overlapping
// reconciliations from replacing newer earned IDs with an older UI snapshot.
export function syncProgress(): Promise<ProgressRecord> {
  const result = queue.then(async () => {
    const connection = await database();
    await connection.execAsync(
      "CREATE TABLE IF NOT EXISTS flow_drafts (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);",
    );
    let saved: ProgressRecord | undefined;
    const reconcile = async (tx: SQLiteDatabase) => {
      const rows = await tx.getAllAsync<{
        id: string;
        kind: string;
        payload: string;
      }>(
        "SELECT id,kind,payload FROM records WHERE kind IN ('profile','task','progress') ORDER BY rowid ASC",
      );
      const profileRow = rows.find(
        (row) => row.kind === "profile" && row.id === "flow-profile-v1",
      );
      const profileValue = profileRow
        ? JSON.parse(profileRow.payload)
        : undefined;
      const profile: Profile =
        profileValue?.version === 1 ? profileValue : newProfile();
      const previousRow = rows.find(
        (row) => row.kind === "progress" && row.id === progressId,
      );
      const previousValue = previousRow
        ? JSON.parse(previousRow.payload)
        : undefined;
      // Do not overwrite an unknown future format or damaged award ledger.
      if (
        previousValue &&
        (previousValue.version !== 1 ||
          !Array.isArray(previousValue.completedTaskIds) ||
          previousValue.completedTaskIds.some(
            (id: unknown) => typeof id !== "string",
          ) ||
          (previousValue.unlockedAt !== undefined &&
            typeof previousValue.unlockedAt !== "string"))
      )
        throw new Error(
          "Your saved accomplishments could not be read. Please try again after updating Flow.",
        );
      const tasks: Task[] = rows
        .filter((row) => row.kind === "task")
        .map((row) => JSON.parse(row.payload));
      const draftRows = await tx.getAllAsync<{ payload: string }>(
        "SELECT payload FROM flow_drafts",
      );
      const drafts: ThoughtDraft[] = draftRows.map((row) =>
        JSON.parse(row.payload),
      );
      const next = reconcileProgress(previousValue, profile, tasks, drafts);
      if (JSON.stringify(previousValue) !== JSON.stringify(next)) {
        await tx.runAsync(
          "INSERT INTO records(id,kind,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
          progressId,
          "progress",
          JSON.stringify(next),
        );
      }
      saved = next;
    };
    if (Platform.OS === "web")
      await connection.withTransactionAsync(() => reconcile(connection));
    else await connection.withExclusiveTransactionAsync(reconcile);
    // State is returned only after the transaction commits successfully.
    if (!saved)
      throw new Error(
        "Your accomplishments could not be saved. Please try again.",
      );
    return saved;
  });
  queue = result.catch(() => undefined);
  return result;
}
