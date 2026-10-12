import { ImageResponse } from "next/og";
import { manualTitle } from "@/lib/engine/render";
import { OG_SIZE, OgCard, ogFonts } from "@/lib/og/card";
import { boxesOf, IsoSvg } from "@/lib/og/iso";
import { loadManual } from "@/lib/server/manuals";

/** A manual's share card: its own finished model, drawn from the spec. */
export async function GET(_req: Request, ctx: RouteContext<"/m/[id]/og">) {
  const { id } = await ctx.params;
  const rec = await loadManual(id);
  if (!rec) return new Response("Not found", { status: 404 });
  const spec = rec.spec;
  const [w, h, d] = spec.product.size;
  const parts = spec.parts.filter((p) => p.kind !== "tool").reduce((a, p) => a + p.qty, 0);
  // Highlight the part the first step adds, like the manual does.
  const first = spec.placements.find((p) => p.step === 1)?.part;
  const boxes = boxesOf(spec, { hot: (key) => key === first });
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  return new ImageResponse(
    (
      <OgCard
        eyebrow="Step-by-step 3D assembly"
        title={manualTitle(spec).slice(0, 48)}
        sub={`${spec.steps.length} steps · ${parts} parts${w ? ` · ${fmt(w)} × ${fmt(h)} × ${fmt(d)} cm` : ""}`}
        foot="unflat · read from the maker's manual"
        art={boxes.length ? <IsoSvg boxes={boxes} width={510} height={540} pad={40} stroke={1.5} /> : <span style={{ color: "#8a8a8c", fontSize: 24 }}>{manualTitle(spec)}</span>}
      />
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
