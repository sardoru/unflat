"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readNdjson, type StreamEvent } from "@/lib/client/ndjson";
import { downscale, openPdf, type PdfHandle } from "@/lib/client/pages";
import { rememberMine } from "@/lib/client/mine";

interface Status {
  signedIn: boolean;
  uploads: { enabled: boolean; reason: string | null };
  blob: boolean;
  uploadPrefix: string | null;
  limits: { maxPages: number; maxImages: number; inlineMb: number; blobMb: number; perDay: number };
}

type Stage = "check" | "read" | "build" | "save";
const STAGES: { key: Stage; label: string }[] = [
  { key: "check", label: "Check the file" },
  { key: "read", label: "Read every page" },
  { key: "build", label: "Lay the parts out in 3D" },
  { key: "save", label: "Save and attach pages" },
];

interface Picked {
  name: string;
  kind: "pdf" | "images";
  files: File[];
  pages: number;
  cover: string | null;
  pdf?: PdfHandle;
}

const INLINE_BYTES = 4 * 1024 * 1024;

async function fetchStatus(): Promise<Status | null> {
  try {
    return (await (await fetch("/api/session", { cache: "no-store" })).json()) as Status;
  } catch {
    return null;
  }
}

export default function Uploader() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hint, setHint] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [done, setDone] = useState<Stage[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [placed, setPlaced] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; name: string } | null>(null);
  const [over, setOver] = useState(false);
  const [t0, setT0] = useState(0);
  const [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    fetchStatus().then(setStatus);
  }, []);
  useEffect(() => {
    let alive = true;
    fetchStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const working = stage !== null && !error && !result;
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [working]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setCodeErr("");
    const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    setUnlocking(false);
    if (!r.ok) {
      setCodeErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "That code isn't valid.");
      return;
    }
    setCode("");
    refresh();
  }

  async function pick(list: FileList | File[]) {
    const files = [...list];
    if (!files.length || working) return;
    reset();
    const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const images = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    try {
      if (pdfs.length === 1 && files.length === 1) {
        const pdf = await openPdf(pdfs[0]);
        if (status && pdf.pages > status.limits.maxPages) throw new Error(`That manual has ${pdf.pages} pages; the limit is ${status.limits.maxPages}.`);
        const cover = URL.createObjectURL(await pdf.render(1, 360, 0.8));
        setPicked({ name: pdfs[0].name, kind: "pdf", files: pdfs, pages: pdf.pages, cover, pdf });
      } else if (images.length === files.length) {
        if (status && images.length > status.limits.maxImages) throw new Error(`Up to ${status.limits.maxImages} photos at a time.`);
        const scaled = await Promise.all(images.map(async (f, i) => new File([await downscale(f, 1600)], `page-${i + 1}.jpg`, { type: "image/jpeg" })));
        setPicked({ name: images.length === 1 ? images[0].name : `${images.length} photos`, kind: "images", files: scaled, pages: scaled.length, cover: URL.createObjectURL(scaled[0]) });
      } else {
        throw new Error("Choose one PDF, or photos of the manual's pages.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file couldn't be opened.");
    }
  }

  function reset() {
    setStage(null);
    setDone([]);
    setNotes([]);
    setSteps([]);
    setTitle("");
    setPlaced(0);
    setError("");
    setResult(null);
  }

  function note(text: string) {
    const lines = text
      .replace(/\*\*/g, "")
      .split(/\n+|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
    if (lines.length) setNotes((n) => [...n, ...lines].slice(-4));
  }

  async function send(url: string, form: FormData, signal: AbortSignal, on: (e: StreamEvent) => void): Promise<StreamEvent> {
    const res = await fetch(url, { method: "POST", body: form, signal });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (j.code === "auth") refresh();
      throw new Error(j.error ?? `Request failed (${res.status}).`);
    }
    let last: StreamEvent | null = null;
    for await (const ev of readNdjson(res)) {
      if (ev.type === "error") throw new Error(String(ev.message ?? "Something went wrong."));
      if (ev.type === "done") last = ev;
      else on(ev);
    }
    if (!last) throw new Error("The connection closed before the manual was finished.");
    return last;
  }

  async function run() {
    if (!picked || !status) return;
    reset();
    setT0(Date.now());
    setNow(Date.now());
    setStage("check");
    const ac = new AbortController();
    abort.current = ac;
    const finish = (s: Stage) => setDone((d) => (d.includes(s) ? d : [...d, s]));
    try {
      // Large files go to private Blob storage first; small ones ride along with each request.
      let blobPath: string | null = null;
      const size = picked.files.reduce((a, f) => a + f.size, 0);
      if (size > INLINE_BYTES) {
        if (!status.blob || !status.uploadPrefix || picked.kind !== "pdf") throw new Error("That file is too large. Try a PDF under 4 MB.");
        const { upload } = await import("@vercel/blob/client");
        const path = `${status.uploadPrefix}${crypto.randomUUID()}.pdf`;
        await upload(path, picked.files[0], { access: "private", handleUploadUrl: "/api/upload", contentType: "application/pdf", abortSignal: ac.signal });
        blobPath = path;
      }
      const base = () => {
        const f = new FormData();
        f.set("name", picked.name);
        f.set("hint", hint);
        if (blobPath) f.set("blob", blobPath);
        else picked.files.forEach((file) => f.append("file", file));
        return f;
      };

      const read = await send("/api/parse/read", base(), ac.signal, (e) => {
        if (e.type === "status" && e.stage === "read") {
          finish("check");
          setStage("read");
        } else if (e.type === "thinking") note(String(e.text ?? ""));
        else if (e.type === "progress" && e.preview) {
          const p = e.preview as { name?: string; type?: string; steps?: string[] };
          if (p.name) setTitle([p.name, p.type].filter(Boolean).join(" "));
          if (Array.isArray(p.steps)) setSteps(p.steps);
        }
      });
      finish("check");
      finish("read");
      setStage("build");
      setNotes([]);

      const form = base();
      form.set("outline", String(read.outline));
      form.set("ticket", String(read.ticket));
      const built = await send("/api/parse/build", form, ac.signal, (e) => {
        if (e.type === "thinking") note(String(e.text ?? ""));
        else if (e.type === "progress" && typeof e.placed === "number") setPlaced(e.placed);
        else if (e.type === "status" && e.stage === "save") {
          finish("build");
          setStage("save");
        }
      });
      finish("build");
      setStage("save");
      const id = String(built.id);
      await attachPages(id, ac.signal).catch(() => {});
      finish("save");
      rememberMine({ id, name: String(built.name ?? picked.name), type: String(built.type_ ?? ""), steps: Number(built.steps ?? 0), createdAt: new Date().toISOString() });
      setResult({ id, name: [built.name, built.type_].filter(Boolean).join(" ") || picked.name });
      // /m/[id] is a route handler serving a standalone HTML document: it needs a full page load.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/m/${id}`);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") setError("Stopped. Nothing more will be read.");
      else setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      abort.current = null;
    }
  }

  /** Small images of the original pages, shown beside each step ("manual p. 7"). */
  async function attachPages(id: string, signal: AbortSignal) {
    if (!picked) return;
    const batch: [number, Blob][] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const f = new FormData();
      for (const [n, b] of batch) f.append(`p${n}`, b, `${n}.jpg`);
      await fetch(`/api/manuals/${id}/pages`, { method: "POST", body: f, signal });
      batch.length = 0;
      bytes = 0;
    };
    for (let n = 1; n <= picked.pages; n++) {
      const blob = picked.kind === "pdf" && picked.pdf ? await picked.pdf.render(n, 900, 0.7) : await downscale(picked.files[n - 1], 1000, 0.72);
      if (blob.size > 440 * 1024) continue;
      if (bytes + blob.size > 3 * 1024 * 1024) await flush();
      batch.push([n, blob]);
      bytes += blob.size;
    }
    await flush();
  }

  const secs = t0 ? Math.max(0, Math.round((now - t0) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  if (!status) return <Card><p className="label">Loading…</p></Card>;

  if (!status.uploads.enabled && status.uploads.reason)
    return (
      <Card>
        <p className="text-[15px] text-ink">Uploads are closed right now.</p>
        <p className="mt-1 text-sm text-ink-2">{status.uploads.reason} The example below is open to everyone.</p>
      </Card>
    );

  if (!status.signedIn)
    return (
      <Card>
        <form onSubmit={unlock} className="flex flex-col gap-3">
          <div>
            <p className="text-[15px] font-medium text-ink">Uploads are invite-only during the beta</p>
            <p className="mt-1 text-sm text-ink-2">Every manual is read by Claude, so uploads need an access code. Anyone can open the example below.</p>
          </div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="code">Access code</label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Access code"
              autoComplete="one-time-code"
              className="h-11 min-w-0 flex-1 rounded-[3px] border border-line-2 bg-surface-2 px-3 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <button disabled={!code || unlocking} className="h-11 rounded-[3px] bg-accent px-4 text-sm font-medium text-accent-ink transition-opacity disabled:opacity-40">
              {unlocking ? "Checking…" : "Unlock"}
            </button>
          </div>
          {codeErr && <p className="text-sm text-danger" role="alert">{codeErr}</p>}
        </form>
      </Card>
    );

  return (
    <Card>
      {!working && !result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          className={`group relative flex flex-col items-center justify-center gap-3 rounded-[3px] border border-dashed px-5 py-7 text-center transition-colors ${over ? "border-accent bg-accent/5" : "border-line-2 hover:border-ink-3"}`}
        >
          {picked ? (
            <div className="flex w-full items-center gap-4 text-left">
              {picked.cover && (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
                <img src={picked.cover} alt="" className="h-20 w-[60px] flex-none rounded-[2px] border border-line bg-white object-cover object-top" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-ink">{picked.name}</p>
                <p className="label mt-0.5">{picked.kind === "pdf" ? `PDF · ${picked.pages} pages` : `${picked.pages} photos`}</p>
                <button type="button" onClick={() => input.current?.click()} className="mt-1.5 text-sm text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">
                  Choose another
                </button>
              </div>
            </div>
          ) : (
            <>
              <DropIcon />
              <div>
                <p className="text-[15px] font-medium text-ink">Drop a manual here</p>
                <p className="mt-0.5 text-sm text-ink-2">A PDF, or photos of the pages</p>
              </div>
              <button type="button" onClick={() => input.current?.click()} className="h-9 rounded-[3px] border border-line-2 px-3.5 text-sm text-ink hover:border-ink-3">
                Choose a file
              </button>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) pick(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {picked && !working && !result && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="hint" className="label">What is it? (optional, helps with sizes)</label>
            <input
              id="hint"
              value={hint}
              onChange={(e) => setHint(e.target.value.slice(0, 300))}
              placeholder="e.g. BILLY bookcase, 80 × 28 × 202 cm"
              className="mt-1.5 h-10 w-full rounded-[3px] border border-line-2 bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <button onClick={run} className="h-12 rounded-[3px] bg-accent text-[15px] font-medium text-accent-ink transition-transform active:scale-[0.99]">
            Make the 3D manual
          </button>
          <p className="label text-center">Two passes by Claude · usually 3 to 5 minutes</p>
        </div>
      )}

      {(working || result) && (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex items-center gap-3">
            {picked?.cover && (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
              <img src={picked.cover} alt="" className="h-14 w-[42px] flex-none rounded-[2px] border border-line bg-white object-cover object-top" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ink">{title || picked?.name}</p>
              <p className="label">{result ? "Opening your manual…" : `${clock} elapsed`}</p>
            </div>
            {working && (
              <button onClick={() => abort.current?.abort()} className="h-8 rounded-[3px] border border-line-2 px-3 text-sm text-ink-2 hover:text-ink">
                Stop
              </button>
            )}
          </div>
          <ol className="flex flex-col gap-2">
            {STAGES.map((s) => {
              const isDone = done.includes(s.key);
              const isNow = stage === s.key && !isDone;
              return (
                <li key={s.key} className="flex items-center gap-2.5 text-sm">
                  <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border text-[11px] ${isDone ? "border-accent bg-accent text-accent-ink" : isNow ? "border-accent text-accent" : "border-line-2 text-ink-3"}`}>
                    {isDone ? <Tick /> : isNow ? <span className="working-dot block h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                  </span>
                  <span className={isDone || isNow ? "text-ink" : "text-ink-3"}>{s.label}</span>
                  {s.key === "build" && isNow && placed > 0 && <span className="label ml-auto">{placed} placed</span>}
                  {s.key === "read" && isNow && steps.length > 0 && <span className="label ml-auto">{steps.length} steps</span>}
                </li>
              );
            })}
          </ol>
          {notes.length > 0 && working && (
            <div className="rounded-[3px] border border-line bg-surface-2 px-3 py-2.5">
              <p className="label mb-1">Claude&apos;s reading notes</p>
              {notes.map((n, i) => (
                <p key={`${i}-${n}`} className="rise font-mono text-[12px] leading-relaxed text-ink-2" style={{ opacity: 0.45 + (0.55 * (i + 1)) / notes.length }}>
                  {n}
                </p>
              ))}
            </div>
          )}
          {steps.length > 0 && stage === "read" && (
            <ol className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`} className="rise flex gap-2 text-sm text-ink-2">
                  <span className="w-5 flex-none text-right font-mono text-ink-3">{i + 1}</span>
                  <span className="truncate">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-[3px] border border-danger/40 bg-danger/5 px-3 py-2.5" role="alert">
          <p className="text-sm text-danger">{error}</p>
          {picked && !working && (
            <button onClick={run} className="mt-1.5 text-sm text-ink underline decoration-line-2 underline-offset-4">
              Try again
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[4px] border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:p-5">{children}</div>;
}

function Tick() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.2 5 8.6l4.5-5.2" />
    </svg>
  );
}

function DropIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11 text-ink-3 transition-colors group-hover:text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
      {/* a flat sheet folding up into a box */}
      <path d="M8 30 24 38l16-8-16-8z" />
      <path d="M8 30v-9l16-8 16 8v9" strokeDasharray="2.5 2.5" />
      <path d="M24 22v16" />
      <path d="M24 4v11m-4-4 4 4 4-4" />
    </svg>
  );
}
