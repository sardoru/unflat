// Exercise the storage layer and the usage ledger against a real Blob store.
// Usage: npx tsx --env-file=<env with BLOB_READ_WRITE_TOKEN> scripts/blob-check.mts
import { recordScreen, reserve, settle, spentToday } from "../src/lib/server/ledger";
import { store } from "../src/lib/server/store";

const base = `selftest/${Date.now()}`;
await store.putJson(`${base}/a.json`, { ok: 1 });
console.log("getJson:", await store.getJson(`${base}/a.json`));
console.log("list:", await store.list(`${base}/`));
console.log("createOnce first:", await store.createOnce(`${base}/once`), "second:", await store.createOnce(`${base}/once`));
const bytes = await store.getBytes(`${base}/missing`);
console.log("missing →", bytes);
const before = await spentToday();
const hold = await reserve("read", "selftest-ip", "selftest-sid");
console.log("hold:", hold.path.split("/").pop());
await settle(hold, 0.01);
await recordScreen(0.001, "selftest-ip", "selftest-sid");
console.log("spent today before/after:", before, await spentToday());
await store.del(await store.list(`${base}/`));
const mine = (await store.list(`usage/`)).filter((p) => p.includes("selftest"));
await store.del(mine);
console.log("cleaned", mine.length, "ledger entries; left under selftest:", (await store.list(`${base}/`)).length);
