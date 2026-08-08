// world.ts — Babylon.js world for "Burn Window", textured procedurally at load.
// Client-side only. Art direction per docs/BURN_WINDOW_VISUAL_BIBLE.md:
//   Z1 lounge = ceramic-tiled blue-grey (#768a9a) with three warm pendants (#e6946d)
//   and a mirror floor (the room's hero feature); everything else = cockpit DNA
//   (#768484 / #59696c / #92a4a7 / #252b2a) built from one repeating panel module with
//   seams and hex fasteners, with the burnt-orange accent (#814525) reserved for
//   interactables, hazard hardware and locked doors. All textures are canvas-drawn —
//   no downloads, CSP-safe, a few hundred KB of GPU memory total.

import {
  AbstractMesh,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  MirrorTexture,
  Plane,
  PointLight,
  Scalar,
  Scene,
  SpotLight,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  Vector4,
  VertexBuffer,
} from '@babylonjs/core';

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export type ZoneId = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6' | 'Z7' | 'Z8';
export type DoorId = 'd_lounge' | 'd_flightdeck' | 'd_bays';

export type InteractableDef = { id: string; zone: ZoneId; label: string };

export type WorldEvents = {
  onInteract: (id: string) => void;
  onHover: (id: string | null) => void;
  onZoneChange: (zone: ZoneId) => void;
  onLockChange: (locked: boolean) => void;
};

export type World = {
  dispose(): void;
  getTransform(): { x: number; y: number; z: number; ry: number };
  setDoorOpen(id: DoorId, open: boolean): void;
  upsertRemote(id: string, name: string, x: number, y: number, z: number, ry: number): void;
  removeRemote(id: string): void;
  requestPointerLock(): void;
};

// ---------------------------------------------------------------------------
// Interactable data
// ---------------------------------------------------------------------------

type InteractableKind = 'box' | 'valve' | 'panel';

type InteractableInternal = {
  id: string;
  zone: ZoneId;
  label: string;
  x: number;
  y: number;
  z: number;
  kind: InteractableKind;
  /** optional yaw so wall-mounted panels face into the room */
  ry?: number;
};

const HALF_PI = Math.PI / 2;

const INTERACTABLE_DATA: InteractableInternal[] = [
  // Z1 lounge
  { id: 'restraints', zone: 'Z1', label: 'Seat restraints', x: 0, y: 1, z: 33, kind: 'box' },
  { id: 'breaker_panel', zone: 'Z1', label: 'Breaker panel', x: -8.5, y: 1.4, z: 27, kind: 'panel', ry: HALF_PI },
  { id: 'keypad', zone: 'Z1', label: 'Door keypad', x: 0.9, y: 1.4, z: 23.4, kind: 'panel' },
  { id: 'valve', zone: 'Z1', label: 'Equalisation valve', x: 0, y: 1.1, z: 36.2, kind: 'valve' },
  { id: 'gauge_port', zone: 'Z1', label: 'Pressure gauge port', x: -0.9, y: 1.4, z: 23.4, kind: 'valve' },
  { id: 'frag_pass', zone: 'Z1', label: 'Boarding pass', x: 6, y: 0.9, z: 34, kind: 'panel' },
  { id: 'frag_placard', zone: 'Z1', label: 'Seat-block placard', x: -7.5, y: 1.6, z: 31, kind: 'panel', ry: HALF_PI },
  { id: 'frag_itinerary', zone: 'Z1', label: 'Itinerary card', x: 7.5, y: 1.1, z: 28, kind: 'panel', ry: -HALF_PI },
  { id: 'frag_notice', zone: 'Z1', label: 'Maintenance notice', x: -6.5, y: 1.5, z: 35, kind: 'panel', ry: HALF_PI },
  // Z2 corridor
  { id: 'token_socket', zone: 'Z2', label: 'Token socket', x: 0.9, y: 1.4, z: 11.4, kind: 'box' },
  { id: 'hatch_crank', zone: 'Z2', label: 'Hatch crank', x: -0.9, y: 1.2, z: 11.4, kind: 'valve' },
  // Z3 galley
  { id: 'galley_hatch', zone: 'Z3', label: 'Service hatch', x: -12.5, y: 1.1, z: 17, kind: 'panel', ry: HALF_PI },
  { id: 'galley_locker', zone: 'Z3', label: 'Galley stowage', x: -9, y: 1, z: 13.5, kind: 'box' },
  { id: 'key_locker', zone: 'Z3', label: 'EVA key locker', x: -6, y: 1.2, z: 20.5, kind: 'box', ry: Math.PI },
  // Z4 crew quarters
  { id: 'crew_terminal', zone: 'Z4', label: 'Crew terminal', x: 9, y: 1.2, z: 20.5, kind: 'panel', ry: Math.PI },
  { id: 'crew_locker', zone: 'Z4', label: 'Crew locker', x: 12.5, y: 1.1, z: 15, kind: 'box', ry: -HALF_PI },
  // Z5 flight deck
  { id: 'nav_console', zone: 'Z5', label: 'Navigation console', x: 0, y: 1.1, z: 2, kind: 'box' },
  { id: 'fault_schematic', zone: 'Z5', label: 'Fault schematic', x: -6.5, y: 1.5, z: 6, kind: 'panel', ry: HALF_PI },
  { id: 'pressures_display', zone: 'Z5', label: 'Tank pressures', x: 6.5, y: 1.5, z: 6, kind: 'panel', ry: -HALF_PI },
  { id: 'interlock_display', zone: 'Z5', label: 'Interlock display', x: 6.5, y: 1.5, z: 3, kind: 'panel', ry: -HALF_PI },
  { id: 'burn_console', zone: 'Z5', label: 'Burn console', x: 0, y: 1.3, z: 9.5, kind: 'box' },
  { id: 'key_rack', zone: 'Z5', label: 'Override key rack', x: -6.5, y: 1.2, z: 3, kind: 'box', ry: HALF_PI },
  // Z6 port bay
  { id: 'legend_A', zone: 'Z6', label: 'Legend card A', x: -13.5, y: 1.5, z: -8, kind: 'panel', ry: HALF_PI },
  { id: 'xf_port_1', zone: 'Z6', label: 'Valve XF-PORT-1', x: -9, y: 1, z: -11.5, kind: 'valve' },
  { id: 'xf_port_2', zone: 'Z6', label: 'Valve XF-PORT-2', x: -13, y: 1, z: -5, kind: 'valve' },
  { id: 'station_A', zone: 'Z6', label: 'Thruster station A', x: -10, y: 1.3, z: -8, kind: 'box' },
  // Z7 starboard bay
  { id: 'legend_B', zone: 'Z7', label: 'Legend card B', x: 13.5, y: 1.5, z: -8, kind: 'panel', ry: -HALF_PI },
  { id: 'xf_stbd_1', zone: 'Z7', label: 'Valve XF-STBD-1', x: 10.5, y: 1, z: -11.5, kind: 'valve' },
  { id: 'station_B', zone: 'Z7', label: 'Thruster station B', x: 10, y: 1.3, z: -8, kind: 'box' },
  // Z8 aft bay
  { id: 'legend_C', zone: 'Z8', label: 'Legend card C', x: 0, y: 1.5, z: -17.5, kind: 'panel' },
  { id: 'station_C', zone: 'Z8', label: 'Thruster station C', x: 0, y: 1.3, z: -16, kind: 'box' },
];

