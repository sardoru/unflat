import { notFound } from "next/navigation";
import HeroFigure from "@/components/hero/HeroFigure";
import { DevTheme } from "@/components/hero/DevTheme";

export const metadata = { title: "Hero figure preview", robots: { index: false } };

const css = `
.uf-dev{min-height:100vh;display:grid;justify-items:center;align-content:start;padding:64px 16px;background:#0b0b0b;color:#a3a3a3}
:root[data-theme="light"] .uf-dev{background:#f2f2ef;color:#57575a}
.uf-dev-col{width:min(620px,100%)}
`;

/** Development-only preview of the landing figure (used by scripts/hero captures). */
export default function HeroPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="uf-dev">
      <style>{css}</style>
      <DevTheme />
      <div className="uf-dev-col">
        <HeroFigure />
      </div>
    </main>
  );
}
