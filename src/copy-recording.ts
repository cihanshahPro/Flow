/** The slice of an expo-file-system File that copying a recording needs. */
export interface CopyFile<D = any> {
  uri: string;
  exists: boolean;
  size: number | null;
  copy(to: D): void | Promise<void>;
  create(): void;
  write(bytes: Uint8Array): void;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const usable = (f: CopyFile<any>) => f.exists && !!f.size;

/**
 * Copies a finished recording into app storage. File.copy is async in SDK 57 (awaiting it fixes the iOS "Retry saving note" bug); if it still
 * yields no file, fall back to writing the bytes. `reopen` returns a fresh
 * handle because a handle used before the copy can report stale metadata afterwards.
 */
export async function copyRecording<D extends CopyFile>(source: CopyFile<D>, reopen: () => D): Promise<D> {
  let destination = reopen();
  if (!destination.exists) await source.copy(destination);
  destination = reopen();
  if (!usable(destination)) {
    try {
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (!destination.exists) destination.create();
      destination.write(bytes);
    } catch (error) {
      console.warn("[Flow voice] byte-copy fallback failed", error);
    }
    destination = reopen();
  }
  if (!usable(destination)) throw new Error("The recording could not be saved to this device.");
  return destination;
}
