// Fig 1 · Flat-pack, unflattened. A server component: it draws the built cabinet once (every path
// computed here) and hands the layers to one client component that moves them.
import { Plate } from "../../lib/iso/react/draw";
import "../../lib/iso/iso.css";
import "./hero.css";
import { HeroLive } from "./live";
import { CAB, CARTON, PART_COUNT, S_BUILT } from "./model";
import { sceneAt } from "./scene";

const LABEL = `A flat-pack carton open on a bench, beside its assembly booklet, a hex key and a tray of hardware. Its ${PART_COUNT} parts (two sides, top, bottom and a fixed shelf in 16 mm birch ply, a 3 mm hardboard back folded in three, 8 wooden dowels, 8 cam bolts, 8 cam locks and 4 shelf pins) lift out, turn and hang apart along their assembly axes, then slide home in six steps into a ${CAB.w} × ${CAB.d} × ${CAB.h} mm two-shelf cabinet.`;

export default function HeroFigure() {
  const scene = sceneAt(S_BUILT);
  const base = <g key="base" className="uf-base" dangerouslySetInnerHTML={{ __html: scene.base }} />;
  const footprint = <g key="footprint" className="uf-footprint" style={{ opacity: scene.footprintOpacity }} dangerouslySetInnerHTML={{ __html: scene.footprint }} />;
  const sceneryHalos = <g key="scenery-halos" className="uf-scenery-halos" dangerouslySetInnerHTML={{ __html: scene.sceneryHalos }} />;
  const items = (
    <g key="items" className="uf-items">
      {scene.items.map((item) => (
        <g
          key={item.id}
          className="uf-item"
          data-id={item.id}
          data-mode={item.scenery ? undefined : item.mode}
          data-sig={item.scenery ? undefined : item.sig}
          data-lit={item.lit ? "1" : undefined}
          transform={item.transform || undefined}
          display={item.hidden ? "none" : undefined}
          dangerouslySetInnerHTML={{ __html: item.svg }}
        />
      ))}
    </g>
  );
  return (
    <div className="iso uf-hero">
      <Plate
        fig="Fig 1"
        title="Flat-pack, unflattened"
        hint={
          <>
            <span className="uf-hint-hover">Hover to assemble</span>
            <span className="uf-hint-touch">Tap to assemble</span>
          </>
        }
        readout={scene.readout}
        keys={[
          { mark: "lit", label: "The part moving now" },
          { mark: "raised", label: "16 mm birch-ply panels" },
          { mark: "dotted", label: "Where the cabinet stands" },
        ]}
        caption={`A ${CAB.w} × ${CAB.d} × ${CAB.h} mm cabinet packed flat in an ${CARTON.l} × ${CARTON.w} × ${CARTON.h} mm carton: five panels, a back folded in three, 8 dowels, 8 cam bolts, 8 cam locks and 4 shelf pins, ${PART_COUNT} parts in six steps.`}
      >
        <HeroLive label={LABEL} base={base} footprint={footprint} sceneryHalos={sceneryHalos} items={items} halos={scene.halos} readout={scene.readout} spoken={scene.spoken} />
      </Plate>
    </div>
  );
}
