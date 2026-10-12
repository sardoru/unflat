"use client";

// Fig 1, live: one loop moves the figure along s (box → apart → six assembly steps → built), writes
// every changed attribute through the DOM, re-sorts the painter's order when parts pass each other,
// and says the readout. No React re-render per frame.
import * as React from "react";
import { IsoFigure } from "../../lib/iso/react/draw";
import { asksForStillness, useReadout } from "../../lib/iso/react/live";
import { frameAt, homeSvg } from "./frame";
import { PART, S_APART, S_BOX, S_BUILT, readoutOf, spokenOf, stepOf } from "./model";
import { paintOrder, type Sortable } from "./order";
import { SCENERY } from "./scenery-shapes";
import { HEIGHT, P, WIDTH } from "./view";

const MOST_DT = 1 / 30;
const TOUR_FIRST = 1.4;
const TOUR_BACK = 3600;
const RATE = 2.4; // s units per second at most
const SETTLE = 0.16; // follow time constant

/** The idle tour as a function of time: built, packed back flat, unpacked and built step by step. */
const smooth = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const TOUR: Array<[number, number]> = []; // [duration, s at end], eased
TOUR.push([2.6, S_BUILT], [4.4, S_BOX], [1.4, S_BOX], [5.6, S_APART], [0.9, S_APART]);
for (let k = 1; k <= 6; k++) TOUR.push([1.15, S_APART + k], [0.25, S_APART + k]);
const TOUR_LENGTH = TOUR.reduce((sum, [duration]) => sum + duration, 0);

function tourAt(clock: number) {
  let t = clock % TOUR_LENGTH;
  let from = S_BUILT;
  for (const [duration, to] of TOUR) {
    if (t <= duration) return from + (to - from) * smooth(t / duration);
    t -= duration;
    from = to;
  }
  return S_BUILT;
}

