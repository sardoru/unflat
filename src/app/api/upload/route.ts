import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ENV, LIMITS, uploadsBlocked } from "@/lib/server/config";
import { json } from "@/lib/server/http";
import { tag } from "@/lib/server/ids";
import { readSession } from "@/lib/server/session";

/** Short-lived, path-locked tokens for uploading a large manual straight to private Blob storage. */
export async function POST(req: Request) {
  if (!ENV.blob) return json({ error: "Direct uploads are not configured." }, 503);
  const blocked = uploadsBlocked();
  if (blocked) return json({ error: blocked }, 503);
  const session = await readSession();
  if (!session) return json({ error: "Enter your access code first." }, 401);
  const prefix = `src/${tag(session.sid)}/`;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!new RegExp(`^${prefix}[a-z0-9-]{8,64}\\.(pdf|jpe?g|png|webp)$`).test(pathname)) throw new Error("bad path");
        return {
          allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: LIMITS.blobBytes,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return json(result);
  } catch {
    return json({ error: "Upload refused." }, 400);
  }
}
