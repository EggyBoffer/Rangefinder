export type JumpShipClass = "BLACK_OPS" | "JUMP_FREIGHTER" | "CAPITAL" | "SUPERCAP" | "RORQUAL" | "LANCER";

export const BASE_JUMP_RANGE_LY: Record<JumpShipClass, number> = {
  BLACK_OPS: 4.0,
  JUMP_FREIGHTER: 5.0,
  CAPITAL: 3.5,
  SUPERCAP: 3.0,
  RORQUAL: 5.0,
  LANCER: 4.0,
};

export function calcJumpRangeLy(baseRangeLy: number, jumpDriveCalibrationLevel: number): number {
  const lvl = clampInt(jumpDriveCalibrationLevel, 0, 5);
  const mult = 1 + 0.2 * lvl;
  return baseRangeLy * mult;
}

export function shipClassFromShipName(shipName: string): JumpShipClass | null {
  const n = String(shipName || "").trim().toLowerCase();
  if (!n) return null;

  const blops = new Set(["redeemer", "widow", "sin", "panther", "marshal"]);
  if (blops.has(n)) return "BLACK_OPS";

  return null;
}

function clampInt(v: number, min: number, max: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  const i = Math.floor(x);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}
