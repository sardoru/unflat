/**
 * A READ pass hands the client a ticket for exactly one BUILD pass of the same
 * document and the same (unaltered) READ result. Without it the BUILD endpoint
 * would be a way to send any document and any text to the model.
 */
import { jwtVerify, SignJWT } from "jose";
import { ENV } from "./config";
import { newId } from "./ids";
import { GateError } from "./screen";
import { store } from "./store";

const key = () => new TextEncoder().encode(ENV.sessionSecret);

export interface Ticket {
  sid: string;
  /** sha256 of the document bytes. */
  doc: string;
  /** sha256 of the READ result string as sent to the client. */
  out: string;
  /** The manual id the BUILD pass will save under. */
  mid: string;
  /** What the READ pass learned and spent, carried to the saved record. */
  meta: { name: string; kind: "pdf" | "images"; pages: number; readUsd: number; readSeconds: number; readIn: number; readOut: number };
}

export async function issueTicket(t: Ticket): Promise<string> {
  return new SignJWT({ ...t })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("unflat-ticket")
    .setJti(newId(16))
    .setIssuedAt()
    .setExpirationTime("45m")
    .sign(key());
}

/** Verify a ticket against what the BUILD request carries, and spend it. */
export async function redeemTicket(token: string, expect: Pick<Ticket, "sid" | "doc" | "out">): Promise<Ticket> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: "unflat-ticket" }));
  } catch {
    throw new GateError("This upload has expired. Start again.", 401, "ticket");
  }
  if (payload.sid !== expect.sid || payload.doc !== expect.doc || payload.out !== expect.out)
    throw new GateError("This request doesn't match the manual that was read.", 403, "ticket-mismatch");
  if (!(await store.createOnce(`tickets/${payload.jti}`))) throw new GateError("This manual has already been built.", 409, "ticket-used");
  return { sid: expect.sid, doc: expect.doc, out: expect.out, mid: String(payload.mid), meta: payload.meta as Ticket["meta"] };
}
