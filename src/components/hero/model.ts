// The truth for Fig 1. Every size is in millimetres (1 world unit = 1 mm), and every pose,
// number and word the figure shows comes from this one module as a pure function of `s`:
//   s = 0        in the box: panels stacked flat in the carton, hardware in its tray
//   s = 0 → 2    unpacking: panels lift out, turn and hang at their exploded ("apart") places, then
//                the hardware leaves its tray
//   s = k+1 → k+2 (k = 1..6) assembly step k, parts sliding home along their real insertion axes
//   s = 8        built
// Every flight is a list of keyframes (lift, dwell and turn, traverse, slide in), each leg eased,
// planned so nothing passes through anything (`scripts/hero/audit.mjs` replays every frame).
import { IDENTITY, add, axisAngle, clamp, ease, lerp, matOf, mulQ, scale, slerp, windowed, type Mat3, type Quat, type Vec3 } from "./math";

export const S_BOX = 0;
export const S_APART = 2;
export const S_BUILT = 8;
export const STEPS = 6;

/** The cabinet: 600 wide, 300 deep, 800 tall, 16 mm birch panels, a 3 mm hardboard back folded in three. */
export const CAB = {
  w: 600,
  d: 300,
  h: 800,
  t: 16,
  back: 3,
  plinth: 50, // underside of the bottom panel
  shelfZ: 417, // underside of the fixed shelf
  shelfD: 290, // the shelf sits 10 mm back from the front edges
  fold: 250, // the back folds into three 250 mm leaves
} as const;

/** Front of the cabinet faces +x; its width runs along y; z is up. */
const X_MID = CAB.d / 2;

// ---------------------------------------------------------------------------------------------
// Carton, tray and booklet positions on the bench (the carton's long axis runs along x).
export const CARTON = { x: -210, y: -720, l: 836, w: 336, h: 100, board: 5 } as const;
const IN_X = CARTON.x + CARTON.board;
const IN_Y = CARTON.y + CARTON.board;
const FLOOR_Z = CARTON.board;
const STACK_X = IN_X + 13; // panels butt against the far wall with a 13 mm crumple gap
const STACK_Y_MID = IN_Y + (CARTON.w - 2 * CARTON.board) / 2;
/** A corrugated spacer fills the end of the carton under the overhang of the long side panels. */
export const FILLER = { x: STACK_X + 568 + 1, y: STACK_Y_MID - 150, w: 800 - 568 - 2, d: 300, z: FLOOR_Z, h: 48 } as const;

/** Hardware tray, in front of the right side where no panel passes: x 400..550, y -150..-22, a cross divider. */
export const TRAY = { x: 400, y: -150, w: 150, d: 128, h: 16, wall: 3, floor: 2, divX: 482, divY: -86, div: 3 } as const;
export const BOOK = { x: 388, y: 168, w: 210, d: 300, t: 2.4 } as const;

// ---------------------------------------------------------------------------------------------
// Parts
export type Kind = "panel" | "leaf" | "dowel" | "bolt" | "cam" | "pin";

/** A face a part can sink into: its plane is host-local axis `axis` at `sign * half`. */
export interface Entry {
  host: string;
  axis: 0 | 1 | 2;
  sign: 1 | -1;
}

export interface Move {
  window: readonly [number, number];
  by: Vec3;
}

/** A keyframe of a flight: where the part's centre is at flight progress u. */
export interface Key {
  u: number;
  at: Vec3;
}

/** A world rotation applied over the flight progress window [from, to]. */
export interface Turn {
  q: Quat;
  from: number;
  to: number;
}

