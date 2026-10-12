"use client";

import { useSyncExternalStore } from "react";
import { loadMine, subscribeMine, type MyManual } from "@/lib/client/mine";

const NONE: MyManual[] = [];

export default function MyManuals() {
  const list = useSyncExternalStore(subscribeMine, loadMine, () => NONE);
  if (!list.length) return null;
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="mine">
      <p className="label">In this browser</p>
      <h2 id="mine" className="mt-1 text-xl font-semibold tracking-tight text-ink">Your manuals</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <li key={m.id}>
            {/* /m/[id] is a route handler serving a standalone HTML document, not a Next page */}
            <a href={`/m/${m.id}`} className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-2">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{[m.name, m.type].filter(Boolean).join(" ")}</span>
                <span className="label">{m.steps} steps · {new Date(m.createdAt).toLocaleDateString()}</span>
              </span>
              <span aria-hidden className="text-ink-3">→</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
