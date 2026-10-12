import { normalizeSpec } from "../spec/normalize";
import type { ManualRecord } from "../spec/types";
import { DEMOS } from "../demos";
import { store } from "./store";

const ID = /^[a-z0-9-]{3,40}$/;

export interface StoredManual extends ManualRecord {
  /** Keyed hash of the session that made it (never sent to viewers). */
  owner?: string;
  pageCount?: number;
}

export async function saveManual(rec: StoredManual): Promise<void> {
  await store.putJson(`manuals/${rec.id}.json`, rec);
}

export async function loadManual(id: string): Promise<StoredManual | null> {
  if (!ID.test(id)) return null;
  const demo = DEMOS[id];
  if (demo) return demo;
  const rec = await store.getJson<StoredManual>(`manuals/${id}.json`);
  if (!rec) return null;
  // Stored specs went through the normalizer when saved; run it again so an old or edited record can't break the viewer.
  const { spec } = normalizeSpec(rec.spec);
  return { ...rec, spec };
}

export async function savePage(id: string, n: number, bytes: Uint8Array): Promise<void> {
  await store.putBytes(`pages/${id}/${n}.jpg`, bytes, "image/jpeg");
}

export async function loadPage(id: string, n: number) {
  if (!ID.test(id) || !Number.isInteger(n) || n < 1 || n > 400) return null;
  return store.getBytes(`pages/${id}/${n}.jpg`);
}
