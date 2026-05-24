/** Persistent activity log stored in localStorage, keyed per wallet address. */

export interface ActivityEntry {
  hash: string;
  ts: number;
  action: string;
  detail: string;
}

const MAX_ENTRIES = 50;

function storageKey(address: string) {
  return `helix_activity_${address.toLowerCase()}`;
}

export function getActivity(address: string): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    return JSON.parse(raw) as ActivityEntry[];
  } catch {
    return [];
  }
}

export function addActivity(address: string, entry: Omit<ActivityEntry, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getActivity(address);
    const next: ActivityEntry[] = [
      { ...entry, ts: Date.now() },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    localStorage.setItem(storageKey(address), JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently skip
  }
}

export function clearActivity(address: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(address));
  } catch {
    // ignore
  }
}
