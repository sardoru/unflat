import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parse as parsePartial } from "partial-json";
import { LAYOUT_SCHEMA, OUTLINE_SCHEMA } from "../spec/schema";
import type { ManualOutline, UsageSummary } from "../spec/types";
import { SYSTEM_PROMPT, buildInstruction, readInstruction } from "./prompt";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORT = (process.env.PARSE_EFFORT as Effort) || "high";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** USD per million tokens. */
const PRICES: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-fable-5-1": { in: 10, out: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

export type SourceFile =
  | { kind: "pdf"; name: string; data: Buffer }
  | { kind: "images"; name: string; images: { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: Buffer }[] };

export type PhaseEvent =
  | { type: "status"; text: string }
  | { type: "thinking"; text: string }
  | { type: "progress"; chars: number; partial: unknown }
  | { type: "fallback"; model: string };

export class ParseError extends Error {
  constructor(
    message: string,
    public code: "refusal" | "max_tokens" | "invalid_json" | "api" | "input",
  ) {
    super(message);
  }
}

/** The document blocks; the last one carries the cache breakpoint so both passes share the prefix. */
export function documentBlocks(src: SourceFile): BetaContentBlockParam[] {
  if (src.kind === "pdf") {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: src.data.toString("base64") },
        title: src.name,
        cache_control: { type: "ephemeral" },
      },
    ];
  }
  const blocks: BetaContentBlockParam[] = [];
  src.images.forEach((img, i) => {
    blocks.push({ type: "text", text: `Page ${i + 1}:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data.toString("base64") } });
  });
  const last = blocks[blocks.length - 1];
  if (last && last.type === "image") last.cache_control = { type: "ephemeral" };
  return blocks;
}

export function costOf(model: string, u: BetaUsage | undefined): Omit<UsageSummary, "seconds" | "model"> {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const input = u?.input_tokens ?? 0;
  const output = u?.output_tokens ?? 0;
  const cacheRead = u?.cache_read_input_tokens ?? 0;
  const cacheWrite = u?.cache_creation_input_tokens ?? 0;
  const costUsd = (input * p.in + output * p.out + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1e6;
  return { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, costUsd };
}

export interface PhaseResult {
  json: unknown;
  usage: UsageSummary;
}

/**
 * Run one pass. Streams summarized thinking and partial JSON through onEvent;
 * resolves with the parsed JSON (not yet normalized).
 */
export async function runPhase(
  phase: "read" | "build",
  src: SourceFile,
  opts: { hint?: string; outline?: ManualOutline; signal?: AbortSignal; onEvent?: (e: PhaseEvent) => void } = {},
): Promise<PhaseResult> {
  const client = new Anthropic();
  const hint = (opts.hint ?? "").slice(0, 600);
  if (phase === "build" && !opts.outline) throw new ParseError("BUILD needs the READ result.", "input");
  const instruction = phase === "read" ? readInstruction(hint) : buildInstruction(opts.outline!, hint);
  const t0 = Date.now();
  const emit = opts.onEvent ?? (() => {});

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: phase === "read" ? OUTLINE_SCHEMA : LAYOUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [...documentBlocks(src), { type: "text", text: instruction }] }],
    },
    { signal: opts.signal },
  );

  let text = "";
  let lastEmit = 0;
  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "fallback") {
      emit({ type: "fallback", model: (event.content_block as { model?: string }).model ?? "fallback" });
    }
    if (event.type !== "content_block_delta") continue;
    if (event.delta.type === "thinking_delta" && event.delta.thinking) {
      emit({ type: "thinking", text: event.delta.thinking });
    } else if (event.delta.type === "text_delta") {
      text += event.delta.text;
      const now = Date.now();
      if (now - lastEmit > 700) {
        lastEmit = now;
        let partial: unknown = null;
        try {
          partial = parsePartial(text);
        } catch {
          partial = null;
        }
        emit({ type: "progress", chars: text.length, partial });
      }
    }
  }

  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new ParseError("The model declined to read this document.", "refusal");
  if (msg.stop_reason === "max_tokens") throw new ParseError("The manual is too long to lay out in one pass.", "max_tokens");
  const out = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(out);
  } catch {
    throw new ParseError("The model returned malformed JSON.", "invalid_json");
  }
  return {
    json,
    usage: { model: msg.model, ...costOf(msg.model, msg.usage), seconds: Math.round((Date.now() - t0) / 1000) },
  };
}
