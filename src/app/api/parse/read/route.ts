import { runPhase, documentBlocks } from "@/lib/parse/run";
import { LIMITS, uploadsBlocked } from "@/lib/server/config";
import { batcher, errorResponse, json, ndjson } from "@/lib/server/http";
import { clientIp, newId, sha256, tag } from "@/lib/server/ids";
import { readInput } from "@/lib/server/input";
import { recordScreen, reserve, settle } from "@/lib/server/ledger";
import { inspectPdf } from "@/lib/server/pdf";
import { classify, GateError, scanText } from "@/lib/server/screen";
import { readSession } from "@/lib/server/session";
import { store } from "@/lib/server/store";
import { issueTicket } from "@/lib/server/tickets";
import { normalizeOutline } from "@/lib/spec/normalize";

export const maxDuration = 800;

/**
 * Pass 1. Gate first (session, file checks, text-layer scan, limits, a Haiku
 * classifier), then stream Claude's reading of the manual.
 */
export async function POST(req: Request) {
  const blocked = uploadsBlocked();
  if (blocked) return json({ error: blocked, code: "disabled" }, 503);
  const session = await readSession();
  if (!session) return json({ error: "Enter your access code to upload.", code: "auth" }, 401);
  const ipTag = tag(clientIp(req));
  const sidTag = tag(session.sid);

  let hold;
  let input;
  let pages = 0;
  let flags: string[] = [];
  let hint = "";
  try {
    const form = await req.formData().catch(() => {
      throw new GateError("The upload could not be read.", 400, "form");
    });
    input = await readInput(form, sidTag);
    hint = String(form.get("hint") ?? "").slice(0, 300);
    if (input.src.kind === "pdf") {
      const facts = await inspectPdf(new Uint8Array(input.src.data), LIMITS.maxPages).catch(() => {
        throw new GateError("This PDF could not be opened.", 422, "pdf");
      });
      if (facts.encrypted) throw new GateError("This PDF is password-protected.", 422, "encrypted");
      if (facts.pages > LIMITS.maxPages) throw new GateError(`Manuals of up to ${LIMITS.maxPages} pages only.`, 413, "pages");
      if (facts.pages === 0) throw new GateError("This PDF has no pages.", 422, "empty");
      pages = facts.pages;
      const scan = scanText(facts);
      if (!scan.ok) throw new GateError(scan.reason ?? "This document was refused.", 422, "rejected");
      flags = scan.flags;
    } else {
      pages = input.src.images.length;
    }
    hold = await reserve("read", ipTag, sidTag);
  } catch (err) {
    // A refused upload is not kept.
    if (input?.blobPath) await store.del([input.blobPath]).catch(() => {});
    return errorResponse(err);
  }
  const src = input.src;
  const doc = input.hash;
  const blobPath = input.blobPath;

  return ndjson(async (send) => {
    let settled = false;
    try {
      send({ type: "status", stage: "screen", text: "Checking the file", pages });
      const verdict = await classify(documentBlocks(src), flags, req.signal);
      await recordScreen(verdict.costUsd, ipTag, sidTag);
      if (!verdict.ok) {
        await settle(hold, 0);
        settled = true;
        if (blobPath) await store.del([blobPath]).catch(() => {});
        send({ type: "error", code: "rejected", message: verdict.reason });
        return;
      }
      send({ type: "status", stage: "read", text: verdict.product ? `Reading ${verdict.product}` : "Reading the manual" });
      const thoughts = batcher((text) => send({ type: "thinking", text }));
      const r = await runPhase("read", src, {
        hint,
        signal: req.signal,
        maxTokens: LIMITS.maxTokens.read,
        onEvent: (e) => {
          if (e.type === "thinking") thoughts.add(e.text);
          else if (e.type === "progress") send({ type: "progress", chars: e.chars, preview: previewOf(e.partial) });
        },
      });
      thoughts.end();
      await settle(hold, r.usage.costUsd);
      settled = true;
      const { outline, warnings } = normalizeOutline(r.json);
      if (!outline.steps.length) {
        send({ type: "error", code: "no-steps", message: "No assembly steps were found in this document." });
        return;
      }
      const outlineJson = JSON.stringify(outline);
      const mid = newId(10);
      const ticket = await issueTicket({
        sid: session.sid,
        doc,
        out: sha256(outlineJson),
        mid,
        meta: { name: src.name, kind: src.kind, pages, readUsd: r.usage.costUsd, readSeconds: r.usage.seconds, readIn: r.usage.inputTokens + r.usage.cacheWriteTokens, readOut: r.usage.outputTokens },
      });
      send({ type: "done", outline: outlineJson, warnings, ticket, usage: r.usage, pages });
    } finally {
      // A pass cut short (closed tab, error) is charged at its full reservation.
      if (!settled) await settle(hold, LIMITS.holdUsd.read).catch(() => {});
    }
  });
}

/** A small, safe summary of the partial JSON for the progress view. */
function previewOf(partial: unknown) {
  if (!partial || typeof partial !== "object") return null;
  const p = partial as { product?: { name?: unknown; type?: unknown }; parts?: unknown[]; steps?: { title?: unknown }[] };
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  return {
    name: str(p.product?.name, 60),
    type: str(p.product?.type, 60),
    parts: Array.isArray(p.parts) ? p.parts.length : 0,
    steps: Array.isArray(p.steps) ? p.steps.map((s) => str(s?.title, 80)).filter(Boolean).slice(0, 80) : [],
  };
}