export interface Part {
  id: string;
  kind: Kind;
  label: string;
  /** Built centre (world) and half extents in the part's own frame (local = world when built). */
  centre: Vec3;
  half: Vec3;
  /** Rotation of the part in the carton or tray (the inverse of its turns). */
  boxRot: Quat;
  /** The way out of the box: keyframes from the box (u = 0) to the apart place (u = 1), and the turns. */
  keys: Key[];
  turns: Turn[];
  unpack: readonly [number, number];
  /** Assembly moves: inside a window the part travels the rest of `by` home. Their sum is the apart offset. */
  moves: Move[];
  /** The step (1..6) whose arrival completes this part; 0 for parts that are home once unpacked. */
  step: number;
  /** For turned hardware: the profile along +y (or ±z for cams) from the frame origin, and its sign. */
  dir?: 1 | -1;
  origin?: Vec3;
  profile?: Array<[number, number]>;
  /** Faces this part sinks into. Visible faces cut the drawing; hidden ones only the sort shape. */
  entries: Entry[];
  /** Cam locks turn their slot once seated. */
  turn?: readonly [number, number];
}

const Z = (degrees: number) => axisAngle([0, 0, 1], degrees);
const Y = (degrees: number) => axisAngle([0, 1, 0], degrees);
const X = (degrees: number) => axisAngle([1, 0, 0], degrees);

