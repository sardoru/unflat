// Smoke test: is ANTHROPIC_API_KEY valid and can it reach the model?
// Usage: node --env-file=.env.local scripts/ping-claude.mjs
import Anthropic from "@anthropic-ai/sdk";

const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const client = new Anthropic();
try {
  const r = await client.messages.create({
    model,
    max_tokens: 64,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with the single word: ready" }],
  });
  const text = r.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  console.log("ok model=%s stop=%s text=%j usage=%j", r.model, r.stop_reason, text, r.usage);
} catch (e) {
  console.log("error", e?.status, e?.error?.error?.type ?? "", (e?.message ?? String(e)).slice(0, 200));
  process.exitCode = 1;
}
