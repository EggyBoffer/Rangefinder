export type JumpShipClass =
  | "BLACK_OPS"
  | "JUMP_FREIGHTER"
  | "CAPITAL"
  | "SUPERCAP"
  | "RORQUAL"
  | "LANCER";


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
  const mult = 1 + 0.2 * lvl; 
  return baseRangeLy * mult;
}


export function shipClassFromEsiType(input: {
  groupId?: number | null;
  groupName?: string | null;
  typeName?: string | null;
}): JumpShipClass | null {
  const gid = typeof input.groupId === "number" ? input.groupId : null;
  const gname = String(input.groupName || "").trim().toLowerCase();
  const tname = String(input.typeName || "").trim().toLowerCase();


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


  if (gname) {
    if (gname.includes("black ops")) return "BLACK_OPS";
    if (gname.includes("jump freighter")) return "JUMP_FREIGHTER";
    if (gname.includes("capital industrial")) return "RORQUAL";


    if (gname.includes("lancer")) return "LANCER";


    if (gname.includes("force auxiliary")) return "CAPITAL";
    if (gname.includes("carrier")) return "CAPITAL";
    if (gname.includes("dreadnought")) return "CAPITAL";


    if (gname.includes("supercarrier")) return "SUPERCAP";
    if (gname.includes("titan")) return "SUPERCAP";
  }


  const byName = shipClassFromShipName(tname);
  if (byName) return byName;

  return null;
}


export function shipClassFromShipName(shipName: string): JumpShipClass | null {
  const n = String(shipName || "").trim().toLowerCase();
  if (!n) return null;

  // Black Ops
  const blops = new Set(["redeemer", "widow", "sin", "panther", "marshal"]);
  if (blops.has(n)) return "BLACK_OPS";


  const jfs = new Set(["ark", "rhea", "anshar", "nomad"]);
  if (jfs.has(n)) return "JUMP_FREIGHTER";


  if (n === "rorqual") return "RORQUAL";

  
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
