// Composes a still of the figure at any moment s: the base layers, the floor shadows of the panels,
// and every sorted item with its art. Used by the server for the first paint and by the Node checks.
import { PARTS, PART, readoutOf, spokenOf, S_BUILT } from "./model";
import { frameAt, homeSvg, type PartState } from "./frame";
import { paintOrder, type Sortable } from "./order";
import { SCENERY } from "./scenery-shapes";
import { footprintSvg, plateSvg, sceneryHalosSvg, scenerySvg } from "./scenery";
import { P } from "./view";

export interface SceneItem {
  id: string;
  svg: string;
  transform: string;
  hidden: boolean;
  lit: boolean;
  scenery: boolean;
  /** For parts: "home" (prebuilt art, moved) or "rebuild", and the signature of the rebuilt art. */
  mode: "home" | "rebuild" | "static";
  sig: string;
}

export interface Scene {
  base: string;
  footprint: string;
  footprintOpacity: number;
  sceneryHalos: string;
  halos: Array<{ id: string; d: string; alpha: number }>;
  items: SceneItem[];
  readout: string;
  spoken: string;
}

/** How visible the dotted "where it stands" outline is: gone once the sides stand on it. */
export const footprintOpacityOf = (states: PartState[]) => {
  const sides = states.filter((state) => state.id === "side-r" || state.id === "side-l");
  const home = sides.every((state) => state.mode === "home" && Math.abs(state.shift[0]) < 0.5 && Math.abs(state.shift[1]) < 0.5);
  return home ? 0 : 1;
};

export const withLit = (svg: string, lit: boolean) => (lit ? svg.replace(/class="iso-solid( [^"]*)?"/g, (match) => `${match} data-lit=""`) : svg);

export function sceneAt(s: number = S_BUILT): Scene {
  const states = frameAt(s, P);
  const sortable: Sortable[] = Object.entries(SCENERY).map(([id, box]) => ({ id, box }));
  for (const state of states) if (state.visible && state.box) sortable.push({ id: state.id, box: state.box });
  const order = paintOrder(sortable, P);
  const byId = new Map(states.map((state) => [state.id, state]));
  const items: SceneItem[] = order.map((id) => {
    const state = byId.get(id);
    if (!state) return { id, svg: scenerySvg(id), transform: "", hidden: false, lit: false, scenery: true, mode: "static" as const, sig: "" };
    const svg = state.mode === "home" ? homeSvg(PART[id]!, P) : state.render();
    const transform = state.mode === "home" && (state.shift[0] || state.shift[1]) ? `translate(${state.shift[0]} ${state.shift[1]})` : "";
    return { id, svg: withLit(svg, state.lit), transform, hidden: false, lit: state.lit, scenery: false, mode: state.mode, sig: state.sig };
  });
  // Parts that are hidden (wholly inside their hosts) still get a node, at the end, for later frames.
  for (const state of states) {
    if (state.visible) continue;
    items.push({ id: state.id, svg: homeSvg(PART[state.id]!, P), transform: "", hidden: true, lit: false, scenery: false, mode: "home", sig: "home" });
  }
  const halos = states.filter((state) => state.halo).map((state) => ({ id: state.id, d: state.halo!.d, alpha: state.halo!.alpha }));
  return {
    base: plateSvg(),
    footprint: footprintSvg(),
    footprintOpacity: footprintOpacityOf(states),
    sceneryHalos: sceneryHalosSvg(),
    halos,
    items,
    readout: readoutOf(s),
    spoken: spokenOf(s),
  };
}

/** The scene as one SVG body string (for standalone checks). */
export function sceneSvg(scene: Scene) {
  const halos = scene.halos.map((halo) => `<path class="iso-halo uf-halo-part" data-halo="${halo.id}" d="${halo.d}" style="opacity:${halo.alpha}"/>`).join("");
  const items = scene.items
    .map((item) => `<g class="uf-item" data-id="${item.id}"${item.transform ? ` transform="${item.transform}"` : ""}${item.hidden ? ' display="none"' : ""}>${item.svg}</g>`)
    .join("");
  return `${scene.base}<g class="uf-footprint" style="opacity:${scene.footprintOpacity}">${scene.footprint}</g>${scene.sceneryHalos}<g class="uf-halos">${halos}</g><g class="uf-items">${items}</g>`;
}

export const PART_IDS = PARTS.map((part) => part.id);
