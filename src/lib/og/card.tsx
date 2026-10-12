import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

let cached: Promise<{ name: string; data: Buffer; weight: 400 | 600; style: "normal" }[]> | null = null;

export function ogFonts() {
  cached ??= (async () => {
    const dir = join(process.cwd(), "assets/fonts");
    const [regular, semibold, mono] = await Promise.all([
      readFile(join(dir, "Geist-Regular.ttf")),
      readFile(join(dir, "Geist-SemiBold.ttf")),
      readFile(join(dir, "GeistMono-Regular.ttf")),
    ]);
    return [
      { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
      { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
      { name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const },
    ];
  })();
  return cached;
}

const INK = "#ecebe7";

export function OgMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M3 21.5 16 28l13-6.5L16 15z" fill="#1a1c21" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 15V4.5L29 11v10.5z" fill="#a6c0f6" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="9.5" cy="21.6" r="1.3" fill={INK} />
      <circle cx="22.4" cy="15.2" r="1.1" fill="#0c0d0f" />
    </svg>
  );
}

/** Dark text column, white "manual sheet" panel with the drawing. */
export function OgCard({ eyebrow, title, sub, foot, art }: { eyebrow: string; title: string; sub: string; foot: string; art: React.ReactNode }) {
  const long = title.length > 26;
  return (
    <div style={{ width: 1200, height: 630, display: "flex", background: "#0c0d0f", color: INK, fontFamily: "Geist" }}>
      <div style={{ width: 610, height: 630, display: "flex", flexDirection: "column", padding: "58px 40px 52px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <OgMark />
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>Unflat</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <span style={{ fontFamily: "Geist Mono", fontSize: 19, color: "#8a8b8f", letterSpacing: 0.3 }}>{eyebrow}</span>
          <span style={{ fontSize: long ? 56 : 68, fontWeight: 600, lineHeight: 1.03, letterSpacing: long ? -2 : -2.8, marginTop: 14 }}>{title}</span>
          <span style={{ fontSize: 26, color: "#a8a8a4", lineHeight: 1.35, marginTop: 22 }}>{sub}</span>
        </div>
        <span style={{ fontFamily: "Geist Mono", fontSize: 17, color: "#6e6f73", marginTop: 34 }}>{foot}</span>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "34px 34px 34px 0" }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            background: "#ffffff",
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundImage: "linear-gradient(#eeeeea 1px, transparent 1px), linear-gradient(90deg, #eeeeea 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          {art}
        </div>
      </div>
    </div>
  );
}
