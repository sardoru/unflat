import { ENV, LIMITS, uploadsBlocked } from "@/lib/server/config";
import { json } from "@/lib/server/http";
import { tag } from "@/lib/server/ids";
import { codeMatches, endSession, readSession, startSession } from "@/lib/server/session";

async function status() {
  const s = await readSession();
  const blocked = uploadsBlocked();
  return {
    signedIn: !!s,
    uploads: { enabled: !blocked, reason: blocked },
    blob: ENV.blob,
    uploadPrefix: s ? `src/${tag(s.sid)}/` : null,
    limits: { maxPages: LIMITS.maxPages, maxImages: LIMITS.maxImages, inlineMb: 4, blobMb: LIMITS.blobBytes / 1024 / 1024, perDay: LIMITS.sessionDaily },
  };
}

export async function GET() {
  return json(await status());
}

/** Exchange an access code for a session cookie. */
export async function POST(req: Request) {
  let code = "";
  try {
    code = String(((await req.json()) as { code?: unknown }).code ?? "");
  } catch {}
  if (!codeMatches(code)) {
    await new Promise((r) => setTimeout(r, 700)); // slow down guessing
    return json({ error: "That code isn't valid." }, 401);
  }
  await startSession();
  return json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return json({ ok: true });
}
