import { loadPage } from "@/lib/server/manuals";

/** A page image of the original manual (private storage, served here). */
export async function GET(_req: Request, ctx: RouteContext<"/m/[id]/p/[n]">) {
  const { id, n } = await ctx.params;
  const page = await loadPage(id, Number(n));
  if (!page) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(page.bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
