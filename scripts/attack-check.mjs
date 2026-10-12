// Send adversarial documents straight at the READ endpoint with a valid session and
// report how far each got. Usage: node scripts/attack-check.mjs <baseUrl> <@codefile|code> <file.pdf> [...]
import { readFileSync } from "node:fs";
import path from "node:path";

const [base, codeArg, ...files] = process.argv.slice(2);
const code = codeArg.startsWith("@") ? readFileSync(codeArg.slice(1), "utf8").trim() : codeArg;
const login = await fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (!login.ok || !cookie) throw new Error(`login failed: ${login.status}`);

for (const file of files) {
  const form = new FormData();
  form.set("name", path.basename(file));
  form.append("file", new Blob([readFileSync(file)], { type: "application/pdf" }), path.basename(file));
  const t0 = Date.now();
  const res = await fetch(`${base}/api/parse/read`, { method: "POST", body: form, headers: { cookie } });
  let outcome;
  if (!res.ok) outcome = `HTTP ${res.status}: ${(await res.json().catch(() => ({}))).error}`;
  else {
    // Read events until the gate decides; abort as soon as real reading starts so a pass costs nothing.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    outcome = "stream ended";
    outer: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const ev = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (ev.type === "error") { outcome = `blocked in stream (${ev.code}): ${ev.message}`; break outer; }
        if (ev.type === "status" && ev.stage === "read") { outcome = `PASSED the gate (${ev.text}); aborted`; break outer; }
      }
    }
    await reader.cancel().catch(() => {});
  }
  console.log(`${path.basename(file)} → ${outcome} (${Date.now() - t0} ms)`);
}
