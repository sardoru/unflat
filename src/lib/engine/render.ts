import { createHash } from "node:crypto";
import type { AssemblySpec, Warning } from "../spec/types";
import { ENGINE_JS, ENGINE_SHELL } from "./assets.generated";

/** three.js r128 (the version the 3d-assembly-manual engine is proven on), pinned with SRI. */
const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const THREE_SRI = "sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==";

export interface RenderOptions {
  id?: string;
  /** Absolute page URL (canonical + og:url). */
  url?: string;
  /** Absolute OG image URL. */
  ogImage?: string;
  shareUrl?: string;
  downloadUrl?: string;
  homeUrl?: string;
  iconUrl?: string;
  warnings?: Warning[];
  /** Page thumbnails by 1-based page number. */
  pages?: Record<string, string>;
  accent?: number;
  fill?: number;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Separators built from char codes, so no raw control character sits in this file. */
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");

/** JSON that is safe inside a <script> element. */
export function scriptJson(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEP, "\\u2028")
    .replace(PARA_SEP, "\\u2029");
}

export function manualTitle(spec: AssemblySpec): string {
  const { name, type } = spec.product;
  return type && type.toLowerCase() !== name.toLowerCase() ? `${name} ${type.toLowerCase()}` : name;
}

export function manualDescription(spec: AssemblySpec): string {
  const [w, h, d] = spec.product.size;
  const parts = spec.parts.filter((p) => p.kind !== "tool").reduce((a, p) => a + (p.qty || 0), 0);
  const size = w ? `${round(w)} × ${round(h)} × ${round(d)} cm` : "";
  return [`Step-by-step 3D assembly`, size, `${spec.steps.length} steps`, `${parts} parts`].filter(Boolean).join(" · ");
}
const round = (n: number) => Math.round(n * 10) / 10;

const hashOf = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

/**
 * The manual page plus a Content-Security-Policy that allows exactly its two inline
 * scripts (by hash), three.js from the pinned CDN, and the fonts. Nothing else runs.
 */
export function renderManualPage(spec: AssemblySpec, opts: RenderOptions = {}): { html: string; csp: string } {
  const html = renderManualHtml(spec, opts);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => hashOf(m[1]));
  const csp = [
    "default-src 'none'",
    `script-src ${inline.join(" ")} https://cdnjs.cloudflare.com`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
  return { html, csp };
}

/** The whole manual as one HTML document (viewer and download). */
export function renderManualHtml(spec: AssemblySpec, opts: RenderOptions = {}): string {
  const title = `${manualTitle(spec)} · Unflat`;
  const desc = manualDescription(spec);
  const data = {
    spec,
    opts: {
      id: opts.id,
      shareUrl: opts.shareUrl,
      downloadUrl: opts.downloadUrl,
      homeUrl: opts.homeUrl,
      warnings: opts.warnings ?? [],
      pages: opts.pages ?? {},
      accent: opts.accent,
      fill: opts.fill,
    },
  };
  const meta = [
    `<meta name="description" content="${esc(desc)}">`,
    opts.url ? `<link rel="canonical" href="${esc(opts.url)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Unflat">`,
    `<meta property="og:title" content="${esc(manualTitle(spec))}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    opts.url ? `<meta property="og:url" content="${esc(opts.url)}">` : "",
    opts.ogImage ? `<meta property="og:image" content="${esc(opts.ogImage)}">` : "",
    opts.ogImage ? `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">` : "",
    `<meta name="twitter:card" content="${opts.ogImage ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(manualTitle(spec))}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    opts.ogImage ? `<meta name="twitter:image" content="${esc(opts.ogImage)}">` : "",
    opts.iconUrl ? `<link rel="icon" href="${esc(opts.iconUrl)}" type="image/svg+xml">` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)}</title>
${meta}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
</head>
<body>
${ENGINE_SHELL}
<script src="${THREE_SRC}" integrity="${THREE_SRI}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>window.UNFLAT = ${scriptJson(data)};</script>
<script>${ENGINE_JS.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
}
