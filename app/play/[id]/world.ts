// world.ts — Babylon.js graybox world for "Burn Window"
// Client-side only. Art direction per docs/BURN_WINDOW_VISUAL_BIBLE.md:
//   Z1 lounge = cool blue-grey (#768a9a) with three warm pendants (#e6946d) and a glossy floor;
//   everything else = cockpit DNA (#768484 / #59696c / #92a4a7 / #252b2a) with the burnt-orange
//   accent (#814525) reserved for interactables, hazard hardware and locked doors.

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
  PointLight,
  Scalar,
  Scene,
  SpotLight,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
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
  accent: '#814525',
  loungeWall: '#768a9a',
  loungeShadow: '#657a89',
  windowLight: '#95bad7',
  pendant: '#e6946d',
  earth: '#4a9fd0',
  avatar: '#c9dced',
} as const;

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

  // -- materials ------------------------------------------------------------

  const satin = (name: string, hex: string): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.08, 0.09, 0.09);
    m.specularPower = 24;
    return m;
  };

  const matBase = satin('matBase', HEX.baseMetal);
  const matShadow = satin('matShadow', HEX.shadowMetal);
  const matPanel = satin('matPanel', HEX.litPanel);
  const matRecess = satin('matRecess', HEX.recess);
  const matLoungeWall = satin('matLoungeWall', HEX.loungeWall);
  const matSeat = satin('matSeat', HEX.loungeShadow);

  // Z1 glossy floor: high, tight specular return (the room's hero feature).
  const matLoungeFloor = new StandardMaterial('matLoungeFloor', scene);
  matLoungeFloor.diffuseColor = Color3.FromHexString(HEX.loungeShadow);
  matLoungeFloor.specularColor = new Color3(0.75, 0.85, 0.95);
  matLoungeFloor.specularPower = 96;

  const matFloor = satin('matFloor', HEX.shadowMetal);

  const accentColor = Color3.FromHexString(HEX.accent);
  const matHazard = new StandardMaterial('matHazard', scene);
  matHazard.diffuseColor = accentColor.clone();
  matHazard.emissiveColor = accentColor.scale(0.2);
  matHazard.specularColor = new Color3(0.05, 0.05, 0.05);

  const matGlass = new StandardMaterial('matGlass', scene);
  matGlass.diffuseColor = Color3.FromHexString(HEX.windowLight);
  matGlass.emissiveColor = Color3.FromHexString(HEX.windowLight).scale(0.08);
  matGlass.alpha = 0.1;
  matGlass.specularColor = new Color3(0.4, 0.5, 0.6);

  const matSpace = new StandardMaterial('matSpace', scene);
  matSpace.diffuseColor = Color3.Black();
  matSpace.emissiveColor = new Color3(0.012, 0.018, 0.03);
  matSpace.disableLighting = true;

  const matStar = new StandardMaterial('matStar', scene);
  matStar.emissiveColor = new Color3(0.9, 0.93, 1.0);
  matStar.disableLighting = true;

  const matEarth = new StandardMaterial('matEarth', scene);
  matEarth.emissiveColor = Color3.FromHexString(HEX.earth);
  matEarth.diffuseColor = Color3.Black();
  matEarth.disableLighting = true;

  const matPendant = new StandardMaterial('matPendant', scene);
  matPendant.emissiveColor = Color3.FromHexString(HEX.pendant);
  matPendant.diffuseColor = Color3.FromHexString(HEX.pendant).scale(0.4);
  matPendant.disableLighting = true;

  const matAvatar = satin('matAvatar', HEX.avatar);
  const matVisor = satin('matVisor', HEX.recess);

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

  const wallBox = (name: string, cx: number, cz: number, sx: number, sz: number, mat: StandardMaterial): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: sx, height: 3, depth: sz }, scene);
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

  // ceiling — one dark slab over everything for enclosure
  const ceiling = MeshBuilder.CreateBox('ceiling', { width: 30, height: 0.12, depth: 56 }, scene);
  ceiling.position.set(0, 3.06, 9.5);
  ceiling.material = matRecess;
  ceiling.freezeWorldMatrix();

  // -- walls ----------------------------------------------------------------

  // Z1 lounge (blue-grey walls); forward wall z=37 is the window (collidable glass below)
  wallX('z1_aft_w', 23, -9, -1.5, matLoungeWall);
  wallX('z1_aft_e', 23, 1.5, 9, matLoungeWall);
  wallZ('z1_west', -9, 23, 37, matLoungeWall);
  wallZ('z1_east', 9, 23, 37, matLoungeWall);

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

  // ~80 tiny star dots as thin instances of one small plane
  const starBase = MeshBuilder.CreatePlane('stars', { size: 0.16, sideOrientation: Mesh.DOUBLESIDE }, scene);
  starBase.material = matStar;
  starBase.isPickable = false;
  for (let i = 0; i < 80; i++) {
    const sx = (Math.random() - 0.5) * 70;
    const sy = -6 + Math.random() * 24;
    const sz = 50.5 + Math.random() * 1.2;
    starBase.thinInstanceAdd(Matrix.Translation(sx, sy, sz), i === 79);
  }

  const earth = MeshBuilder.CreateSphere('earth', { diameter: 12, segments: 24 }, scene);
  earth.position.set(7, -1.5, 49);
  earth.material = matEarth;
  earth.isPickable = false;
  earth.freezeWorldMatrix();

  // -- Z1 set dressing: seats + pendants ------------------------------------

  for (const sz of [29, 32.5]) {
    for (const sx of [-6, -3, 3, 6]) {
      const seat = MeshBuilder.CreateBox(`seat_${sx}_${sz}`, { width: 0.9, height: 1.2, depth: 0.9 }, scene);
      seat.position.set(sx, 0.6, sz);
      seat.material = matSeat;
      seat.checkCollisions = true;
      seat.freezeWorldMatrix();
    }
  }

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
    const warm = new PointLight(`lPendant_${pz}`, new Vector3(0, 2.3, pz), scene);
    warm.diffuse = Color3.FromHexString(HEX.pendant);
    warm.specular = Color3.FromHexString(HEX.pendant).scale(0.5);
    warm.intensity = 0.4;
    warm.range = 9;
  }

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
  navSlab.material = matRecess;
  navSlab.checkCollisions = true;
  navSlab.freezeWorldMatrix();
  const burnSlab = MeshBuilder.CreateBox('burnSlab', { width: 4, height: 1, depth: 0.9 }, scene);
  burnSlab.position.set(0, 0.5, 10.1);
  burnSlab.material = matRecess;
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
    panel.material = matPanel;
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

    const mat = new StandardMaterial(`intMat_${def.id}`, scene);
    mat.diffuseColor = accentColor.clone();
    mat.emissiveColor = accentColor.scale(BASE_EMISSIVE);
    mat.specularColor = new Color3(0.1, 0.08, 0.06);
    mesh.material = mat;
    mesh.metadata = { interactableId: def.id };

    interactableByMesh.set(mesh, def.id);
    interactables.set(def.id, { mesh, mat });
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
