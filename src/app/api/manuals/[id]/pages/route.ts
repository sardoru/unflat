import { json } from "@/lib/server/http";
import { tag } from "@/lib/server/ids";
import { loadManual, saveManual, savePage } from "@/lib/server/manuals";
import { sniff } from "@/lib/server/screen";
import { readSession } from "@/lib/server/session";

const MAX_PAGE_BYTES = 450 * 1024;

/** The maker of a manual attaches small images of the original pages (shown next to each step). */
export async function POST(req: Request, ctx: RouteContext<"/api/manuals/[id]/pages">) {
  const { id } = await ctx.params;
  const session = await readSession();
  if (!session) return json({ error: "Not signed in." }, 401);
  const rec = await loadManual(id);
  if (!rec || !rec.owner || rec.owner !== tag(session.sid)) return json({ error: "Not your manual." }, 403);
  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Bad request." }, 400);
  let top = rec.pageCount ?? 0;
  const limit = Math.min(400, rec.source.pages || 60);
  for (const [key, value] of form.entries()) {
    const m = /^p(\d{1,3})$/.exec(key);
    if (!m || typeof value === "string") continue;
    const n = Number(m[1]);
    if (n < 1 || n > limit || value.size > MAX_PAGE_BYTES) continue;
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (sniff(bytes) !== "image/jpeg") continue;
    await savePage(id, n, bytes);
    top = Math.max(top, n);
  }
  if (top !== rec.pageCount) await saveManual({ ...rec, pageCount: top });
  return json({ ok: true, pages: top });
}
