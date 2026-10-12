import { loadManual } from "@/lib/server/manuals";
import { htmlResponse, originOf } from "@/lib/server/viewer";
import { notFoundHtml } from "@/lib/server/not-found";

/** The same manual as a single .html file that opens offline (three.js and fonts load from CDNs). */
export async function GET(req: Request, ctx: RouteContext<"/m/[id]/download">) {
  const { id } = await ctx.params;
  const rec = await loadManual(id);
  if (!rec) return notFoundHtml();
  return htmlResponse(rec, originOf(req), "download");
}
