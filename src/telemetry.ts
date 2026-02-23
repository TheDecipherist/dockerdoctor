import { getVersion } from './version.js';

const UPDATE_URL = 'https://updates.dockerdoctor.com/check';

export interface UpdateInfo {
  latest: string;
  current: string;
  updateAvailable: boolean;
}

let updatePromise: Promise<UpdateInfo | null> | null = null;

/**
 * Fire-and-forget update check at startup.
 * Sends only the current CLI version. Never throws, never blocks.
 */
export function checkForUpdates(): void {
  updatePromise = doCheck();
}

/**
 * Get the result of the update check (if it has completed).
 * Returns null if the check hasn't finished, failed, or no update is available.
 * Waits up to 500ms for the check to complete so it doesn't delay the CLI.
 */
export async function getUpdateInfo(): Promise<UpdateInfo | null> {
  if (!updatePromise) return null;
  try {
    return await Promise.race([
      updatePromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
  } catch {
    return null;
  }
}

async function doCheck(): Promise<UpdateInfo | null> {
  try {
    const current = getVersion();
    const res = await fetch(UPDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: current }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { latest?: string };
    if (!data.latest) return null;
    const updateAvailable = data.latest !== current;
    return { latest: data.latest, current, updateAvailable };
  } catch {
    return null;
  }
}
