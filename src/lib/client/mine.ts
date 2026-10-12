"use client";

export interface MyManual {
  id: string;
  name: string;
  type: string;
  steps: number;
  createdAt: string;
}

const KEY = "unflat.mine";

/** Manuals made in this browser (ids only live here; nothing is listed publicly). */
export function loadMine(): MyManual[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as MyManual[]).filter((m) => m && typeof m.id === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function rememberMine(m: MyManual): void {
  try {
    const list = [m, ...loadMine().filter((x) => x.id !== m.id)].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}
