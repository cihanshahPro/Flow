// Counters only. No note content ever reaches this module.
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export const monthKey = (d: Date) => `install:${d.toISOString().slice(0, 7)}`;
export const dayKey = (d: Date) => `global:${d.toISOString().slice(0, 10)}`;
export const nextMonthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();

async function read(kv: KV, key: string): Promise<number> {
  const n = Number(await kv.get(key));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function installUsed(kv: KV, install: string, now: Date) {
  return read(kv, `${monthKey(now)}:${install}`);
}
export async function recordInstallUse(kv: KV, install: string, now: Date, used: number) {
  await kv.put(`${monthKey(now)}:${install}`, String(used + 1), { expirationTtl: 60 * 60 * 24 * 40 });
}

/** Counts an attempt against the global daily cap. Returns false once the cap is reached. */
export async function takeGlobal(kv: KV, now: Date, cap: number): Promise<boolean> {
  const key = dayKey(now);
  const used = await read(kv, key);
  if (used >= cap) return false;
  await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 36 });
  return true;
}