export const INTERACTABLES: InteractableDef[] = INTERACTABLE_DATA.map((d) => ({
  id: d.id,
  zone: d.zone,
  label: d.label,
}));

// ---------------------------------------------------------------------------
// Zone rectangles — checked in order Z1,Z3,Z4,Z2,Z6,Z7,Z8,Z5 (Z5 has two rects)
// ---------------------------------------------------------------------------

type ZoneRect = { zone: ZoneId; xMin: number; xMax: number; zMin: number; zMax: number };

const ZONE_RECTS: ZoneRect[] = [
  { zone: 'Z1', xMin: -9, xMax: 9, zMin: 23, zMax: 37 },
  { zone: 'Z3', xMin: -13, xMax: -2, zMin: 13, zMax: 21 },
  { zone: 'Z4', xMin: 2, xMax: 13, zMin: 13, zMax: 21 },
  { zone: 'Z2', xMin: -2, xMax: 2, zMin: 11, zMax: 23 },
  { zone: 'Z6', xMin: -14, xMax: -2, zMin: -12, zMax: -4 },
  { zone: 'Z7', xMin: 2, xMax: 14, zMin: -12, zMax: -4 },
  { zone: 'Z8', xMin: -3, xMax: 3, zMin: -18, zMax: -12 },
  { zone: 'Z5', xMin: -7, xMax: 7, zMin: 0, zMax: 11 },
  { zone: 'Z5', xMin: -2, xMax: 2, zMin: -5, zMax: 0 },
];

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const HEX = {
  baseMetal: '#768484',
  shadowMetal: '#59696c',
  litPanel: '#92a4a7',
  recess: '#252b2a',
  recessBlue: '#263033',
  warmDark: '#3e3028',
  warmMid: '#745b4d',
  bright: '#b5c4c6',
  accent: '#814525',
  loungeWall: '#768a9a',
  loungeShadow: '#657a89',
  loungeLit: '#8395a8',
  windowLight: '#95bad7',
  pendant: '#e6946d',
  earth: '#4a9fd0',
  avatar: '#c9dced',
} as const;

/** meters of world space covered by one repeat of a tiling texture */
const TILE = 2;

const INTERACT_RANGE = 3.5;
const DOOR_ANIM_SECONDS = 0.6;
const EYE_HEIGHT = 1.7;
const BASE_EMISSIVE = 0.25;

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

type DoorState = {
  panel: Mesh;
  frameMat: StandardMaterial;
  /** 0 = fully closed, 1 = fully open (slid into floor) */
  t: number;
  target: number;
};

type RemoteAvatar = {
  root: TransformNode;
  labelTexture: DynamicTexture;
  labelMat: StandardMaterial;
  targetPos: Vector3;
  targetRy: number;
};

// ---------------------------------------------------------------------------
// createWorld
// ---------------------------------------------------------------------------

