import { database } from "./storage";
import { newProfile, type Profile } from "../personality";
export async function loadProfile(): Promise<Profile> {
  const row = await (
    await database()
  ).getFirstAsync<{ payload: string }>(
    "SELECT payload FROM records WHERE id='flow-profile-v1' AND kind='profile'",
  );
  if (!row) return newProfile();
  const value = JSON.parse(row.payload);
  return value.version === 1 ? value : newProfile();
}
export async function saveProfile(profile: Profile) {
  await (
    await database()
  ).runAsync(
    "INSERT INTO records(id,kind,payload) VALUES ('flow-profile-v1','profile',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    JSON.stringify(profile),
  );
}
