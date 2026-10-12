import HeroSlot from "@/components/HeroSlot";
import { Wordmark } from "@/components/Logo";
import MyManuals from "@/components/MyManuals";
import Uploader from "@/components/Uploader";
import { DEMOS } from "@/lib/demos";

export default function Home() {
  const demo = DEMOS.billy;
  const parts = demo.spec.parts.filter((p) => p.kind !== "tool").reduce((a, p) => a + p.qty, 0);
  const minutes = Math.round((demo.usage?.seconds ?? 240) / 60);
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/65">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <a href="/" aria-label="Unflat home">
            <Wordmark />
          </a>
          <div className="flex items-center gap-1 text-sm">
            <a href="#example" className="rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink">Example</a>
            <a href="#how" className="hidden rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink sm:block">How it works</a>
            <a href="#safety" className="hidden rounded-[3px] px-3 py-1.5 text-ink-2 hover:text-ink sm:block">Safety</a>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="mat pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center lg:gap-14 lg:pb-24 lg:pt-16">
            <div className="flex flex-col gap-6">
              <p className="label">Assembly manuals · read by Claude · built in 3D</p>
              <h1 className="text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-5xl">
                The flat-pack manual, unflattened.
              </h1>
              <p className="max-w-[52ch] text-pretty text-[16.5px] leading-relaxed text-ink-2">
                Drop in the PDF that came in the box. Claude reads every drawing, counts every dowel and cam lock, and Unflat
                turns each step into a 3D animation you can turn, replay and share.
              </p>
              <Uploader />
            </div>
            <div className="lg:pl-2">
              <HeroSlot />
            </div>
          </div>
        </section>

        <section id="example" className="border-t border-line bg-surface/40">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:py-24">
            <div className="flex flex-col gap-5">
              <p className="label">Real output, not a mock-up</p>
              <h2 className="text-balance text-3xl font-semibold tracking-[-0.03em] text-ink">BILLY, read from IKEA&apos;s own 16-page manual.</h2>
              <p className="max-w-[52ch] text-[15.5px] leading-relaxed text-ink-2">
                Nothing here was drawn by hand. Claude found the lying-down assembly, the three boards prepared with dowels, the
                cam locks and the back panel that slides in from the bottom, then placed every part in 3D. Tap a part in a step to
                find it; drag to turn the model.
              </p>
              <dl className="grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-[4px] border border-line bg-line text-center">
                {[
                  [String(demo.spec.steps.length), "steps"],
                  [String(parts), "parts"],
                  [`${minutes} min`, "to read"],
                ].map(([v, k]) => (
                  <div key={k} className="bg-surface px-3 py-3">
                    <dt className="label">{k}</dt>
                    <dd className="mt-0.5 font-mono text-lg text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <a href="/m/billy" className="inline-flex h-11 items-center rounded-[3px] bg-accent px-4 text-[15px] font-medium text-accent-ink">
                  Open the BILLY manual
                </a>
                <a href="/m/billy/download" className="inline-flex h-11 items-center rounded-[3px] border border-line-2 px-4 text-[15px] text-ink hover:border-ink-3">
                  Download as one HTML file
                </a>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[400px] rounded-[22px] border border-line-2 bg-surface-2 p-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)]">
              <iframe
                src="/m/billy"
                title="The BILLY bookcase manual in 3D"
                loading="lazy"
                className="block h-[min(760px,78vh)] w-full rounded-[16px] bg-white"
              />
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <p className="label">How it works</p>
            <h2 className="mt-1 max-w-[24ch] text-balance text-3xl font-semibold tracking-[-0.03em] text-ink">Two careful reads, then a model you can walk through.</h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-[4px] border border-line bg-line md:grid-cols-3">
              {[
                ["01", "Read", "Claude Opus goes through every page: the parts list, the hardware counts, each numbered step, the zoom circles and the X marks that show the wrong way."],
                ["02", "Build", "A second pass places every panel and fastener in 3D: which way each dowel points, which side lies on the floor, what is prepared apart and slides in later."],
                ["03", "Step through", "Each step lands its parts with arrows and ghosts, rotates the piece when the manual flips it, and links back to the page it came from."],
              ].map(([n, h, t]) => (
                <li key={n} className="flex flex-col gap-3 bg-surface p-6">
                  <span className="font-mono text-sm text-accent">{n}</span>
                  <h3 className="text-lg font-semibold tracking-tight text-ink">{h}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-2">{t}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="safety" className="border-t border-line bg-surface/40">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-24">
            <div>
              <p className="label">Safety</p>
              <h2 className="mt-1 text-balance text-3xl font-semibold tracking-[-0.03em] text-ink">Every upload is screened before Claude reads it.</h2>
              <p className="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-2">
                A PDF can hide instructions meant for an AI, in white text, tiny print or inside an image. Unflat checks for that
                before any expensive reading starts, and caps what every upload can cost.
              </p>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2">
              {[
                ["Invite codes", "Uploads need an access code; viewing manuals never does."],
                ["File checks", "Real PDFs and photos only, by their bytes, with size and page limits."],
                ["Hidden-text scan", "The text layer is searched for instructions aimed at a model, including near-invisible print."],
                ["A second opinion", "A small Claude model must agree it is an assembly manual and that nothing in it addresses an AI."],
                ["Locked output", "The readers can only answer in a fixed schema, with no tools and a hard token cap."],
                ["Spending limits", "Per-person and per-network daily limits, one manual at a time, and a daily budget."],
              ].map(([h, t]) => (
                <li key={h} className="bg-surface p-5">
                  <h3 className="text-[15px] font-medium text-ink">{h}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{t}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <MyManuals />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark />
          <p className="max-w-[72ch] text-pretty">
            Manuals are read by Claude (Anthropic). Not affiliated with IKEA or any furniture maker; manuals and product names belong
            to their owners. The 3D engine builds on 3d-assembly-manual and the figure on anatomy (both MIT).
          </p>
        </div>
      </footer>
    </>
  );
}