/** The rotation that lays a part from its built frame into the box: the inverse of its turns. */
function boxRotationOf(turns: Turn[]): Quat {
  let q: Quat = IDENTITY;
  for (const turn of turns) q = mulQ(turn.q, q);
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Assembly step k occupies s in [k + 1, k + 2]; a window inside it. */
const step = (k: number, from: number, to: number) => [S_APART + k - 1 + from, S_APART + k - 1 + to] as const;

const parts: Part[] = [];
const put = (part: Part) => {
  parts.push(part);
  return part;
};
const apartOf = (centre: Vec3, moves: Move[]) => moves.reduce((at, move) => add(at, move.by), centre);

// ---- Panels -----------------------------------------------------------------------------------
const SIDE_OUT = 92; // the sides hang 92 mm out in the apart pose
const BACK_OUT = 120;
const SIDE_STEP = step(4, 0.06, 0.86);
const LIFT = 330; // flights rise clear of the carton's standing flaps (top 263) before they turn

/** Stand on the long edge (about x), then swing the length upright (about y). */
const sideTurns = (stand: readonly [number, number], swing: readonly [number, number]): Turn[] => [
  { q: X(-90), from: stand[0], to: stand[1] },
  { q: Y(-90), from: swing[0], to: swing[1] },
];
const COLUMN_Y = CAB.t / 2 - SIDE_OUT; // where the right side hangs, and where both sides swing upright

function side(id: "side-r" | "side-l", boxZ: number, window: readonly [number, number]) {
  const right = id === "side-r";
  const centre: Vec3 = [X_MID, right ? CAB.t / 2 : CAB.w - CAB.t / 2, CAB.h / 2];
  const moves: Move[] = [{ window: SIDE_STEP, by: [0, right ? -SIDE_OUT : SIDE_OUT, 0] }];
  const apart = apartOf(centre, moves);
  const box: Vec3 = [STACK_X + 400, STACK_Y_MID, boxZ];
  const up: Vec3 = [box[0], box[1], LIFT];
  const column: Vec3 = [X_MID, COLUMN_Y, 450];
  const keys: Key[] = right
    ? [
        { u: 0, at: box },
        { u: 0.22, at: up },
        { u: 0.34, at: up },
        { u: 0.64, at: column },
        { u: 0.82, at: column },
        { u: 1, at: apart },
      ]
    : [
        // The left side is first out and swings upright in the right side's empty column, then
        // slides across through the empty cabinet to the far side.
        { u: 0, at: box },
        { u: 0.16, at: up },
        { u: 0.26, at: up },
        { u: 0.46, at: column },
        { u: 0.58, at: column },
        { u: 0.9, at: [apart[0], apart[1], 440] },
        { u: 1, at: apart },
      ];
  const turns = right ? sideTurns([0.2, 0.34], [0.64, 0.82]) : sideTurns([0.14, 0.26], [0.46, 0.58]);
  return put({
    id,
    kind: "panel",
    label: right ? "right side" : "left side",
    centre,
    half: [CAB.d / 2, CAB.t / 2, CAB.h / 2],
    boxRot: boxRotationOf(turns),
    keys,
    turns,
    unpack: window,
    moves,
    step: 4,
    entries: [],
  });
}

/**
 * Top, bottom and shelf: lift, turn flat above the carton, out to the front of the cabinet, across
 * in front of the right side, then in between the sides along -x.
 */
function flat(id: string, label: string, z: number, depth: number, boxZ: number, window: readonly [number, number], lift: number) {
  const centre: Vec3 = [depth / 2, CAB.w / 2, z + CAB.t / 2];
  const box: Vec3 = [STACK_X + 284, STACK_Y_MID, boxZ];
  const up: Vec3 = [box[0], box[1], lift];
  const out: Vec3 = [560, box[1], lift];
  const front: Vec3 = [560, centre[1], centre[2] + 40];
  const CLEAR_Y = CARTON.y + CARTON.w + (CAB.w / 2 - CAB.t) + 12; // the panel's far edge just past the carton
  const turns: Turn[] = [{ q: Z(-90), from: 0.2, to: 0.36 }];
  return put({
    id,
    kind: "panel",
    label,
    centre,
    half: [depth / 2, CAB.w / 2 - CAB.t, CAB.t / 2],
    boxRot: boxRotationOf(turns),
    keys: [
      { u: 0, at: box },
      { u: 0.2, at: up },
      { u: 0.36, at: up },
      { u: 0.5, at: out },
      // Hold the height until clear of the carton and its standing end flap, then change it.
      { u: 0.64, at: [out[0], CLEAR_Y, out[2]] },
      { u: 0.8, at: front },
      { u: 1, at: centre },
    ],
    turns,
    unpack: window,
    moves: [],
    step: 0,
    entries: [],
  });
}

// The stack, top first: back (folded), left side, right side, top, bottom, shelf.
const sideL = side("side-l", FLOOR_Z + 64 + 8, [0.24, 0.84]);
const sideR = side("side-r", FLOOR_Z + 48 + 8, [0.5, 1.02]);
// Each flat panel turns at its own height above the carton, so the next one up never meets it.
const top = flat("top", "top", CAB.h - CAB.t, CAB.d, FLOOR_Z + 32 + 8, [0.7, 1.24], LIFT + 50);
const bottom = flat("bottom", "bottom", CAB.plinth, CAB.d, FLOOR_Z + 16 + 8, [0.82, 1.36], LIFT);
const shelf = flat("shelf", "fixed shelf", CAB.shelfZ, CAB.shelfD, FLOOR_Z + 8, [0.98, 1.52], LIFT - 35);
void sideL;
void sideR;

// The back: three leaves of 3 mm hardboard, hinged on scored folds, folded zig-zag on top of the stack.
const BACK_STEP = step(6, 0.08, 0.9);
const BACK_MOVES: Move[] = [{ window: BACK_STEP, by: [-BACK_OUT, 0, 0] }];
const BACK_CENTRE: Vec3 = [-CAB.back / 2, CAB.w / 2, CAB.plinth + CAB.fold / 2]; // leaf A (lowest) when built
const BACK_APART = apartOf(BACK_CENTRE, BACK_MOVES);
const BACK_BOX: Vec3 = [STACK_X + 400, STACK_Y_MID, FLOOR_Z + 80 + 1.5];
const BACK_UP: Vec3 = [BACK_BOX[0], BACK_BOX[1], 310];
const BACK_TURNS: Turn[] = [
  { q: X(90), from: 0.18, to: 0.32 }, // stand the folded stack on its long edge
  { q: Z(90), from: 0.36, to: 0.6 }, // turn it to face the cabinet's back
];
export const BACK = {
  centre: BACK_CENTRE,
  boxRot: boxRotationOf(BACK_TURNS),
  turns: BACK_TURNS,
  unpack: [0, 0.5] as const,
  unfold: [0.66, 1] as const, // share of the flight over which the leaves swing open, upward, in place
  keys: [
    { u: 0, at: BACK_BOX },
    { u: 0.18, at: BACK_UP },
    { u: 0.32, at: BACK_UP },
    { u: 0.62, at: [BACK_APART[0], BACK_APART[1], 330] as Vec3 },
    { u: 1, at: BACK_APART },
  ] as Key[],
  moves: BACK_MOVES,
};
const LEAF_HALF: Vec3 = [CAB.back / 2, CAB.w / 2, CAB.fold / 2];
for (const [index, id] of ["back-a", "back-b", "back-c"].entries()) {
  put({
    id,
    kind: "leaf",
    label: "back",
    centre: [BACK.centre[0], BACK.centre[1], BACK.centre[2] + index * CAB.fold],
    half: LEAF_HALF,
    boxRot: BACK.boxRot,
    keys: BACK.keys,
    turns: BACK.turns,
    unpack: BACK.unpack,
    moves: BACK.moves,
    step: 6,
    entries: [],
  });
}

// ---- Hardware ---------------------------------------------------------------------------------
// Profiles are [s, r] along the part's axis from its origin (closed to the axis at both ends).
const DOWEL: Array<[number, number]> = [
  [0, 3.1],
  [0.9, 4],
  [29.1, 4],
  [30, 3.1],
];
const BOLT: Array<[number, number]> = [
  [0, 1.1],
  [1.6, 2.5],
  [11, 2.5],
  [11, 4.4],
  [13, 4.4],
  [13, 2.3],
  [40, 2.3],
  [40, 3.6],
  [45.5, 3.6],
  [46.6, 2.6],
];
/** Shelf pin: a 5 mm peg into the drilled hole and a 6.8 mm support the shelf rests on. */
export const PIN_R = 3.4;
const PIN: Array<[number, number]> = [
  [0, 2.1],
  [0.8, 2.5],
  [8, 2.5],
  [8, PIN_R],
  [19.4, PIN_R],
  [20, 2.8],
];
export const CAM = { r: 7.5, h: 12.5 } as const;

const yOf = (side: "r" | "l") => (side === "r" ? CAB.t : CAB.w - CAB.t); // inner face of that side
const sign = (side: "r" | "l") => (side === "r" ? 1 : -1); // +y points from the right side into the cabinet

// Tray pockets: bolts and dowels side by side across x in the left pockets, cams in a 4 × 2 grid,
// shelf pins in a row. Each entry is the first part centre in that pocket.
const TRAY_FLOOR = TRAY.floor;
const LEFT_X = TRAY.x + TRAY.wall + 5.6;
const RIGHT_X = TRAY.divX + TRAY.div;
const NEAR_Y = TRAY.divY + TRAY.div; // pockets on the +y side of the cross divider
const pocket = {
  bolts: { x: LEFT_X, y: (TRAY.y + TRAY.wall + TRAY.divY) / 2 },
  dowels: { x: LEFT_X, y: (NEAR_Y + TRAY.y + TRAY.d - TRAY.wall) / 2 },
  cams: { x: RIGHT_X + 8.6, y: TRAY.y + TRAY.wall + 9.2 },
  pins: { x: RIGHT_X + 10, y: (NEAR_Y + TRAY.y + TRAY.d - TRAY.wall) / 2 },
};


/**
 * Hardware flies in two stages. First every piece rises straight up out of its pocket to its own
 * altitude lane and hovers there (vertical moves at distinct spots never meet). Then, band by band,
 * lowest lane first, each one crosses at its lane to the front of its place, drops to it and slides
 * in along -x. Lanes are banded by destination level (top, shelf, bottom), so a drop only ever
 * passes lanes of its own band, and those have already crossed.
 */
const RISE = [1.36, 1.5] as const;
const RISE_LENGTH = 0.1;
const CROSS = { from: 1.5, gap: 0.034, length: 0.17 };
function hardwareKeys(box: Vec3, apart: Vec3, lane: number, approach: Vec3, window: readonly [number, number], cross: number): Key[] {
  const span = window[1] - window[0];
  const u = (t: number) => (t - window[0]) / span;
  const front = add(apart, approach);
  return [
    { u: 0, at: box },
    { u: u(window[0] + RISE_LENGTH), at: [box[0], box[1], lane] },
    { u: u(cross), at: [box[0], box[1], lane] },
    { u: u(cross + 0.1), at: [front[0], front[1], lane] },
    { u: u(cross + 0.15), at: front },
    { u: 1, at: apart },
  ];
}
const TRAY_AT = new Map<string, { box: Vec3; approach: Vec3 }>();

const hardware: Part[] = [];
function bolt(side: "r" | "l", host: Part, x: number, index: number) {
  const k = sign(side);
  const z = host.centre[2];
  const origin: Vec3 = [x, yOf(side) - k * 11, z];
  const length = BOLT[BOLT.length - 1]![0];
  const centre: Vec3 = [x, origin[1] + (k * length) / 2, z];
  const moves: Move[] = [
    { window: step(1, 0.04 + index * 0.1, 0.04 + index * 0.1 + 0.26), by: [0, k * 44, 0] },
    { window: SIDE_STEP, by: [0, side === "r" ? -SIDE_OUT : SIDE_OUT, 0] },
  ];
  const box: Vec3 = [pocket.bolts.x + index * 9, pocket.bolts.y, TRAY_FLOOR + 4.4];
  TRAY_AT.set(`bolt-${side}-${host.id}-${x}`, { box, approach: [330, 0, 52] });
  const part: Part = {
    id: `bolt-${side}-${host.id}-${x}`,
    kind: "bolt",
    label: "cam bolt",
    centre,
    half: [4.4, length / 2, 4.4],
    boxRot: IDENTITY,
    keys: [],
    turns: [],
    unpack: [0, 0],
    moves,
    step: 1,
    dir: k,
    origin,
    profile: BOLT,
    entries: [
      { host: side === "r" ? "side-r" : "side-l", axis: 1, sign: k as 1 | -1 },
      { host: host.id, axis: 1, sign: (-k) as 1 | -1 },
    ],
  };
  hardware.push(put(part));
}

function dowel(side: "r" | "l", host: Part, x: number, index: number) {
  const k = sign(side);
  const z = host.centre[2];
  const origin: Vec3 = [x, yOf(side) - k * 15, z];
  const centre: Vec3 = [x, yOf(side), z];
  const moves: Move[] = [{ window: step(2, 0.04 + index * 0.1, 0.04 + index * 0.1 + 0.26), by: [0, -k * 52, 0] }];
  const box: Vec3 = [pocket.dowels.x + index * 9, pocket.dowels.y, TRAY_FLOOR + 4];
  TRAY_AT.set(`dowel-${side}-${host.id}-${x}`, { box, approach: [330, 0, 0] });
  hardware.push(
    put({
      id: `dowel-${side}-${host.id}-${x}`,
      kind: "dowel",
      label: "dowel",
      centre,
      half: [4, 15, 4],
      boxRot: IDENTITY,
      keys: [],
      turns: [],
      unpack: [0, 0],
      moves,
      step: 2,
      dir: k,
      origin,
      profile: DOWEL,
      entries: [
        { host: host.id, axis: 1, sign: (-k) as 1 | -1 },
        { host: side === "r" ? "side-r" : "side-l", axis: 1, sign: k as 1 | -1 },
      ],
    }),
  );
}

function pin(side: "r" | "l", x: number, index: number) {
  const k = sign(side);
  const z = CAB.shelfZ - PIN_R;
  const origin: Vec3 = [x, yOf(side) - k * 8, z];
  const centre: Vec3 = [x, origin[1] + k * 10, z];
  const moves: Move[] = [
    { window: step(3, 0.06 + index * 0.2, 0.06 + index * 0.2 + 0.3), by: [0, k * 40, 0] },
    { window: SIDE_STEP, by: [0, side === "r" ? -SIDE_OUT : SIDE_OUT, 0] },
  ];
  const box: Vec3 = [pocket.pins.x + index * 10, pocket.pins.y, TRAY_FLOOR + PIN_R];
  TRAY_AT.set(`pin-${side}-${x}`, { box, approach: [320, 0, -36] });
  hardware.push(
    put({
      id: `pin-${side}-${x}`,
      kind: "pin",
      label: "shelf pin",
      centre,
      half: [PIN_R, 10, PIN_R],
      boxRot: IDENTITY,
      keys: [],
      turns: [],
      unpack: [0, 0],
      moves,
      step: 3,
      dir: k,
      origin,
      profile: PIN,
      entries: [{ host: side === "r" ? "side-r" : "side-l", axis: 1, sign: k as 1 | -1 }],
    }),
  );
}

function cam(side: "r" | "l", host: Part, x: number, index: number) {
  const k = sign(side);
  const below = host.id === "top";
  const y = yOf(side) + k * 32;
  const faceZ = below ? host.centre[2] - CAB.t / 2 : host.centre[2] + CAB.t / 2;
  const centre: Vec3 = [x, y, below ? faceZ + CAM.h / 2 : faceZ - CAM.h / 2];
  const at = 0.04 + index * 0.1;
  const moves: Move[] = [{ window: step(5, at, at + 0.2), by: [0, 0, below ? -64 : 64] }];
  const box: Vec3 = [pocket.cams.x + (index % 4) * 15.3, pocket.cams.y + Math.floor(index / 4) * 16.6, TRAY_FLOOR + CAM.h / 2];
  TRAY_AT.set(`cam-${side}-${host.id}-${x}`, { box, approach: [300, 0, below ? -34 : 48] });
  hardware.push(
    put({
      id: `cam-${side}-${host.id}-${x}`,
      kind: "cam",
      label: "cam lock",
      centre,
      half: [CAM.r, CAM.r, CAM.h / 2],
      boxRot: IDENTITY,
      keys: [],
      turns: [],
      unpack: [0, 0],
      moves,
      step: 5,
      dir: below ? -1 : 1, // the slot face looks into the cabinet: up on the bottom, down under the top
      entries: [{ host: host.id, axis: 2, sign: below ? -1 : 1 }],
      turn: step(5, at + 0.2, at + 0.3),
    }),
  );
}

let n = 0;
for (const side of ["r", "l"] as const) for (const host of [bottom, top]) for (const x of [52, 248]) bolt(side, host, x, n++);
n = 0;
for (const side of ["r", "l"] as const) {
  for (const [host, x] of [
    [bottom, 150],
    [top, 150],
    [shelf, 72],
    [shelf, 218],
  ] as const)
    dowel(side, host, x, n++);
}
n = 0;
// Shelf pins sit in the System 32 rows, 37 mm in from the back and front edges.
for (const side of ["r", "l"] as const) for (const x of [37, CAB.d - 37]) pin(side, x, n++);
n = 0;
for (const side of ["r", "l"] as const) for (const host of [bottom, top]) for (const x of [52, 248]) cam(side, host, x, n++);

// Hardware flights: top band first, then shelf, then bottom; each part its own lane and window.
{
  const levelOf = (part: Part) => {
    const z = apartOf(part.centre, part.moves)[2];
    return z > 600 ? 0 : z > 200 ? 1 : 2;
  };
  const BANDS = [830, 470, 160]; // lowest lane of each band
  // Within a band the deepest places (smallest x) fill first, so nothing slides in past a part already parked.
  const order = [...hardware].sort((a, b) => levelOf(a) - levelOf(b) || a.centre[0] - b.centre[0] || a.centre[1] - b.centre[1]);
  const used = [0, 0, 0];
  order.forEach((part, index) => {
    const level = levelOf(part);
    const rank = used[level]!++;
    const lane = BANDS[level]! + 19 * rank;
    const rise = RISE[0] + ((RISE[1] - RISE_LENGTH - RISE[0]) * index) / (order.length - 1);
    const cross = CROSS.from + CROSS.gap * rank;
    const window = [rise, cross + CROSS.length] as const;
    const { box, approach } = TRAY_AT.get(part.id)!;
    part.unpack = window;
    part.keys = hardwareKeys(box, apartOf(part.centre, part.moves), lane, approach, window, cross);
  });
}

export const PARTS: readonly Part[] = parts;
export const PART: Readonly<Record<string, Part>> = Object.fromEntries(parts.map((part) => [part.id, part]));
export const PANEL_IDS = ["side-r", "side-l", "bottom", "top", "shelf"] as const;
export const LEAF_IDS = ["back-a", "back-b", "back-c"] as const;

/** Counted parts: the five panels, the back (one part in three leaves) and 28 pieces of hardware. */
export const PART_COUNT = PANEL_IDS.length + 1 + hardware.length;

// ---------------------------------------------------------------------------------------------
// Poses
export interface Pose {
  centre: Vec3;
  rot: Quat;
  m: Mat3;
  /** Flight progress 0..1. */
  out: number;
  flying: boolean;
}

/** Sum of the assembly moves still to travel at s. */
export function offsetOf(part: { moves: Move[] }, s: number): Vec3 {
  let offset: Vec3 = [0, 0, 0];
  for (const move of part.moves) offset = add(offset, scale(move.by, 1 - windowed(s, move.window)));
  return offset;
}

/** Position along keyframes at flight progress u, each leg eased. */
function along(keys: Key[], u: number): Vec3 {
  if (u <= keys[0]!.u) return keys[0]!.at;
  for (let index = 0; index < keys.length - 1; index++) {
    const a = keys[index]!;
    const b = keys[index + 1]!;
    if (u <= b.u) return lerp(a.at, b.at, ease((u - a.u) / (b.u - a.u || 1)));
  }
  return keys[keys.length - 1]!.at;
}

function rotationAt(boxRot: Quat, turns: Turn[], u: number): Quat {
  if (u >= 1) return IDENTITY;
  let rot = boxRot;
  for (const turn of turns) rot = mulQ(slerp(IDENTITY, turn.q, ease((u - turn.from) / (turn.to - turn.from))), rot);
  return rot;
}

/** Flight progress of a part at s (linear in s; legs ease themselves). */
const progress = (part: { unpack: readonly [number, number] }, s: number) => clamp((s - part.unpack[0]) / (part.unpack[1] - part.unpack[0] || 1));

export function poseOf(part: Part, s: number): Pose {
  if (part.kind === "leaf") return leafPose(part, s);
  const u = progress(part, s);
  const offset = offsetOf(part, s);
  const centre = u >= 1 ? add(part.centre, offset) : along(part.keys, u);
  const rot = rotationAt(part.boxRot, part.turns, u);
  return { centre, rot, m: matOf(rot), out: u, flying: u > 0 && u < 1 };
}

/** Fold angle of the back's two hinges at s (180 folded flat, 0 open). */
export function foldOf(s: number) {
  const u = progress(BACK, s);
  return 180 * (1 - ease((u - BACK.unfold[0]) / (BACK.unfold[1] - BACK.unfold[0])));
}

function leafPose(part: Part, s: number): Pose {
  const index = LEAF_IDS.indexOf(part.id as (typeof LEAF_IDS)[number]);
  const u = progress(BACK, s);
  const offset = offsetOf(BACK, s);
  const baseCentre = u >= 1 ? add(BACK.centre, offset) : along(BACK.keys, u);
  const baseRot = rotationAt(BACK.boxRot, BACK.turns, u);
  const fold = foldOf(s);
  // In leaf A's frame: B turns about A's top-front edge, C about B's top-back edge, zig-zag.
  const hingeAB: Vec3 = [CAB.back / 2, 0, CAB.fold / 2];
  const hingeBC: Vec3 = [-CAB.back / 2, 0, CAB.fold * 1.5];
  const turnB = axisAngle([0, 1, 0], fold);
  const turnC = axisAngle([0, 1, 0], -fold);
  let localCentre: Vec3 = [0, 0, 0];
  let localRot: Quat = IDENTITY;
  if (index >= 1) {
    const mB = matOf(turnB);
    localCentre = add(hingeAB, about(mB, [0, 0, CAB.fold], hingeAB));
    localRot = turnB;
    if (index === 2) {
      const cInB = add(hingeBC, about(matOf(turnC), [0, 0, CAB.fold * 2], hingeBC));
      localCentre = add(hingeAB, about(mB, cInB, hingeAB));
      localRot = mulQ(turnB, turnC);
    }
  }
  const m = matOf(baseRot);
  const centre = add(baseCentre, about(m, localCentre, [0, 0, 0]));
  const rot = mulQ(baseRot, localRot);
  return { centre, rot, m: matOf(rot), out: u, flying: u > 0 && u < 1 };
}

/** m applied to (p - pivot). */
function about(m: Mat3, p: Vec3, pivot: Vec3): Vec3 {
  const d: Vec3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  return [m[0][0] * d[0] + m[1][0] * d[1] + m[2][0] * d[2], m[0][1] * d[0] + m[1][1] * d[1] + m[2][1] * d[2], m[0][2] * d[0] + m[1][2] * d[1] + m[2][2] * d[2]];
}

/** The slot of a cam lock turns 90° once it is seated (radians, 0 = unlocked). */
export const camTurnOf = (part: Part, s: number) => (part.turn ? (Math.PI / 2) * windowed(s, part.turn) : 0);

// ---------------------------------------------------------------------------------------------
// Readout
/** A part is placed once its own step has brought it home (top, bottom and shelf once unpacked). */
export const homeAt = (part: Part) => {
  if (part.step === 0) return part.unpack[1];
  return Math.max(part.moves[0]!.window[1], part.turn ? part.turn[1] : 0);
};
const placedOf = (part: Part, s: number) => s >= homeAt(part) - 1e-9;

/** Count each counted part once: the back's three leaves are one part. */
function countParts(test: (part: Part) => boolean) {
  let count = 0;
  let back = false;
  for (const part of parts) {
    if (part.kind === "leaf") {
      if (!back && test(part)) back = true;
      continue;
    }
    if (test(part)) count++;
  }
  return count + (back ? 1 : 0);
}

export const placedCount = (s: number) => countParts((part) => placedOf(part, s));
export const outCount = (s: number) => countParts((part) => progress(part, s) >= 1);

export const stepOf = (s: number) => clamp(Math.ceil(s - S_APART - 1e-9), 1, STEPS);

export const STEP_WORDS = ["cam bolts into the sides", "dowels into top, bottom and shelf", "shelf pins into the sides", "sides slide home", "cam locks dropped in and turned", "back folded open and fitted"];

/** The readout: a phase word and its count, both read at the same s. `back` = moving toward the box. */
export function readoutOf(s: number, back = false) {
  if (s <= S_BOX + 1e-3) return `in the box · ${PART_COUNT} parts`;
  if (back && s < S_BUILT - 1e-3) return s < S_APART ? `flattening · ${outCount(s)} / ${PART_COUNT} out` : `flattening · ${placedCount(s)} parts placed`;
  if (s < S_APART - 1e-3) return `unpacking · ${outCount(s)} / ${PART_COUNT} out`;
  if (s <= S_APART + 1e-3) return `apart · ${PART_COUNT} parts`;
  if (s >= S_BUILT - 1e-3) return `built · ${PART_COUNT} parts placed`;
  return `step ${stepOf(s)} / ${STEPS} · ${placedCount(s)} parts placed`;
}

export function spokenOf(s: number) {
  if (s <= S_BOX + 1e-3) return `In the box: ${PART_COUNT} parts packed flat in the carton, hardware in its tray.`;
  if (s < S_APART - 1e-3) return `Unpacking: ${outCount(s)} of ${PART_COUNT} parts out of the box.`;
  if (s <= S_APART + 1e-3) return `Apart: all ${PART_COUNT} parts laid out along their assembly axes.`;
  if (s >= S_BUILT - 1e-3) return `Built: all ${PART_COUNT} parts placed.`;
  const k = stepOf(s);
  return `Step ${k} of ${STEPS}, ${STEP_WORDS[k - 1]}: ${placedCount(s)} parts placed.`;
}

/**
 * The one lit part: whatever started moving most recently (before anything moves, the top of the
 * stack, which leaves first; once built, the cabinet's top). The back's leaves light together.
 */
export function litOf(s: number): string {
  if (s >= S_BUILT - 1e-6) return "top";
  let best = "back";
  let bestAt = -Infinity;
  for (const part of parts) {
    const own = part.step === 0 ? [] : [part.moves[0]!.window[0]];
    for (const at of [part.unpack[0], ...own]) {
      if (at <= s + 1e-9 && at > bestAt) {
        bestAt = at;
        best = part.kind === "leaf" ? "back" : part.id;
      }
    }
  }
  return best;
}
