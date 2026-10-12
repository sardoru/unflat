"use client";

export interface MyManual {
  id: string;
  name: string;
  type: string;
  steps: number;
  createdAt: string;
}

const KEY = "unflat.mine";
const EMPTY: MyManual[] = [];
let cache: { raw: string | null; list: MyManual[] } = { raw: null, list: EMPTY };

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Manuals made in this browser (ids only live here; nothing is listed publicly). Stable between changes. */
export function loadMine(): MyManual[] {
  const raw = read();
  if (raw === cache.raw) return cache.list;
  let list = EMPTY;
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) list = (parsed as MyManual[]).filter((m) => m && typeof m.id === "string").slice(0, 50);
  } catch {}
  cache = { raw, list };
  return list;
}

export function subscribeMine(onChange: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function rememberMine(m: MyManual): void {
  try {
    const list = [m, ...loadMine().filter((x) => x.id !== m.id)].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}
