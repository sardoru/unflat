import { json } from "@/lib/server/http";
import { store } from "@/lib/server/store";

const HOUR = 3600_000;

/**
 * Daily housekeeping (Vercel Cron, see vercel.json): uploads abandoned before the
 * BUILD pass, spent tickets, and old usage-ledger days. Saved manuals are kept.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  const now = Date.now();
  const old = async (prefix: string, maxAge: number) => (await store.listAged(prefix)).filter((b) => now - b.at > maxAge).map((b) => b.path);
  const uploads = await old("src/", 6 * HOUR);
  const tickets = await old("tickets/", 48 * HOUR);
  const usage = await old("usage/", 30 * 24 * HOUR);
  const all = [...uploads, ...tickets, ...usage];
  for (let i = 0; i < all.length; i += 500) await store.del(all.slice(i, i + 500));
  return json({ uploads: uploads.length, tickets: tickets.length, usage: usage.length });
}
