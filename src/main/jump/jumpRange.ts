export type JumpShipClass =
  | "BLACK_OPS"
  | "JUMP_FREIGHTER"
  | "CAPITAL"
  | "SUPERCAP"
  | "RORQUAL"
  | "LANCER";

/**
 * Base jump ranges (lightyears) before Jump Drive Calibration.
 *
 * - Black Ops: 4.0 (8.0 @ JDC V)
 * - Jump Freighter: 5.0 (10.0 @ JDC V)
 * - Capitals (Carrier/Dread/FAX): 3.5 (7.0 @ JDC V)
 * - Supercaps (Supercarrier/Titan): 3.0 (6.0 @ JDC V)
 * - Rorqual: 5.0 (10.0 @ JDC V)
 * - Lancer Dreadnought: 3.5 (7.0 @ JDC V)
 */
export const BASE_JUMP_RANGE_LY: Record<JumpShipClass, number> = {
  BLACK_OPS: 4.0,
  JUMP_FREIGHTER: 5.0,
  CAPITAL: 3.5,
  SUPERCAP: 3.0,
  RORQUAL: 5.0,
  LANCER: 3.5,
};

export function calcJumpRangeLy(baseRangeLy: number, jumpDriveCalibrationLevel: number): number {
  const lvl = clampInt(jumpDriveCalibrationLevel, 0, 5);
  const mult = 1 + 0.2 * lvl; // JDC = +20% range per level
  return baseRangeLy * mult;
}

/**
 * Robust classification for ESI auto mode:
 * Prefer group_id fast-path, then fall back to group name checks, then final fallback to ship name heuristics.
 */
export function shipClassFromEsiType(input: {
  groupId?: number | null;
  groupName?: string | null;
  typeName?: string | null;
}): JumpShipClass | null {
  const gid = typeof input.groupId === "number" ? input.groupId : null;
  const gname = String(input.groupName || "").trim().toLowerCase();
  const tname = String(input.typeName || "").trim().toLowerCase();

  // Known EVE group IDs (stable for years)
  // NOTE: We still also check groupName because CCP can add new groups (e.g. Lancers).
  const GROUP_BLACK_OPS = 898;
  const GROUP_JUMP_FREIGHTER = 902;
  const GROUP_CARRIER = 547;
  const GROUP_DREADNOUGHT = 485;
  const GROUP_FAX = 1538;
  const GROUP_SUPERCARRIER = 659;
  const GROUP_TITAN = 30;
  const GROUP_CAPITAL_INDUSTRIAL = 883;

  if (gid === GROUP_BLACK_OPS) return "BLACK_OPS";
  if (gid === GROUP_JUMP_FREIGHTER) return "JUMP_FREIGHTER";
  if (gid === GROUP_CAPITAL_INDUSTRIAL) return "RORQUAL";
  if (gid === GROUP_CARRIER || gid === GROUP_DREADNOUGHT || gid === GROUP_FAX) return "CAPITAL";
  if (gid === GROUP_SUPERCARRIER || gid === GROUP_TITAN) return "SUPERCAP";

  // Group name based (catches new groups like Lancers cleanly)
  if (gname) {
    if (gname.includes("black ops")) return "BLACK_OPS";
    if (gname.includes("jump freighter")) return "JUMP_FREIGHTER";
    if (gname.includes("capital industrial")) return "RORQUAL";

    // Lancer dreadnoughts (group name contains "lancer" in practice)
    if (gname.includes("lancer")) return "LANCER";

    // Capital buckets
    if (gname.includes("force auxiliary")) return "CAPITAL";
    if (gname.includes("carrier")) return "CAPITAL";
    if (gname.includes("dreadnought")) return "CAPITAL";

    // Supers
    if (gname.includes("supercarrier")) return "SUPERCAP";
    if (gname.includes("titan")) return "SUPERCAP";
  }

  // Final fallback: ship name heuristics (helps if group lookup fails)
  const byName = shipClassFromShipName(tname);
  if (byName) return byName;

  return null;
}

/**
 * Used only as a fallback when ESI group lookup fails.
 */
export function shipClassFromShipName(shipName: string): JumpShipClass | null {
  const n = String(shipName || "").trim().toLowerCase();
  if (!n) return null;

  // Black Ops
  const blops = new Set(["redeemer", "widow", "sin", "panther", "marshal"]);
  if (blops.has(n)) return "BLACK_OPS";

  // Jump Freighters
  const jfs = new Set(["ark", "rhea", "anshar", "nomad"]);
  if (jfs.has(n)) return "JUMP_FREIGHTER";

  // Rorqual
  if (n === "rorqual") return "RORQUAL";

  // Lancer dread hull names
  const lancers = new Set(["bane", "karura", "hubris", "valravn"]);
  if (lancers.has(n)) return "LANCER";

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
