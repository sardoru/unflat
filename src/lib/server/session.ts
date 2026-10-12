import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { ENV } from "./config";

const COOKIE = "uf_s";
const ISSUER = "unflat";
const key = () => new TextEncoder().encode(ENV.sessionSecret);
const digest = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest();

/** Constant-time check of an access code against every configured code. */
export function codeMatches(code: string): boolean {
  if (!code || code.length > 200) return false;
  const d = digest(code);
  let ok = false;
  for (const c of ENV.accessCodes) ok = timingSafeEqual(d, digest(c)) || ok;
  return ok;
}

/** Local development without codes runs as one open session; production never does. */
const devOpen = () => !ENV.isProd && ENV.accessCodes.length === 0;

export async function readSession(): Promise<{ sid: string } | null> {
  if (devOpen()) return { sid: "dev" };
  if (ENV.sessionSecret.length < 32) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, key(), { algorithms: ["HS256"], issuer: ISSUER });
    return typeof payload.sid === "string" ? { sid: payload.sid } : null;
  } catch {
    return null;
  }
}

export async function startSession(): Promise<string> {
  const sid = randomUUID();
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: ENV.isProd, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return sid;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
