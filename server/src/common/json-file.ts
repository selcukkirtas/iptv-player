import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';

/** Reads and parses a JSON file, returning `fallback` if it does not exist. */
export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

/**
 * Writes JSON atomically: write to a temp file, then rename over the target so
 * a crash mid-write cannot leave a corrupted file.
 */
export async function writeJsonAtomic(
  path: string,
  data: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, path);
}
