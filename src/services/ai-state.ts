import { randomUUID } from "expo-crypto";
import { database } from "./storage";
import type { AiState, Consent, QuotaRecord } from "../ai-policy";

// Cloud consent, the anonymous install ID and the local free-quota counter.
// The server re-checks quota in phase 2b; this copy only avoids wasted calls.
const ID = "flow-ai-v1";

export async function loadAiState(): Promise<AiState> {
  const row = await (await database()).getFirstAsync<{ payload: string }>(
    "SELECT payload FROM records WHERE id=? AND kind='ai'",
    ID,
  );
  try {
    return row ? (JSON.parse(row.payload) as AiState) : {};
  } catch {
    return {};
  }
}

async function saveAiState(state: AiState) {
  await (await database()).runAsync(
    "INSERT INTO records(id,kind,payload) VALUES (?,'ai',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    ID,
    JSON.stringify(state),
  );
}

export async function setCloudConsent(consent: Consent) {
  await saveAiState({ ...(await loadAiState()), consent });
}

export async function setQuota(quota: QuotaRecord) {
  await saveAiState({ ...(await loadAiState()), quota });
}

/** Random per-install ID; not tied to the person or the device hardware. */
export async function installId(): Promise<string> {
  const state = await loadAiState();
  if (state.installId) return state.installId;
  const id = randomUUID();
  await saveAiState({ ...state, installId: id });
  return id;
}
