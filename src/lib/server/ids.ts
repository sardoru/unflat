import { createHash, createHmac, randomBytes } from "node:crypto";
import { ENV } from "./config";

/** The caller's IP as Vercel reports it. */
export function clientIp(req: Request): string {
  const h = req.headers;
  const xf = h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for") || h.get("x-real-ip") || "";
  return xf.split(",")[0]?.trim() || "0.0.0.0";
}

/** A short keyed hash, so the usage ledger never stores raw IPs or session ids. */
export function tag(value: string): string {
  return createHmac("sha256", ENV.sessionSecret || "unflat").update(value).digest("hex").slice(0, 12);
}

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
/** URL-safe random id without look-alike characters. */
export function newId(len = 10): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}