export function createWorld(canvas: HTMLCanvasElement, events: WorldEvents): World {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.027, 0.043, 1);
  scene.collisionsEnabled = true;
  scene.gravity = new Vector3(0, 0, 0);

  // -- procedural textures ----------------------------------------------------
  // Everything is canvas-drawn at load: no downloads, CSP-safe, and a few hundred KB
  // of GPU memory total. Palette and surface behavior per BURN_WINDOW_VISUAL_BIBLE.md.

  const makeTex = (
    name: string,
    size: number,
    draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  ): DynamicTexture => {
    const t = new DynamicTexture(name, { width: size, height: size }, scene, true);
    draw(t.getContext() as unknown as CanvasRenderingContext2D, size);
    t.update(false);
    return t;
  };

  /** even speckle so flat fills read as material rather than vector graphics */
  const grain = (ctx: CanvasRenderingContext2D, s: number, amount: number, count = 1200): void => {
    for (let i = 0; i < count; i++) {
      const dark = Math.random() < 0.5;
      ctx.fillStyle = dark ? `rgba(10,14,14,${Math.random() * amount})` : `rgba(230,238,238,${Math.random() * amount * 0.7})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };

  const hexFastener = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
    ctx.fillStyle = 'rgba(18,22,22,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(215,225,225,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const px = x + Math.cos(a) * r * 0.55;
      const py = y + Math.sin(a) * r * 0.55;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  };

  // The ship's one repeating panel module (bible Part 3): chamfered rectangle,
  // visible seam gap, recessed hex fasteners. One TILE = two 1m panel courses.
  const panelTex = (name: string, base: string, seam: string, chamfer: string): DynamicTexture =>
    makeTex(name, 512, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      grain(ctx, s, 0.06);
      const rowH = s / 2;
      for (let row = 0; row < 2; row++) {
        const y0 = row * rowH;
        // seam gap around each panel
        ctx.strokeStyle = seam;
        ctx.lineWidth = 7;
        ctx.strokeRect(3.5, y0 + 3.5, s - 7, rowH - 7);
        // chamfer: light top/left edge, dark bottom/right edge
        ctx.strokeStyle = chamfer;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(9, y0 + rowH - 9); ctx.lineTo(9, y0 + 9); ctx.lineTo(s - 9, y0 + 9);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(12,16,16,0.5)';
        ctx.beginPath();
        ctx.moveTo(9, y0 + rowH - 9); ctx.lineTo(s - 9, y0 + rowH - 9); ctx.lineTo(s - 9, y0 + 9);
        ctx.stroke();
        for (const fx of [22, s - 22]) for (const fy of [y0 + 22, y0 + rowH - 22]) hexFastener(ctx, fx, fy, 7);
      }
    });

  const texPanelBase = panelTex('texPanelBase', HEX.baseMetal, 'rgba(38,48,51,0.9)', 'rgba(202,212,212,0.4)');
  const texPanelLit = panelTex('texPanelLit', HEX.litPanel, 'rgba(60,74,77,0.9)', 'rgba(214,224,224,0.45)');
  const texPanelShadow = panelTex('texPanelShadow', HEX.shadowMetal, 'rgba(30,38,40,0.95)', 'rgba(160,175,175,0.35)');

  // Lounge walls: small square ceramic tile, immaculate (bible Part 2D).
  const texLoungeTile = makeTex('texLoungeTile', 512, (ctx, s) => {
    ctx.fillStyle = HEX.loungeShadow;
    ctx.fillRect(0, 0, s, s);
    const n = 8; // 0.25m tiles
    const t = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 0.92 + Math.random() * 0.1;
        ctx.fillStyle = `rgb(${Math.round(118 * v)},${Math.round(138 * v)},${Math.round(154 * v)})`;
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
        // faint glaze highlight along the top of each tile
        ctx.fillStyle = 'rgba(226,236,244,0.10)';
        ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, 3);
      }
    }
    grain(ctx, s, 0.03, 500);
  });

  // Lounge floor: larger polished tile — the mirror does the real work.
  const texLoungeFloor = makeTex('texLoungeFloor', 512, (ctx, s) => {
    ctx.fillStyle = '#5b7487';
    ctx.fillRect(0, 0, s, s);
    const n = 4; // 0.5m tiles
    const t = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 0.94 + Math.random() * 0.08;
        ctx.fillStyle = `rgb(${Math.round(101 * v)},${Math.round(122 * v)},${Math.round(137 * v)})`;
        ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      }
    }
    grain(ctx, s, 0.025, 400);
  });

  // Crew-side floors: deck plate with fasteners and honest wear at contact points.
  const texDeck = makeTex('texDeck', 512, (ctx, s) => {
    ctx.fillStyle = '#4e5c5f';
    ctx.fillRect(0, 0, s, s);
    const t = s / 2; // 1m plates
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const v = 0.93 + Math.random() * 0.12;
        ctx.fillStyle = `rgb(${Math.round(89 * v)},${Math.round(105 * v)},${Math.round(108 * v)})`;
        ctx.fillRect(i * t + 3, j * t + 3, t - 6, t - 6);
        ctx.strokeStyle = 'rgba(24,30,31,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeRect(i * t + 3, j * t + 3, t - 6, t - 6);
        for (const fx of [i * t + 16, i * t + t - 16]) for (const fy of [j * t + 16, j * t + t - 16]) hexFastener(ctx, fx, fy, 6);
      }
    }
    // scuffs: short low-alpha strokes, mostly through the middle of the walkway
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const len = 12 + Math.random() * 44;
      const a = Math.random() * Math.PI;
      ctx.strokeStyle = Math.random() < 0.6 ? 'rgba(20,26,26,0.13)' : 'rgba(196,206,206,0.08)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    grain(ctx, s, 0.05);
  });

  // Coffered ceiling: recessed dark bays in a pale frame grid (diffuse), each bay
  // carrying one linear fluorescent fixture (emissive) at low intensity — the bible's
  // "practicals barely brighter than the surfaces they light".
  const texCeiling = makeTex('texCeiling', 512, (ctx, s) => {
    ctx.fillStyle = HEX.baseMetal;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = HEX.recessBlue;
    ctx.fillRect(26, 26, s - 52, s - 52);
    ctx.strokeStyle = 'rgba(12,16,16,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, s - 52, s - 52);
    ctx.strokeStyle = 'rgba(202,212,212,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, s - 44, s - 44);
    grain(ctx, s, 0.05);
  });
  const texCeilingGlow = makeTex('texCeilingGlow', 512, (ctx, s) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, s, s);
    ctx.save();
    ctx.shadowColor = 'rgba(190,208,210,0.9)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = 'rgb(172,190,192)';
    ctx.fillRect(s * 0.2, s * 0.44, s * 0.6, s * 0.12);
    ctx.restore();
  });

  // Door: single bespoke face — center seam, high slot window, hardware, hazard chevrons.
  const texDoor = makeTex('texDoor', 512, (ctx, s) => {
    ctx.fillStyle = HEX.litPanel;
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 0.06);
    ctx.strokeStyle = 'rgba(38,48,51,0.9)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    // center split seam
    ctx.fillStyle = 'rgba(24,30,31,0.9)';
    ctx.fillRect(s / 2 - 3, 8, 6, s - 16);
    // high slot window with a cool inner glow
    ctx.fillStyle = '#10161a';
    ctx.fillRect(s * 0.18, s * 0.14, s * 0.64, s * 0.12);
    ctx.strokeStyle = 'rgba(149,186,215,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s * 0.18 + 3, s * 0.14 + 3, s * 0.64 - 6, s * 0.12 - 6);
    // hardware plates either side of the seam
    for (const hx of [s * 0.34, s * 0.6]) {
      ctx.fillStyle = 'rgba(62,48,40,0.95)';
      ctx.fillRect(hx, s * 0.52, s * 0.06, s * 0.16);
      hexFastener(ctx, hx + s * 0.03, s * 0.54, 5);
      hexFastener(ctx, hx + s * 0.03, s * 0.66, 5);
    }
    // hazard chevron strip along the foot
    for (let x = 0; x < s; x += 40) {
      ctx.fillStyle = (x / 40) % 2 === 0 ? HEX.accent : HEX.warmDark;
      ctx.beginPath();
      ctx.moveTo(x, s - 8);
      ctx.lineTo(x + 20, s - 30);
      ctx.lineTo(x + 40, s - 8);
      ctx.closePath();
      ctx.fill();
    }
    for (const fx of [18, s - 18]) for (const fy of [18, s - 18]) hexFastener(ctx, fx, fy, 8);
  });

  // Diagonal hazard striping for floor strips and console edges.
  const texHazard = makeTex('texHazard', 256, (ctx, s) => {
    ctx.fillStyle = HEX.warmDark;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = HEX.accent;
    for (let x = -s; x < s * 2; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, s);
      ctx.lineTo(x + s, 0);
      ctx.lineTo(x + s + 32, 0);
      ctx.lineTo(x + 32, s);
      ctx.closePath();
      ctx.fill();
    }
    grain(ctx, s, 0.07, 400);
  });

  // Seat fabric: the palette's warm dark — the one warmth the lounge is allowed.
  const texSeat = makeTex('texSeat', 256, (ctx, s) => {
    ctx.fillStyle = HEX.warmDark;
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      ctx.strokeStyle = `rgba(116,91,77,${0.10 + Math.random() * 0.10})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    // cushion seams
    ctx.strokeStyle = 'rgba(20,14,10,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.38); ctx.lineTo(s, s * 0.38);
    ctx.moveTo(0, s * 0.72); ctx.lineTo(s, s * 0.72);
    ctx.stroke();
    grain(ctx, s, 0.06, 600);
  });

  // Console housing: dark rubber-polymer with a restrained accent edge.
  const texConsole = makeTex('texConsole', 256, (ctx, s) => {
    ctx.fillStyle = HEX.recessBlue;
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 0.08, 900);
    ctx.strokeStyle = 'rgba(129,69,37,0.85)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(6, 10); ctx.lineTo(s - 6, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(12,16,16,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, s - 16, s - 16);
    for (const fx of [20, s - 20]) for (const fy of [24, s - 24]) hexFastener(ctx, fx, fy, 6);
  });

  // Interactable faceplate: warm-dark plate, accent frame, a dark readout slot.
  const texFaceplate = makeTex('texFaceplate', 256, (ctx, s) => {
    ctx.fillStyle = HEX.warmDark;
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 0.07, 600);
    ctx.strokeStyle = HEX.accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.fillStyle = '#141c1e';
    ctx.fillRect(s * 0.18, s * 0.22, s * 0.64, s * 0.3);
    ctx.strokeStyle = 'rgba(146,164,167,0.5)';
    ctx.lineWidth = 1;
    for (let y = s * 0.28; y < s * 0.5; y += 8) {
      ctx.beginPath();
      ctx.moveTo(s * 0.22, y);
      ctx.lineTo(s * 0.22 + (0.3 + Math.random() * 0.26) * s, y);
      ctx.stroke();
    }
    for (const fx of [20, s - 20]) for (const fy of [20, s - 20]) hexFastener(ctx, fx, fy, 7);
  });

  // Interactable equipment unit: cool body, vents, warm grip edge.
  const texUnit = makeTex('texUnit', 256, (ctx, s) => {
    ctx.fillStyle = HEX.shadowMetal;
    ctx.fillRect(0, 0, s, s);
    grain(ctx, s, 0.07, 700);
    ctx.strokeStyle = 'rgba(24,30,31,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.fillStyle = 'rgba(18,24,24,0.75)';
    for (let y = s * 0.2; y < s * 0.5; y += 14) ctx.fillRect(s * 0.16, y, s * 0.4, 6);
    ctx.fillStyle = HEX.warmMid;
    ctx.fillRect(s * 0.16, s * 0.68, s * 0.68, s * 0.1);
    for (const fx of [18, s - 18]) for (const fy of [18, s - 18]) hexFastener(ctx, fx, fy, 6);
  });

  // Earth, drawn honestly enough to hold up at 20 meters: ocean, continents,
  // cloud streaks, a polar cap.
  const texEarthMap = makeTex('texEarthMap', 512, (ctx, s) => {
    const ocean = ctx.createLinearGradient(0, 0, 0, s);
    ocean.addColorStop(0, '#1e4a72');
    ocean.addColorStop(0.5, '#2f6f9e');
    ocean.addColorStop(1, '#1a3f63');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, s, s);
    // continents: clustered blobs, desaturated
    for (let c = 0; c < 9; c++) {
      const cx = Math.random() * s;
      const cy = s * 0.15 + Math.random() * s * 0.7;
      const tone = Math.random() < 0.5 ? '#5c6e4a' : '#7a6f52';
      ctx.fillStyle = tone;
      for (let b = 0; b < 14; b++) {
        const r = 8 + Math.random() * 30;
        ctx.beginPath();
        ctx.arc(cx + (Math.random() - 0.5) * 90, cy + (Math.random() - 0.5) * 60, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // polar cap
    ctx.fillStyle = 'rgba(226,236,242,0.9)';
    ctx.fillRect(0, 0, s, s * 0.07);
    ctx.fillStyle = 'rgba(226,236,242,0.45)';
    ctx.fillRect(0, s * 0.07, s, s * 0.04);
    // cloud streaks, roughly zonal
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * s;
      const x = Math.random() * s;
      const len = 40 + Math.random() * 140;
      ctx.strokeStyle = `rgba(240,246,250,${0.14 + Math.random() * 0.22})`;
      ctx.lineWidth = 4 + Math.random() * 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.5, y + (Math.random() - 0.5) * 22, x + len, y + (Math.random() - 0.5) * 10);
      ctx.stroke();
    }
  });

  // Deep space: not flat black — a barely-there cold gradient.
  const texSpace = makeTex('texSpace', 256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#05080d');
    g.addColorStop(0.65, '#020407');
    g.addColorStop(1, '#010203');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

  // -- materials ------------------------------------------------------------

  const satin = (name: string, hex: string): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.08, 0.09, 0.09);
    m.specularPower = 24;
    return m;
  };

  const textured = (name: string, tex: DynamicTexture, specular = 0.09, power = 24): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = tex;
    m.specularColor = new Color3(specular, specular * 1.05, specular * 1.05);
    m.specularPower = power;
    return m;
  };

  const matBase = textured('matBase', texPanelBase);
  const matShadow = textured('matShadow', texPanelShadow);
  const matPanel = textured('matPanel', texPanelLit, 0.11, 32);
  const matRecess = satin('matRecess', HEX.recess);
  const matLoungeWall = textured('matLoungeWall', texLoungeTile, 0.16, 48);
  const matSeat = textured('matSeat', texSeat, 0.03, 8);
  const matConsole = textured('matConsole', texConsole, 0.05, 12);
  const matDeck = textured('matDeck', texDeck, 0.07, 20);

  const matCeiling = new StandardMaterial('matCeiling', scene);
  matCeiling.diffuseTexture = texCeiling;
  matCeiling.emissiveTexture = texCeilingGlow;
  matCeiling.specularColor = new Color3(0.03, 0.03, 0.03);

  // Z1 glossy floor: tile diffuse + a true planar mirror (the room's hero feature —
  // bible 2B: "budget for it rather than cutting it as an optimization").
  const matLoungeFloor = new StandardMaterial('matLoungeFloor', scene);
  matLoungeFloor.diffuseTexture = texLoungeFloor;
  matLoungeFloor.specularColor = new Color3(0.5, 0.58, 0.65);
  matLoungeFloor.specularPower = 96;

  const matFloor = matDeck;

  const accentColor = Color3.FromHexString(HEX.accent);
  const matHazard = new StandardMaterial('matHazard', scene);
  matHazard.diffuseTexture = texHazard;
  matHazard.emissiveColor = accentColor.scale(0.12);
  matHazard.specularColor = new Color3(0.05, 0.05, 0.05);

  const matDoor = new StandardMaterial('matDoor', scene);
  matDoor.diffuseTexture = texDoor;
  matDoor.specularColor = new Color3(0.1, 0.11, 0.11);
  matDoor.specularPower = 32;

  const matFixture = new StandardMaterial('matFixture', scene);
  matFixture.emissiveColor = new Color3(0.72, 0.79, 0.8); // fixtures barely brighter than surfaces
  matFixture.diffuseColor = Color3.Black();
  matFixture.disableLighting = true;

  const matGlass = new StandardMaterial('matGlass', scene);
  matGlass.diffuseColor = Color3.FromHexString(HEX.windowLight);
  matGlass.emissiveColor = Color3.FromHexString(HEX.windowLight).scale(0.08);
  matGlass.alpha = 0.1;
  matGlass.specularColor = new Color3(0.4, 0.5, 0.6);

  const matSpace = new StandardMaterial('matSpace', scene);
  matSpace.emissiveTexture = texSpace;
  matSpace.diffuseColor = Color3.Black();
  matSpace.disableLighting = true;

  const matStar = new StandardMaterial('matStar', scene);
  matStar.emissiveColor = new Color3(0.9, 0.93, 1.0);
  matStar.disableLighting = true;

  const matEarth = new StandardMaterial('matEarth', scene);
  matEarth.emissiveTexture = texEarthMap;
  matEarth.diffuseColor = Color3.Black();
  matEarth.disableLighting = true;

  const matAtmo = new StandardMaterial('matAtmo', scene);
  matAtmo.emissiveColor = new Color3(0.55, 0.75, 0.9);
  matAtmo.diffuseColor = Color3.Black();
  matAtmo.alpha = 0.14;
  matAtmo.disableLighting = true;

  const matPendant = new StandardMaterial('matPendant', scene);
  matPendant.emissiveColor = Color3.FromHexString(HEX.pendant);
  matPendant.diffuseColor = Color3.FromHexString(HEX.pendant).scale(0.4);
  matPendant.disableLighting = true;

  const matAvatar = satin('matAvatar', HEX.avatar);
  const matVisor = satin('matVisor', HEX.recess);

  // Space stays crisp through the window; only the interior gets the distance haze
  // (bible 2B: "slight atmospheric softening in the deep background").
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 22;
  scene.fogEnd = 95;
  scene.fogColor = new Color3(0.055, 0.075, 0.09);
  for (const m of [matSpace, matStar, matEarth, matAtmo, matGlass]) m.fogEnabled = false;

  // -- lighting (budget: 11 lights total) -----------------------------------

  const hemi = new HemisphericLight('hemi', new Vector3(0.1, 1, 0.05), scene);
  hemi.intensity = 0.5;
  hemi.diffuse = new Color3(0.68, 0.76, 0.78); // cool cyan-grey tint
  hemi.groundColor = new Color3(0.16, 0.2, 0.21);

  const coolPoint = (name: string, x: number, y: number, z: number, intensity: number, range: number): PointLight => {
    const l = new PointLight(name, new Vector3(x, y, z), scene);
    l.diffuse = new Color3(0.78, 0.86, 0.88);
    l.specular = new Color3(0.3, 0.35, 0.36);
    l.intensity = intensity;
    l.range = range;
    return l;
  };

  // Z1: three warm pendants only (created with the pendant meshes below).
  // Cool points elsewhere:
  coolPoint('lZ3', -7.5, 2.7, 17, 0.35, 10);
  coolPoint('lZ4', 7.5, 2.7, 17, 0.35, 10);
  coolPoint('lZ6', -8, 2.7, -8, 0.35, 11);
  coolPoint('lZ7', 8, 2.7, -8, 0.35, 11);
  coolPoint('lZ8', 0, 2.7, -15, 0.35, 9);

  // Z5: slightly lower ambient feel — two cool spotlights instead of a point wash.
  for (const sx of [-3, 3]) {
    const spot = new SpotLight(`lZ5spot${sx}`, new Vector3(sx, 2.9, 5.5), new Vector3(0, -1, 0), 1.25, 2, scene);
    spot.diffuse = new Color3(0.72, 0.82, 0.85);
    spot.specular = new Color3(0.25, 0.3, 0.31);
    spot.intensity = 0.55;
    spot.range = 9;
  }

  // -- structure helpers ----------------------------------------------------

  // Per-face UV tiling keeps the 2m panel module at true scale on every wall,
  // whatever its dimensions, while sharing one material. Box face pairs: 0/1 are
  // the z-normal faces (w×h), 2/3 the x-normal (d×h), 4/5 top and bottom (w×d).
  const tiledFaceUV = (w: number, h: number, d: number): Vector4[] => [
    new Vector4(0, 0, w / TILE, h / TILE),
    new Vector4(0, 0, w / TILE, h / TILE),
    new Vector4(0, 0, d / TILE, h / TILE),
    new Vector4(0, 0, d / TILE, h / TILE),
    new Vector4(0, 0, w / TILE, d / TILE),
    new Vector4(0, 0, w / TILE, d / TILE),
  ];

  const scaleUV = (mesh: Mesh, u: number, v: number): void => {
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    if (!uvs) return;
    const out = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length; i += 2) {
      out[i] = uvs[i] * u;
      out[i + 1] = uvs[i + 1] * v;
    }
    mesh.setVerticesData(VertexBuffer.UVKind, out);
  };

  const wallBox = (name: string, cx: number, cz: number, sx: number, sz: number, mat: StandardMaterial): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: sx, height: 3, depth: sz, faceUV: tiledFaceUV(sx, 3, sz) }, scene);
    m.position.set(cx, 1.5, cz);
    m.material = mat;
    m.checkCollisions = true;
    m.freezeWorldMatrix();
    return m;
  };

  /** wall lying along the x axis at plane z = zp, spanning x0..x1 */
  const wallX = (name: string, zp: number, x0: number, x1: number, mat: StandardMaterial): Mesh =>
    wallBox(name, (x0 + x1) / 2, zp, x1 - x0, 0.3, mat);

  /** wall lying along the z axis at plane x = xp, spanning z0..z1 */
  const wallZ = (name: string, xp: number, z0: number, z1: number, mat: StandardMaterial): Mesh =>
    wallBox(name, xp, (z0 + z1) / 2, 0.3, z1 - z0, mat);

  const floorRect = (name: string, xMin: number, xMax: number, zMin: number, zMax: number, mat: StandardMaterial): Mesh => {
    const g = MeshBuilder.CreateGround(name, { width: xMax - xMin, height: zMax - zMin }, scene);
    g.position.set((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
    scaleUV(g, (xMax - xMin) / TILE, (zMax - zMin) / TILE);
    g.material = mat;
    g.checkCollisions = true;
    g.freezeWorldMatrix();
    return g;
  };

  // -- floors ---------------------------------------------------------------

  floorRect('floorZ1', -9, 9, 23, 37, matLoungeFloor);
  floorRect('floorZ2', -2, 2, 11, 23, matFloor);
  floorRect('floorZ3', -13, -2, 13, 21, matFloor);
  floorRect('floorZ4', 2, 13, 13, 21, matFloor);
  floorRect('floorZ5', -7, 7, 0, 11, matFloor);
  floorRect('floorAft', -2, 2, -12, 0, matFloor);
  floorRect('floorZ6', -14, -2, -12, -4, matFloor);
  floorRect('floorZ7', 2, 14, -12, -4, matFloor);
  floorRect('floorZ8', -3, 3, -18, -12, matFloor);

  // ceiling — coffered grid of recessed bays, each with a low-key linear fixture
  const ceiling = MeshBuilder.CreateBox('ceiling', { width: 30, height: 0.12, depth: 56, faceUV: tiledFaceUV(30, 0.12, 56) }, scene);
  ceiling.position.set(0, 3.06, 9.5);
  ceiling.material = matCeiling;
  ceiling.freezeWorldMatrix();

  // physical fixture bars where the cool lights actually are, so the illumination
  // reads as motivated rather than ambient
  const fixtureBar = (x: number, z: number, along: 'x' | 'z' = 'x'): void => {
    const bar = MeshBuilder.CreateBox(`fixture_${x}_${z}`, {
      width: along === 'x' ? 1.7 : 0.24,
      height: 0.06,
      depth: along === 'x' ? 0.24 : 1.7,
    }, scene);
    bar.position.set(x, 2.97, z);
    bar.material = matFixture;
    bar.isPickable = false;
    bar.freezeWorldMatrix();
  };
  fixtureBar(-7.5, 17); fixtureBar(7.5, 17);          // galley, crew quarters
  fixtureBar(-8, -8); fixtureBar(8, -8); fixtureBar(0, -15); // bays
  fixtureBar(-3, 5.5); fixtureBar(3, 5.5);            // flight deck
  fixtureBar(0, 13, 'z'); fixtureBar(0, 17, 'z'); fixtureBar(0, 21, 'z'); // corridor
  fixtureBar(0, -3, 'z'); fixtureBar(0, -9, 'z');     // aft passage

  // -- walls ----------------------------------------------------------------

  // Z1 lounge (tiled blue-grey walls); forward wall z=37 is the window (collidable glass below)
  const loungeWalls = [
    wallX('z1_aft_w', 23, -9, -1.5, matLoungeWall),
    wallX('z1_aft_e', 23, 1.5, 9, matLoungeWall),
    wallZ('z1_west', -9, 23, 37, matLoungeWall),
    wallZ('z1_east', 9, 23, 37, matLoungeWall),
  ];

  // Z2 corridor (openings to Z3/Z4 at z 15..19)
  wallZ('z2_w_a', -2, 11, 15, matBase);
  wallZ('z2_w_b', -2, 19, 23, matBase);
  wallZ('z2_e_a', 2, 11, 15, matBase);
  wallZ('z2_e_b', 2, 19, 23, matBase);

  // Z3 galley
  wallZ('z3_west', -13, 13, 21, matBase);
  wallX('z3_north', 21, -13, -2, matBase);
  wallX('z3_south', 13, -13, -2, matBase);

  // Z4 crew quarters
  wallZ('z4_east', 13, 13, 21, matBase);
  wallX('z4_north', 21, 2, 13, matBase);
  wallX('z4_south', 13, 2, 13, matBase);

  // Z5 flight deck (door gaps at z=11 and z=0)
  wallX('z5_n_w', 11, -7, -1.5, matPanel);
  wallX('z5_n_e', 11, 1.5, 7, matPanel);
  wallZ('z5_west', -7, 0, 11, matPanel);
  wallZ('z5_east', 7, 0, 11, matPanel);
  wallX('z5_s_w', 0, -7, -1.5, matPanel);
  wallX('z5_s_e', 0, 1.5, 7, matPanel);

  // Aft passage side planes x=+-2, z -12..0, openings into bays at z -10..-6
  wallZ('aft_w_a', -2, -6, 0, matBase);
  wallZ('aft_w_b', -2, -12, -10, matBase);
  wallZ('aft_e_a', 2, -6, 0, matBase);
  wallZ('aft_e_b', 2, -12, -10, matBase);

  // Z6 port bay
  wallZ('z6_west', -14, -12, -4, matShadow);
  wallX('z6_north', -4, -14, -2, matShadow);
  wallX('z6_south', -12, -14, -2, matShadow);

  // Z7 starboard bay
  wallZ('z7_east', 14, -12, -4, matShadow);
  wallX('z7_north', -4, 2, 14, matShadow);
  wallX('z7_south', -12, 2, 14, matShadow);

  // Z8 aft bay (opening at z=-12, x -1.5..1.5)
  wallX('z8_n_w', -12, -3, -1.5, matShadow);
  wallX('z8_n_e', -12, 1.5, 3, matShadow);
  wallZ('z8_west', -3, -18, -12, matShadow);
  wallZ('z8_east', 3, -18, -12, matShadow);
  wallX('z8_south', -18, -3, 3, matShadow);

  // -- Z1 hero window: glass, space, stars, Earth ---------------------------

  const glass = MeshBuilder.CreateBox('z1_glass', { width: 18, height: 3, depth: 0.15 }, scene);
  glass.position.set(0, 1.5, 37);
  glass.material = matGlass;
  glass.checkCollisions = true;
  glass.freezeWorldMatrix();

  const space = MeshBuilder.CreatePlane('space', { width: 90, height: 44, sideOrientation: Mesh.DOUBLESIDE }, scene);
  space.position.set(0, 6, 52);
  space.material = matSpace;
  space.freezeWorldMatrix();

  // ~100 star dots as thin instances of one small plane; a few reads brighter,
  // done with scale rather than a second material
  const starBase = MeshBuilder.CreatePlane('stars', { size: 0.16, sideOrientation: Mesh.DOUBLESIDE }, scene);
  starBase.material = matStar;
  starBase.isPickable = false;
  for (let i = 0; i < 100; i++) {
    const sx = (Math.random() - 0.5) * 70;
    const sy = -6 + Math.random() * 24;
    const sz = 50.5 + Math.random() * 1.2;
    const scale = Math.random() < 0.15 ? 1.8 : 0.7 + Math.random() * 0.8;
    const m = Matrix.Scaling(scale, scale, 1).multiply(Matrix.Translation(sx, sy, sz));
    starBase.thinInstanceAdd(m, i === 99);
  }

  const earth = MeshBuilder.CreateSphere('earth', { diameter: 12, segments: 24 }, scene);
  earth.position.set(7, -1.5, 49);
  earth.rotation.z = 0.35; // tilt the polar cap off vertical
  earth.material = matEarth;
  earth.isPickable = false;
  earth.freezeWorldMatrix();

  // thin luminous rim so the planet sits in space instead of on it
  const atmo = MeshBuilder.CreateSphere('earthAtmo', { diameter: 12.7, segments: 24 }, scene);
  atmo.position.copyFrom(earth.position);
  atmo.material = matAtmo;
  atmo.isPickable = false;
  atmo.freezeWorldMatrix();

  // -- Z1 set dressing: seats + pendants ------------------------------------

  const loungeSeats: Mesh[] = [];
  for (const sz of [29, 32.5]) {
    for (const sx of [-6, -3, 3, 6]) {
      const seat = MeshBuilder.CreateBox(`seat_${sx}_${sz}`, { width: 0.9, height: 1.2, depth: 0.9 }, scene);
      seat.position.set(sx, 0.6, sz);
      seat.material = matSeat;
      seat.checkCollisions = true;
      seat.freezeWorldMatrix();
      loungeSeats.push(seat);
    }
  }

  const pendantBulbs: Mesh[] = [];
  for (const pz of [26, 30, 34]) {
    const cord = MeshBuilder.CreateCylinder(`pendantCord_${pz}`, { height: 0.55, diameter: 0.03 }, scene);
    cord.position.set(0, 2.75, pz);
    cord.material = matRecess;
    cord.freezeWorldMatrix();
    const bulb = MeshBuilder.CreateSphere(`pendant_${pz}`, { diameter: 0.36, segments: 12 }, scene);
    bulb.position.set(0, 2.35, pz);
    bulb.material = matPendant;
    bulb.isPickable = false;
    bulb.freezeWorldMatrix();
    pendantBulbs.push(bulb);
    const warm = new PointLight(`lPendant_${pz}`, new Vector3(0, 2.3, pz), scene);
    warm.diffuse = Color3.FromHexString(HEX.pendant);
    warm.specular = Color3.FromHexString(HEX.pendant).scale(0.5);
    warm.intensity = 0.4;
    warm.range = 9;
  }

  // The lounge floor's planar mirror: renders only what the lounge can see of
  // itself — window, space, Earth, seats, walls, pendants. Doubling the room is
  // this location's signature (visual bible, Part 2).
  const mirror = new MirrorTexture('loungeMirror', 512, scene, true);
  mirror.mirrorPlane = new Plane(0, -1, 0, 0);
  mirror.renderList = [glass, space, starBase, earth, atmo, ...loungeWalls, ...loungeSeats, ...pendantBulbs];
  mirror.level = 0.32;
  matLoungeFloor.reflectionTexture = mirror;

  // -- Z5 set dressing: crew seats + console slabs --------------------------

  for (const sx of [-1.4, 1.4]) {
    const seat = MeshBuilder.CreateBox(`crewSeat_${sx}`, { width: 0.8, height: 1.1, depth: 0.8 }, scene);
    seat.position.set(sx, 0.55, 7.2);
    seat.material = matShadow;
    seat.checkCollisions = true;
    seat.freezeWorldMatrix();
  }
  const navSlab = MeshBuilder.CreateBox('navSlab', { width: 2.6, height: 0.9, depth: 0.9 }, scene);
  navSlab.position.set(0, 0.45, 1.6);
  navSlab.material = matConsole;
  navSlab.checkCollisions = true;
  navSlab.freezeWorldMatrix();
  const burnSlab = MeshBuilder.CreateBox('burnSlab', { width: 4, height: 1, depth: 0.9 }, scene);
  burnSlab.position.set(0, 0.5, 10.1);
  burnSlab.material = matConsole;
  burnSlab.checkCollisions = true;
  burnSlab.freezeWorldMatrix();

  // -- bay set dressing: pipes + hazard strips ------------------------------

  const pipe = (name: string, cx: number, cy: number, cz: number, length: number): void => {
    const p = MeshBuilder.CreateCylinder(name, { height: length, diameter: 0.24, tessellation: 10 }, scene);
    p.position.set(cx, cy, cz);
    p.rotation.z = HALF_PI; // lie along x
    p.material = matRecess;
    p.isPickable = false;
    p.freezeWorldMatrix();
  };
  pipe('pipeZ6a', -8, 2.35, -11.7, 11);
  pipe('pipeZ6b', -8, 1.95, -11.7, 11);
  pipe('pipeZ7a', 8, 2.35, -11.7, 11);
  pipe('pipeZ7b', 8, 1.95, -11.7, 11);
  pipe('pipeZ8a', 0, 2.35, -17.7, 5.4);
  pipe('pipeZ8b', 0, 1.95, -17.7, 5.4);

  const hazardStrip = (name: string, cx: number, cz: number, sx: number, sz: number): void => {
    const s = MeshBuilder.CreateBox(name, { width: sx, height: 0.04, depth: sz }, scene);
    s.position.set(cx, 0.02, cz);
    s.material = matHazard;
    s.isPickable = false;
    s.freezeWorldMatrix();
  };
  hazardStrip('hazZ6', -2, -8, 0.35, 4.2);
  hazardStrip('hazZ7', 2, -8, 0.35, 4.2);
  hazardStrip('hazZ8', 0, -12, 3.2, 0.35);

  // -- doors ----------------------------------------------------------------

  const doors = new Map<DoorId, DoorState>();

  const buildDoor = (id: DoorId, zp: number): void => {
    const frameMat = new StandardMaterial(`doorFrameMat_${id}`, scene);
    frameMat.diffuseColor = Color3.FromHexString(HEX.recess);
    frameMat.emissiveColor = accentColor.scale(0.35); // energized while locked/closed
    frameMat.specularColor = new Color3(0.05, 0.05, 0.05);

    for (const px of [-1.65, 1.65]) {
      const post = MeshBuilder.CreateBox(`doorPost_${id}_${px}`, { width: 0.3, height: 3, depth: 0.42 }, scene);
      post.position.set(px, 1.5, zp);
      post.material = frameMat;
      post.checkCollisions = true;
      post.freezeWorldMatrix();
    }
    const lintel = MeshBuilder.CreateBox(`doorLintel_${id}`, { width: 3.6, height: 0.25, depth: 0.42 }, scene);
    lintel.position.set(0, 2.87, zp);
    lintel.material = frameMat;
    lintel.freezeWorldMatrix();

    const panel = MeshBuilder.CreateBox(`doorPanel_${id}`, { width: 3, height: 3, depth: 0.24 }, scene);
    panel.position.set(0, 1.5, zp);
    panel.material = matDoor;
    panel.checkCollisions = true;

    doors.set(id, { panel, frameMat, t: 0, target: 0 });
  };

  buildDoor('d_lounge', 23);
  buildDoor('d_flightdeck', 11);
  buildDoor('d_bays', 0);

  // -- interactables --------------------------------------------------------

  const interactableByMesh = new Map<AbstractMesh, string>();

  type InteractableRuntime = { mesh: Mesh; mat: StandardMaterial };
  const interactables = new Map<string, InteractableRuntime>();

  for (const def of INTERACTABLE_DATA) {
    let mesh: Mesh;
    if (def.kind === 'valve') {
      mesh = MeshBuilder.CreateCylinder(`int_${def.id}`, { height: 0.16, diameter: 0.45, tessellation: 16 }, scene);
      mesh.rotation.x = HALF_PI; // wheel faces along z
    } else if (def.kind === 'panel') {
      mesh = MeshBuilder.CreateBox(`int_${def.id}`, { width: 0.7, height: 0.5, depth: 0.08 }, scene);
    } else {
      mesh = MeshBuilder.CreateBox(`int_${def.id}`, { width: 0.55, height: 0.55, depth: 0.45 }, scene);
    }
    mesh.position.set(def.x, def.y, def.z);
    if (def.ry !== undefined) mesh.rotation.y = def.ry;

    // Panels and boxes carry drawn faceplates; the hover pulse stays on emissiveColor,
    // which composes with a diffuse texture but would be overridden by an emissive one.
    const mat = new StandardMaterial(`intMat_${def.id}`, scene);
    if (def.kind === 'panel') {
      mat.diffuseTexture = texFaceplate;
      mat.diffuseColor = Color3.White();
    } else if (def.kind === 'box') {
      mat.diffuseTexture = texUnit;
      mat.diffuseColor = Color3.White();
    } else {
      mat.diffuseColor = accentColor.clone();
    }
    mat.emissiveColor = accentColor.scale(BASE_EMISSIVE);
    mat.specularColor = new Color3(0.1, 0.08, 0.06);
    mesh.material = mat;
    mesh.metadata = { interactableId: def.id };

    interactableByMesh.set(mesh, def.id);
    interactables.set(def.id, { mesh, mat });

    // Graybox affordance: a floating name over every interactable, so players can tell
    // the breaker panel from a storage crate before the art pass gives them silhouettes.
    const labelTexture = new DynamicTexture(`intLabelTex_${def.id}`, { width: 512, height: 64 }, scene, false);
    labelTexture.hasAlpha = true;
    labelTexture.drawText(def.label, null, 44, 'bold 34px sans-serif', '#cfe3f0', 'transparent', true);

    const labelMat = new StandardMaterial(`intLabelMat_${def.id}`, scene);
    labelMat.emissiveTexture = labelTexture;
    labelMat.opacityTexture = labelTexture;
    labelMat.disableLighting = true;
    labelMat.backFaceCulling = false;

    const label = MeshBuilder.CreatePlane(`intLabel_${def.id}`, { width: 1.6, height: 0.2 }, scene);
    label.material = labelMat;
    label.position.set(def.x, def.y + 0.55, def.z);
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    label.isPickable = false;
  }

  // -- camera ---------------------------------------------------------------

  const camera = new UniversalCamera('camera', new Vector3(0, EYE_HEIGHT, 30), scene);
  camera.setTarget(new Vector3(0, EYE_HEIGHT, 37)); // face the window
  camera.minZ = 0.1;
  camera.ellipsoid = new Vector3(0.4, 0.85, 0.4);
  camera.checkCollisions = true;
  camera.applyGravity = false;
  camera.speed = 0.18;
  camera.angularSensibility = 2500;
  camera.inertia = 0.7;
  camera.keysUp = [87, 38]; // W, ArrowUp
  camera.keysDown = [83, 40]; // S, ArrowDown
  camera.keysLeft = [65, 37]; // A, ArrowLeft
  camera.keysRight = [68, 39]; // D, ArrowRight
  camera.attachControl(true);

  // -- pointer lock ---------------------------------------------------------

  const onPointerLockChange = (): void => {
    events.onLockChange(document.pointerLockElement === canvas);
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);

  // -- interaction input ----------------------------------------------------

  let hoveredId: string | null = null;

  const onKeyDown = (e: KeyboardEvent): void => {
    if ((e.key === 'e' || e.key === 'E') && hoveredId !== null) {
      events.onInteract(hoveredId);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const onPointerDown = (): void => {
    if (document.pointerLockElement === canvas && hoveredId !== null) {
      events.onInteract(hoveredId);
    }
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  // -- remote avatars -------------------------------------------------------

  const avatars = new Map<string, RemoteAvatar>();

  const buildAvatar = (id: string, name: string): RemoteAvatar => {
    // The root sits at the remote player's eye transform (y ~= 1.7);
    // children are offset so the capsule's feet rest on the floor.
    const root = new TransformNode(`avatar_${id}`, scene);

    const body = MeshBuilder.CreateCapsule(`avatarBody_${id}`, { height: 1.7, radius: 0.35 }, scene);
    body.material = matAvatar;
    body.parent = root;
    body.position.set(0, 0.85 - EYE_HEIGHT, 0);
    body.isPickable = false;

    const visor = MeshBuilder.CreateBox(`avatarVisor_${id}`, { width: 0.36, height: 0.16, depth: 0.1 }, scene);
    visor.material = matVisor;
    visor.parent = root;
    visor.position.set(0, 1.45 - EYE_HEIGHT, 0.3); // front face at head height
    visor.isPickable = false;

    const labelTexture = new DynamicTexture(`avatarLabelTex_${id}`, { width: 256, height: 64 }, scene, false);
    labelTexture.hasAlpha = true;
    labelTexture.drawText(name, null, 44, 'bold 36px sans-serif', '#ffffff', 'transparent', true);

    const labelMat = new StandardMaterial(`avatarLabelMat_${id}`, scene);
    labelMat.emissiveTexture = labelTexture;
    labelMat.opacityTexture = labelTexture;
    labelMat.disableLighting = true;
    labelMat.backFaceCulling = false;

    const label = MeshBuilder.CreatePlane(`avatarLabel_${id}`, { width: 1.6, height: 0.4 }, scene);
    label.material = labelMat;
    label.parent = root;
    label.position.set(0, 2.15 - EYE_HEIGHT, 0);
    label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    label.isPickable = false;

    return { root, labelTexture, labelMat, targetPos: new Vector3(0, EYE_HEIGHT, 0), targetRy: 0 };
  };

  // -- per-frame loop -------------------------------------------------------

  let currentZone: ZoneId = 'Z1';
  let elapsed = 0;

  const easeSmooth = (t: number): number => t * t * (3 - 2 * t);

  const beforeRender = (): void => {
    const dt = engine.getDeltaTime() / 1000;
    elapsed += dt;

    // mag-boots fiction: stay at eye height
    camera.position.y = EYE_HEIGHT;

    // door animation
    for (const door of doors.values()) {
      if (door.t !== door.target) {
        const step = dt / DOOR_ANIM_SECONDS;
        door.t = door.target > door.t ? Math.min(door.target, door.t + step) : Math.max(door.target, door.t - step);
        const k = easeSmooth(door.t);
        door.panel.position.y = Scalar.Lerp(1.5, -1.68, k);
      }
    }

    // zone detection
    const px = camera.position.x;
    const pz = camera.position.z;
    for (const r of ZONE_RECTS) {
      if (px >= r.xMin && px <= r.xMax && pz >= r.zMin && pz <= r.zMax) {
        if (r.zone !== currentZone) {
          currentZone = r.zone;
          events.onZoneChange(currentZone);
        }
        break;
      }
    }

    // interaction ray from camera center
    const ray = camera.getForwardRay(INTERACT_RANGE);
    const pick = scene.pickWithRay(ray, (m: AbstractMesh) => interactableByMesh.has(m));
    let newHover: string | null = null;
    if (pick !== null && pick.hit && pick.pickedMesh !== null && pick.distance <= INTERACT_RANGE) {
      newHover = interactableByMesh.get(pick.pickedMesh) ?? null;
    }
    if (newHover !== hoveredId) {
      // restore the previous target's steady emissive
      if (hoveredId !== null) {
        const prev = interactables.get(hoveredId);
        if (prev !== undefined) prev.mat.emissiveColor = accentColor.scale(BASE_EMISSIVE);
      }
      hoveredId = newHover;
      events.onHover(hoveredId);
    }
    if (hoveredId !== null) {
      const cur = interactables.get(hoveredId);
      if (cur !== undefined) {
        const pulse = BASE_EMISSIVE + 0.18 * (0.5 + 0.5 * Math.sin(elapsed * 6));
        cur.mat.emissiveColor = accentColor.scale(pulse);
      }
    }

    // remote avatar smoothing
    for (const av of avatars.values()) {
      Vector3.LerpToRef(av.root.position, av.targetPos, 0.15, av.root.position);
      av.root.rotation.y = Scalar.LerpAngle(av.root.rotation.y, av.targetRy, 0.15);
    }
  };
  scene.onBeforeRenderObservable.add(beforeRender);

  // -- render loop + resize -------------------------------------------------

  engine.runRenderLoop(() => {
    scene.render();
  });

  const onResize = (): void => {
    engine.resize();
  };
  window.addEventListener('resize', onResize);

  // -- public API -----------------------------------------------------------

  let disposed = false;

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      engine.stopRenderLoop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      for (const av of avatars.values()) {
        av.labelTexture.dispose();
      }
      avatars.clear();
      engine.dispose();
    },

    getTransform(): { x: number; y: number; z: number; ry: number } {
      return {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        ry: camera.rotation.y,
      };
    },

    setDoorOpen(id: DoorId, open: boolean): void {
      const door = doors.get(id);
      if (door === undefined) return;
      door.target = open ? 1 : 0;
      // Collision + frame glow flip immediately; the panel animates over 0.6s.
      door.panel.checkCollisions = !open;
      door.frameMat.emissiveColor = open ? accentColor.scale(0.04) : accentColor.scale(0.35);
    },

    upsertRemote(id: string, name: string, x: number, y: number, z: number, ry: number): void {
      let av = avatars.get(id);
      if (av === undefined) {
        av = buildAvatar(id, name);
        av.root.position.set(x, y, z);
        av.root.rotation.y = ry;
        avatars.set(id, av);
      }
      av.targetPos.set(x, y, z);
      av.targetRy = ry;
    },

    removeRemote(id: string): void {
      const av = avatars.get(id);
      if (av === undefined) return;
      av.labelTexture.dispose();
      av.labelMat.dispose();
      av.root.dispose(false, true); // dispose hierarchy + remaining materials
      avatars.delete(id);
    },

    requestPointerLock(): void {
      // Older lib.dom typings return void; newer return Promise<void>. Ignore either.
      void canvas.requestPointerLock();
    },
  };
}
