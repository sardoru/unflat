import Anthropic from "@anthropic-ai/sdk";
import { ParseError } from "../parse/run";
import { GateError } from "./screen";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** A message that is safe to show a visitor, and the status for it. */
export function describe(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof GateError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof ParseError) return { status: 422, code: err.code, message: err.message };
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429 || err.status === 529) return { status: 503, code: "busy", message: "The reader is busy right now. Try again in a minute." };
    if (err.status === 400) return { status: 422, code: "unreadable", message: "The reader couldn't open this document." };
  }
  if ((err as { name?: string })?.name === "AbortError") return { status: 499, code: "aborted", message: "Stopped." };
  console.error("[unflat]", err);
  return { status: 500, code: "error", message: "Something went wrong reading the manual." };
}

export function errorResponse(err: unknown): Response {
  const d = describe(err);
  return json({ error: d.message, code: d.code }, d.status);
}

/**
 * Newline-delimited JSON events. Work runs inside the stream so long passes keep
 * the connection alive; errors become a final {type:"error"} event.
 */
export function ndjson(work: (send: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      const ping = setInterval(() => send({ type: "ping" }), 15_000);
      try {
        await work(send);
      } catch (err) {
        const d = describe(err);
        send({ type: "error", code: d.code, message: d.message });
      } finally {
        clearInterval(ping);
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}

/** Thinking arrives token by token; send it in readable pieces. */
export function batcher(flush: (text: string) => void, ms = 500) {
  let buf = "";
  let last = 0;
  return {
    add(t: string) {
      buf += t;
      const now = Date.now();
      if (now - last > ms && buf.trim()) {
        last = now;
        flush(buf);
        buf = "";
      }
    },
    end() {
      if (buf.trim()) flush(buf);
      buf = "";
    },
  };
}
