import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import billy from "../../data/demo-billy.json";
import { normalizeSpec } from "../spec/normalize";
import { renderManualPage, scriptJson } from "./render";

describe("scriptJson", () => {
  it("cannot close the script element or open a comment", () => {
    const out = scriptJson({ a: "</script><script>alert(1)</script>", b: "<!--", c: "&", d: String.fromCharCode(0x2028) });
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<!--");
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(JSON.parse(out)).toEqual({ a: "</script><script>alert(1)</script>", b: "<!--", c: "&", d: String.fromCharCode(0x2028) });
  });
});

describe("renderManualPage", () => {
  const { spec } = normalizeSpec((billy as { spec: unknown }).spec);

  it("allows exactly its inline scripts by hash", () => {
    const { html, csp } = renderManualPage(spec, { id: "billy" });
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toHaveLength(2);
    for (const s of inline) expect(csp).toContain(`'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`);
    expect(csp).not.toContain("unsafe-inline' https://cdnjs"); // scripts are hash-locked, not unsafe-inline
    expect(csp).toContain("default-src 'none'");
  });

  it("escapes model text in the head", () => {
    const evil = { ...spec, product: { ...spec.product, name: '"><img src=x onerror=alert(1)>' } };
    const { html } = renderManualPage(evil, { id: "x" });
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).not.toContain("<img");
    expect(head).toContain("&lt;img");
  });

  it("pins three.js with subresource integrity", () => {
    const { html } = renderManualPage(spec);
    expect(html).toMatch(/three\.js\/r128\/three\.min\.js" integrity="sha512-[A-Za-z0-9+/=]+"/);
  });
});
