import { manualTitle, renderManualPage, type RenderOptions } from "../engine/render";
import type { StoredManual } from "./manuals";

export function originOf(req: Request): string {
  const env = process.env.SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

export function fileNameOf(rec: StoredManual): string {
  return (
    manualTitle(rec.spec)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "manual"
  );
}

export function viewerOptions(rec: StoredManual, origin: string, mode: "view" | "download"): RenderOptions {
  const url = `${origin}/m/${rec.id}`;
  const pages: Record<string, string> = {};
  for (let n = 1; n <= (rec.pageCount ?? 0); n++) pages[n] = `${origin}/m/${rec.id}/p/${n}`;
  return {
    id: rec.id,
    url,
    ogImage: `${origin}/m/${rec.id}/og`,
    iconUrl: `${origin}/icon.svg`,
    homeUrl: origin,
    shareUrl: mode === "view" ? url : undefined,
    downloadUrl: mode === "view" ? `/m/${rec.id}/download` : undefined,
    warnings: rec.warnings,
    pages,
  };
}

export function htmlResponse(rec: StoredManual, origin: string, mode: "view" | "download"): Response {
  const { html, csp } = renderManualPage(rec.spec, viewerOptions(rec, origin, mode));
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
  };
  if (mode === "download") headers["Content-Disposition"] = `attachment; filename="${fileNameOf(rec)}-unflat.html"`;
  return new Response(html, { headers });
}
