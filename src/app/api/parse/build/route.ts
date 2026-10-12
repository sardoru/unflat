import { runPhase } from "@/lib/parse/run";
import { LIMITS, uploadsBlocked } from "@/lib/server/config";
import { batcher, errorResponse, json, ndjson } from "@/lib/server/http";
import { clientIp, sha256, tag } from "@/lib/server/ids";
import { readInput } from "@/lib/server/input";
import { reserve, settle } from "@/lib/server/ledger";
import { saveManual } from "@/lib/server/manuals";
import { GateError } from "@/lib/server/screen";
import { readSession } from "@/lib/server/session";
import { store } from "@/lib/server/store";
import { redeemTicket } from "@/lib/server/tickets";
import { mergeSpec, normalizeLayout, normalizeOutline } from "@/lib/spec/normalize";

export const maxDuration = 800;

/**
 * Pass 2. Only runs with a ticket from pass 1 for the same document and the same,
 * unaltered READ result; lays the parts out in 3D and saves the manual.
 */
export async function POST(req: Request) {
  const blocked = uploadsBlocked();
  if (blocked) return json({ error: blocked, code: "disabled" }, 503);
  const session = await readSession();
  if (!session) return json({ error: "Enter your access code to upload.", code: "auth" }, 401);
  const ipTag = tag(clientIp(req));
  const sidTag = tag(session.sid);

  let input, ticket, outlineJson: string, hint: string, hold;
  try {
    const form = await req.formData().catch(() => {
      throw new GateError("The request could not be read.", 400, "form");
    });
    outlineJson = String(form.get("outline") ?? "");
    if (!outlineJson || outlineJson.length > 300_000) throw new GateError("The reading of the manual is missing.", 400, "outline");
    hint = String(form.get("hint") ?? "").slice(0, 300);
    input = await readInput(form, sidTag);
    ticket = await redeemTicket(String(form.get("ticket") ?? ""), { sid: session.sid, doc: input.hash, out: sha256(outlineJson) });
    hold = await reserve("build", ipTag, sidTag);
  } catch (err) {
    return errorResponse(err);
  }
  const { outline, warnings: w1 } = normalizeOutline(JSON.parse(outlineJson));
  const src = input.src;
  const blobPath = input.blobPath;

  return ndjson(async (send) => {
    let settled = false;
    try {
      send({ type: "status", stage: "build", text: "Laying the parts out in 3D" });
      const thoughts = batcher((text) => send({ type: "thinking", text }));
      const r = await runPhase("build", src, {
        outline,
        hint,
        signal: req.signal,
        maxTokens: LIMITS.maxTokens.build,
        onEvent: (e) => {
          if (e.type === "thinking") thoughts.add(e.text);
          else if (e.type === "progress") {
            const p = e.partial as { placements?: unknown[] } | null;
            send({ type: "progress", chars: e.chars, placed: Array.isArray(p?.placements) ? p.placements.length : 0 });
          }
        },
      });
      thoughts.end();
      await settle(hold, r.usage.costUsd);
      settled = true;
      const { layout, warnings: w2 } = normalizeLayout(r.json, outline);
      const { spec, warnings: w3 } = mergeSpec(outline, layout);
      const m = ticket.meta;
      const warnings = [...w1, ...w2, ...w3];
      send({ type: "status", stage: "save", text: "Saving your manual" });
      await saveManual({
        id: ticket.mid,
        createdAt: new Date().toISOString(),
        source: { name: m.name, pages: m.pages, kind: m.kind },
        spec,
        warnings,
        pageImages: {},
        owner: sidTag,
        usage: {
          model: r.usage.model,
          inputTokens: m.readIn + r.usage.inputTokens + r.usage.cacheWriteTokens,
          outputTokens: m.readOut + r.usage.outputTokens,
          cacheReadTokens: r.usage.cacheReadTokens,
          cacheWriteTokens: 0,
          costUsd: Math.round((m.readUsd + r.usage.costUsd) * 10000) / 10000,
          seconds: m.readSeconds + r.usage.seconds,
        },
      });
      // The uploaded file is only needed while reading; drop it.
      if (blobPath) await store.del([blobPath]).catch(() => {});
      send({ type: "done", id: ticket.mid, name: spec.product.name, type_: spec.product.type, steps: spec.steps.length, warnings });
    } finally {
      if (!settled) await settle(hold, LIMITS.holdUsd.build).catch(() => {});
    }
  });
}
