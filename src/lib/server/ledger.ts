/**
 * The usage ledger: one tiny private object per event, with everything the limits
 * need encoded in its pathname, so a single strongly consistent list() answers
 * "how much has been spent today, by whom":
 *   usage/<YYYY-MM-DD>/<ms>_<kind>_<cents>_<ipTag>_<sessionTag>_<rand>
 * A pass reserves its worst case before it runs (a hold) and records its real
 * cost when it ends. Holds older than HOLD_TTL no longer count (a crashed pass).
 */
import { LIMITS } from "./config";
import { newId } from "./ids";
import { GateError } from "./screen";
import { store } from "./store";

export type Pass = "read" | "build";
type Kind = `hold-${Pass}` | `done-${Pass}` | "screen";

const HOLD_TTL = 20 * 60 * 1000;
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

interface Entry {
  path: string;
  ts: number;
  kind: Kind;
  cents: number;
  ip: string;
  sid: string;
}

function parse(path: string): Entry | null {
  const name = path.split("/").pop() ?? "";
  const [ts, kind, cents, ip, sid] = name.split("_");
  const t = Number(ts), c = Number(cents);
  if (!Number.isFinite(t) || !Number.isFinite(c) || !kind) return null;
  return { path, ts: t, kind: kind as Kind, cents: c, ip, sid };
}

async function today(): Promise<Entry[]> {
  return (await store.list(`usage/${day()}/`)).map(parse).filter((e): e is Entry => e !== null);
}

async function write(kind: Kind, usd: number, ip: string, sid: string): Promise<string> {
  const cents = Math.max(0, Math.ceil(usd * 100));
  const path = `usage/${day()}/${Date.now()}_${kind}_${cents}_${ip}_${sid}_${newId(6)}`;
  await store.putBytes(path, "1", "text/plain"); // Blob refuses empty bodies; the pathname carries the data
  return path;
}

export interface Hold {
  path: string;
  pass: Pass;
  ip: string;
  sid: string;
}

/** Check the limits and reserve this pass's worst-case cost, or throw a 429. */
export async function reserve(pass: Pass, ip: string, sid: string): Promise<Hold> {
  const now = Date.now();
  const entries = await today();
  const live = (e: Entry) => !e.kind.startsWith("hold-") || now - e.ts < HOLD_TTL;
  const counted = entries.filter(live);
  const spentCents = counted.reduce((a, e) => a + e.cents, 0);
  const holdUsd = LIMITS.holdUsd[pass];
  if (spentCents + holdUsd * 100 > LIMITS.dailyBudgetUsd * 100)
    throw new GateError("Today's reading budget is used up. Try again tomorrow (UTC).", 429, "budget");
  if (counted.some((e) => e.kind.startsWith("hold-") && e.sid === sid))
    throw new GateError("One manual at a time: wait for the current one to finish.", 429, "busy");
  if (pass === "read") {
    const reads = counted.filter((e) => e.kind === "hold-read" || e.kind === "done-read");
    if (reads.filter((e) => e.sid === sid).length >= LIMITS.sessionDaily)
      throw new GateError(`You've made ${LIMITS.sessionDaily} manuals today. Come back tomorrow (UTC).`, 429, "session-limit");
    if (reads.filter((e) => e.ip === ip).length >= LIMITS.ipDaily)
      throw new GateError("This network has reached today's limit. Come back tomorrow (UTC).", 429, "ip-limit");
  }
  return { path: await write(`hold-${pass}`, holdUsd, ip, sid), pass, ip, sid };
}

/** Record what the pass really cost and release its hold. */
export async function settle(hold: Hold, usd: number): Promise<void> {
  await write(`done-${hold.pass}`, usd, hold.ip, hold.sid);
  await store.del([hold.path]).catch(() => {});
}

export async function recordScreen(usd: number, ip: string, sid: string): Promise<void> {
  await write("screen", usd, ip, sid);
}

/** Today's spend, for the status endpoint. */
export async function spentToday(): Promise<number> {
  const now = Date.now();
  return (await today()).filter((e) => !e.kind.startsWith("hold-") || now - e.ts < HOLD_TTL).reduce((a, e) => a + e.cents, 0) / 100;
}
