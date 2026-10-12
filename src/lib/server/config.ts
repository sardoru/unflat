const int =(v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

const isProd = process.env.NODE_ENV === "production";

/** Everything that bounds what an upload can cost. All of it can be tuned per deployment. */
export const LIMITS = {
  /** Inline (multipart) uploads; Vercel caps request bodies at 4.5 MB. */
  inlineBytes: 4.3 * 1024 * 1024,
  /** Uploads through Blob. */
  blobBytes: int(process.env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
  maxPages: int(process.env.MAX_PAGES, 60),
  maxImages: int(process.env.MAX_IMAGES, 40),
  /** A wordless assembly manual has little text; a wall of text is not one. */
  maxTextChars: int(process.env.MAX_TEXT_CHARS, 150_000),
  /** Manuals per access session and per IP address, per UTC day. */
  sessionDaily: int(process.env.SESSION_DAILY_MANUALS, 6),
  ipDaily: int(process.env.IP_DAILY_MANUALS, 8),
  /** Hard ceiling on what all uploads together may spend per UTC day. */
  dailyBudgetUsd: int(process.env.DAILY_BUDGET_USD, 25),
  /** Reserved per pass before it runs (worst case at the token caps below). */
  holdUsd: { read: 1.3, build: 1.2, screen: 0.05 },
  maxTokens: { read: 40_000, build: 48_000, screen: 2_000 },
};

export const ENV = {
  isProd,
  accessCodes: (process.env.ACCESS_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 8),
  sessionSecret: process.env.SESSION_SECRET ?? (isProd ? "" : "dev-only-secret-change-me-dev-only-secret"),
  blob: !!process.env.BLOB_READ_WRITE_TOKEN,
  anthropic: !!process.env.ANTHROPIC_API_KEY,
  uploadsEnabled: process.env.UPLOADS_ENABLED !== "0",
  screenModel: process.env.SCREEN_MODEL || "claude-haiku-5-5",
};

/** Why uploads are off, or null when they can run. Fails closed in production. */
export function uploadsBlocked(): string | null {
  if (!ENV.uploadsEnabled) return "Uploads are paused.";
  if (!ENV.anthropic) return "The reader is not configured.";
  if (ENV.sessionSecret.length < 32) return "Sessions are not configured.";
  if (isProd && !ENV.blob) return "Usage limits are not configured.";
  if (isProd && !ENV.accessCodes.length) return "Uploads are invite-only and no invites exist yet.";
  return null;
}
