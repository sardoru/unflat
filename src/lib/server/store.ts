/**
 * Private storage: a private Vercel Blob store in production, an in-memory map in
 * local development (nothing persists across restarts there).
 */
import { del, get, list, put } from "@vercel/blob";
import { ENV } from "./config";

export interface StoredBytes {
  bytes: Uint8Array;
  contentType: string;
}

const mem = new Map<string, StoredBytes>();
const g = globalThis as { __unflatMem?: Map<string, StoredBytes> };
const memStore = (g.__unflatMem ??= mem);

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export const store = {
  async putBytes(path: string, bytes: Uint8Array | string, contentType: string, overwrite = true): Promise<void> {
    if (bytes.length === 0) throw new Error("store: empty body"); // same rule as Blob, so dev catches it too
    if (!ENV.blob) {
      if (!overwrite && memStore.has(path)) throw new Error("exists");
      memStore.set(path, { bytes: typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes, contentType });
      return;
    }
    await put(path, typeof bytes === "string" ? bytes : Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: overwrite,
      contentType,
      cacheControlMaxAge: 60,
    });
  },

  async putJson(path: string, data: unknown, overwrite = true): Promise<void> {
    await this.putBytes(path, JSON.stringify(data), "application/json", overwrite);
  },

  async getBytes(path: string): Promise<StoredBytes | null> {
    if (!ENV.blob) return memStore.get(path) ?? null;
    const r = await get(path, { access: "private", useCache: false });
    if (!r || !r.stream) return null;
    return { bytes: await readStream(r.stream), contentType: r.blob.contentType ?? "application/octet-stream" };
  },

  async getJson<T>(path: string): Promise<T | null> {
    const r = await this.getBytes(path);
    if (!r) return null;
    try {
      return JSON.parse(new TextDecoder().decode(r.bytes)) as T;
    } catch {
      return null;
    }
  },

  /** Pathnames under a prefix (strongly consistent: listing is not cached). */
  async list(prefix: string): Promise<string[]> {
    if (!ENV.blob) return [...memStore.keys()].filter((k) => k.startsWith(prefix));
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix, limit: 1000, cursor });
      out.push(...r.blobs.map((b) => b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  },

  async del(paths: string[]): Promise<void> {
    if (!paths.length) return;
    if (!ENV.blob) {
      for (const p of paths) memStore.delete(p);
      return;
    }
    await del(paths);
  },

  /** Write a marker once; false when it already existed (single-use tokens). */
  async createOnce(path: string): Promise<boolean> {
    try {
      await this.putBytes(path, "1", "text/plain", false);
      return true;
    } catch {
      return false;
    }
  },
};
