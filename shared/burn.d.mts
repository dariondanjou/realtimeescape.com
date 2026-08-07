/** Type surface for shared/burn.mjs — the module itself stays plain JS so the Node game server
 *  can import it verbatim with no build step. */

export type Settings = { thrustPct: number; gimbalDeg: number };

export type Stage = {
  index: number;
  label: string;
  armingOrder: string[];
  settings: Record<string, Settings>;
  durationMs: number;
  leadStation: string;
};

export type ManeuverPlan = {
  seed: string;
  attempt: number;
  liveStations: string[];
  stages: Stage[];
};

export type StationAttempt = {
  thrustPct: number;
  gimbalDeg: number;
  holdStartMs: number;
  holdEndMs: number;
};

export type BurnAttempt = {
  armedOrder: string[];
  stations: Record<string, StationAttempt>;
};

export type Failure = { code: string; station?: string; message: string };

export type BurnResult = {
  ok: boolean;
  failures: Failure[];
  detail: Record<string, unknown>;
};

export declare const TOLERANCE: {
  readonly thrustPct: number;
  readonly gimbalDeg: number;
  readonly ignitionSyncMs: number;
  readonly durationMs: number;
};

export declare const STATIONS: readonly string[];
export declare const STATION_NAMES: Record<string, string>;
export declare const SETBACK_MS: number;

export declare function rng(seed: string): () => number;
export declare function scaleForPlayers(playerCount: number): {
  playerCount: number;
  liveStations: string[];
  stages: number;
};
export declare function generateManeuver(seed: string, playerCount: number, attempt?: number): ManeuverPlan;
export declare function validatePlan(plan: ManeuverPlan): string[];
export declare function validateBurn(stage: Stage, attempt: BurnAttempt, liveStations: string[]): BurnResult;
export declare function readinessView(stationState: unknown): {
  powered: boolean;
  interlockCleared: boolean;
  armed: boolean;
  dialsTouched: boolean;
};
