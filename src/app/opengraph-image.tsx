import { ImageResponse } from "next/og";
import { DEMOS } from "@/lib/demos";
import { OG_SIZE, OgCard, ogFonts } from "@/lib/og/card";
import { boxesOf, IsoSvg } from "@/lib/og/iso";

export const alt = "Unflat: the flat-pack manual, unflattened";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The site card: BILLY pulled apart along its joints, the side and top that land in step 6 in blue. */
export default async function Image() {
  const spec = DEMOS.billy.spec;
  const boxes = boxesOf(spec, { explode: 0.13, hot: (key) => key === "side" || key === "top" });
  return new ImageResponse(
    (
      <OgCard
        eyebrow="Read by Claude · built in 3D"
        title="The flat-pack manual, unflattened."
        sub="Drop in the PDF from the box. Step through the build in 3D."
        foot="unflat · step-by-step 3D assembly"
        art={<IsoSvg boxes={boxes} width={510} height={540} pad={34} stroke={1.5} />}
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
