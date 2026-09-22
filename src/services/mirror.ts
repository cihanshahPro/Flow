import Constants from "expo-constants";
import { fetch } from "expo/fetch";
import { exportAllData } from "./data";
import { devLanConfig } from "./processors";
import { installId } from "./ai-state";

declare const __DEV__: boolean | undefined;

/** The commit this bundle was built from ("dev" when unknown). */
export function buildStamp(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { build?: string };
  return extra.build ?? "dev";
}

let last = "";
/**
 * Development only: mirror the phone's data (threads, tasks, notes, intake
 * records) to the Mac mini after every change, so the person's real data can
 * be read and replayed there without them exporting anything. Never runs in
 * a release build; the LAN token gates it.
 */
export async function mirrorToDev(reason = ""): Promise<boolean> {
  if (typeof __DEV__ === "undefined" || !__DEV__) return false;
  const lan = devLanConfig();
  if (!lan) return false;
  try {
    const body = await exportAllData();
    if (body === last) return true;
    const res = await fetch(lan.url + "/mirror", {
      method: "POST",
      headers: { Authorization: "Bearer " + lan.token, "Content-Type": "application/json" },
      body: JSON.stringify({ install: await installId(), build: buildStamp(), reason, data: JSON.parse(body) }),
    });
    if (res.ok) last = body;
    return res.ok;
  } catch {
    return false;
  }
}