interface Props {
  label: string;
  /** Server-built layers, each one keyed element. */
  base: React.ReactNode;
  footprint: React.ReactNode;
  sceneryHalos: React.ReactNode;
  items: React.ReactNode;
  halos: Array<{ id: string; d: string; alpha: number }>;
  readout: string;
  spoken: string;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function themeOf(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function HeroLive(props: Props) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const root = anchor; // the stage: the readout is found from it, the loop draws inside it
  const live = React.useRef<HTMLSpanElement | null>(null);
  const state = React.useRef({ s: S_BUILT, v: 0, target: S_BUILT, touring: false, clock: 0, visible: false, frame: 0, last: 0, drawn: NaN, order: "", engagedAt: 0 });
  const nodes = React.useRef<Map<string, SVGGElement>>(new Map());
  const halos = React.useRef<Map<string, SVGPathElement>>(new Map());
  const homes = React.useRef<Map<string, string>>(new Map());
  const timers = React.useRef<{ tour: number; back: number; announce: number }>({ tour: 0, back: 0, announce: 0 });
  const engaged = React.useRef({ hover: false, focus: false });

  // ---- drawing -------------------------------------------------------------------------------
  const draw = React.useCallback(
    (s: number) => {
      const st = state.current;
      if (s === st.drawn) return;
      st.drawn = s;
      const frame = frameAt(s, P);
      const sortable: Sortable[] = Object.entries(SCENERY).map(([id, box]) => ({ id, box }));
      for (const part of frame) {
        const node = nodes.current.get(part.id);
        if (!node) continue;
        if (!part.visible) {
          if (node.getAttribute("display") !== "none") node.setAttribute("display", "none");
          continue;
        }
        if (node.hasAttribute("display")) node.removeAttribute("display");
        sortable.push({ id: part.id, box: part.box! });
        let changed = false;
        if (part.mode === "home") {
          if (node.dataset.mode !== "home") {
            let home = homes.current.get(part.id);
            if (!home) homes.current.set(part.id, (home = homeSvg(PART[part.id]!, P)));
            node.innerHTML = home;
            node.dataset.mode = "home";
            node.dataset.sig = "home";
            changed = true;
          }
          const transform = part.shift[0] || part.shift[1] ? `translate(${part.shift[0]} ${part.shift[1]})` : "";
          if ((node.getAttribute("transform") ?? "") !== transform) {
            if (transform) node.setAttribute("transform", transform);
            else node.removeAttribute("transform");
          }
        } else {
          if (node.dataset.sig !== part.sig) {
            node.innerHTML = part.render();
            node.dataset.mode = "rebuild";
            node.dataset.sig = part.sig;
            changed = true;
          }
          if (node.hasAttribute("transform")) node.removeAttribute("transform");
        }
        const lit = part.lit ? "1" : "";
        if (changed || (node.dataset.lit ?? "") !== lit) {
          node.dataset.lit = lit;
          node.querySelectorAll(".iso-solid").forEach((solid) => (part.lit ? solid.setAttribute("data-lit", "") : solid.removeAttribute("data-lit")));
        }
        if (part.halo) {
          const halo = halos.current.get(part.id);
          if (halo) {
            if (halo.getAttribute("d") !== part.halo.d) halo.setAttribute("d", part.halo.d);
            const alpha = String(part.halo.alpha);
            if (halo.style.opacity !== alpha) halo.style.opacity = alpha;
          }
        }
      }
      // Painter's order: re-append only when it changed.
      const order = paintOrder(sortable, P);
      const key = order.join(" ");
      if (key !== st.order) {
        st.order = key;
        const container = nodes.current.values().next().value?.parentNode;
        if (container) {
          const fragment = document.createDocumentFragment();
          for (const id of order) {
            const node = nodes.current.get(id);
            if (node) fragment.appendChild(node);
          }
          container.appendChild(fragment);
        }
      }
      // The dotted footprint fades once both sides stand on it.
      const footprint = root.current?.querySelector<SVGGElement>(".uf-footprint");
      const sidesHome = s >= PART["side-r"]!.moves[0]!.window[1] - 1e-6;
      if (footprint) footprint.style.opacity = sidesHome ? "0" : "1";
      say(readoutOf(s, st.v < -1e-3 || (st.v === 0 && st.target < s)));
    },
    [say, root],
  );

  // ---- loop ----------------------------------------------------------------------------------
  const run = React.useCallback(() => {
    const st = state.current;
    if (st.frame || !st.visible) return;
    st.last = 0;
    const tick = (now: number) => {
      const dt = st.last ? Math.min((now - st.last) / 1000, MOST_DT) : 1 / 60;
      st.last = now;
      const calm = asksForStillness();
      if (st.touring && !calm) {
        st.clock += dt;
        st.target = tourAt(st.clock);
      }
      if (calm) {
        st.s = st.target;
        st.v = 0;
      } else {
        // Critically damped follow with a speed limit, so a jump in the target plays through calmly.
        const w = 1 / SETTLE;
        const steps = 4;
        for (let step = 0; step < steps; step++) {
          const h = dt / steps;
          st.v += (w * w * (st.target - st.s) - 2 * w * st.v) * h;
          st.v = clamp(st.v, -RATE, RATE);
          st.s += st.v * h;
        }
        if (Math.abs(st.target - st.s) < 1e-4 && Math.abs(st.v) < 1e-3) {
          st.s = st.target;
          st.v = 0;
        }
        st.s = clamp(st.s, S_BOX, S_BUILT);
      }
      draw(st.s);
      const done = !st.touring && st.s === st.target;
      st.frame = done || !st.visible ? 0 : requestAnimationFrame(tick);
    };
    st.frame = requestAnimationFrame(tick);
  }, [draw]);

  const stop = React.useCallback(() => {
    cancelAnimationFrame(state.current.frame);
    state.current.frame = 0;
  }, []);

  const announce = React.useCallback(() => {
    window.clearTimeout(timers.current.announce);
    timers.current.announce = window.setTimeout(() => {
      const node = root.current;
      const text = spokenOf(state.current.target);
      if (node && node.getAttribute("aria-valuetext") !== text) node.setAttribute("aria-valuetext", text);
      node?.setAttribute("aria-valuenow", String(Math.round(state.current.target)));
      if (live.current && document.activeElement === node) live.current.textContent = text;
    }, 700);
  }, [root]);

  const scheduleTour = React.useCallback(
    (delay: number) => {
      window.clearTimeout(timers.current.tour);
      if (asksForStillness()) return;
      timers.current.tour = window.setTimeout(() => {
        // The tour stays paused while the pointer rests on the figure or it has focus.
        if (engaged.current.hover || engaged.current.focus) return;
        const st = state.current;
        // Resume the loop from wherever the reader left it: find the tour moment nearest s.
        let best = 0;
        let bestOff = Infinity;
        for (let t = 0; t < TOUR_LENGTH; t += 0.05) {
          const off = Math.abs(tourAt(t) - st.s);
          if (off < bestOff - 1e-9) {
            bestOff = off;
            best = t;
          }
        }
        st.clock = bestOff < 0.02 ? best : 0;
        st.touring = true;
        run();
      }, delay);
    },
    [run],
  );

  /** The reader takes over: stop the tour, aim for `target`, resume the tour after a quiet spell. */
  const steer = React.useCallback(
    (target: number) => {
      const st = state.current;
      st.touring = false;
      st.target = clamp(target, S_BOX, S_BUILT);
      announce();
      run();
      window.clearTimeout(timers.current.back);
      scheduleTour(TOUR_BACK);
    },
    [announce, run, scheduleTour],
  );

  // ---- mount -----------------------------------------------------------------------------------
  React.useEffect(() => {
    const node = root.current;
    if (!node) return;
    for (const item of node.querySelectorAll<SVGGElement>(".uf-items > [data-id]")) nodes.current.set(item.dataset.id!, item);
    for (const halo of node.querySelectorAll<SVGPathElement>("[data-halo]")) halos.current.set(halo.dataset.halo!, halo);
    state.current.drawn = S_BUILT; // the server drew the built pose (with data-mode and data-sig on every part)
    state.current.order = [...nodes.current.keys()].join(" ");

    // Mirror the page's theme onto the figure and follow it.
    const hero = node.closest<HTMLElement>(".uf-hero");
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => hero?.setAttribute("data-theme", themeOf());
    apply();
    const watcher = new MutationObserver(apply);
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    query.addEventListener("change", apply);

    const observer = new IntersectionObserver(
      (entries) => {
        const st = state.current;
        st.visible = Boolean(entries[entries.length - 1]?.isIntersecting);
        if (st.visible) {
          if (!st.touring && st.s === st.target && !timers.current.tour) scheduleTour(TOUR_FIRST * 1000);
          run();
        } else stop();
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(node);
    const pending = timers.current;
    return () => {
      observer.disconnect();
      watcher.disconnect();
      query.removeEventListener("change", apply);
      window.clearTimeout(pending.tour);
      window.clearTimeout(pending.back);
      window.clearTimeout(pending.announce);
      stop();
    };
  }, [root, run, scheduleTour, stop]);

  // ---- input -----------------------------------------------------------------------------------
  const sAt = (clientX: number) => {
    const svg = root.current?.querySelector("svg");
    const box = svg?.getBoundingClientRect();
    if (!box || !box.width) return null;
    // Toward the cabinet (left) is built; toward the carton (right) is back in the box.
    const fx = (clientX - box.left) / box.width;
    return S_BUILT * (1 - clamp((fx - 0.16) / 0.68, 0, 1));
  };

  const press = React.useRef<{ x: number; y: number; id: number } | null>(null);
  const release = (what: "hover" | "focus") => {
    engaged.current[what] = false;
    scheduleTour(TOUR_BACK);
  };

  return (
    <div
      ref={root}
      className="uf-stage"
      role="slider"
      tabIndex={0}
      aria-label="Flat-pack cabinet: move across the figure, or use the arrow keys, to go from the carton to the built cabinet step by step"
      aria-valuemin={S_BOX}
      aria-valuemax={S_BUILT}
      aria-valuenow={S_BUILT}
      aria-valuetext={props.spoken}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") engaged.current.hover = true;
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") release("hover");
      }}
      onFocus={() => {
        engaged.current.focus = true;
      }}
      onBlur={() => release("focus")}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        engaged.current.hover = true;
        const s = sAt(event.clientX);
        if (s !== null) steer(s);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        press.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerUp={(event) => {
        const down = press.current;
        press.current = null;
        if (!down || event.pointerType === "mouse") return;
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) return;
        // A tap assembles; a tap on the built cabinet packs it flat again.
        const st = state.current;
        steer(st.target >= S_BUILT - 1e-3 && st.s >= S_BUILT - 1e-3 ? S_BOX : S_BUILT);
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
      onKeyDown={(event) => {
        const st = state.current;
        const from = st.touring ? st.s : st.target;
        let to: number | null = null;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") to = Math.floor(from + 1e-6) + 1;
        else if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = Math.ceil(from - 1e-6) - 1;
        else if (event.key === "Home") to = S_BOX;
        else if (event.key === "End") to = S_BUILT;
        else if (event.key === " " || event.key === "Enter") to = from >= S_BUILT - 1e-3 ? S_BOX : S_BUILT;
        else if (event.key === "Escape") to = from;
        if (to === null) return;
        event.preventDefault();
        steer(to);
      }}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={props.label}>
        {props.base}
        {props.footprint}
        {props.sceneryHalos}
        <g className="uf-halos">
          {props.halos.map((halo) => (
            <path
              key={halo.id}
              ref={(path) => {
                if (path) halos.current.set(halo.id, path);
              }}
              className="iso-halo uf-halo-part"
              data-halo={halo.id}
              d={halo.d}
              style={{ opacity: halo.alpha }}
            />
          ))}
        </g>
        {props.items}
      </IsoFigure>
      <span ref={live} className="uf-live" aria-live="polite" />
    </div>
  );
}

export { stepOf };
