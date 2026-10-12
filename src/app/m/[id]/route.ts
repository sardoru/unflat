import { loadManual } from "@/lib/server/manuals";
import { htmlResponse, originOf } from "@/lib/server/viewer";
import { notFoundHtml } from "@/lib/server/not-found";

/** The manual itself: one self-contained page, the same file people download. */
export async function GET(req: Request, ctx: RouteContext<"/m/[id]">) {
  const { id } = await ctx.params;
  const rec = await loadManual(id);
  if (!rec) return notFoundHtml();
  return htmlResponse(rec, originOf(req), "view");
}
