import { calcLightyears } from "../universe/universeMath";
import { ensureGridIndex, getGridCoordsForSystem, getSystemById, getSystemsInGridRange } from "../universe/universeDb";

const LY_IN_METERS = 9460730472580800;

function isWormholeName(name: string): boolean {
  const n = String(name || "").trim();
  return !!n && n[0] === "J";
}

function isValidJumpPoint(secStatus: number | null): boolean {
  if (secStatus === null) return false;
  const v = Number(secStatus);
  if (!Number.isFinite(v)) return false;
  return v < 0.45;
}

function getNeighborsWithinRange(fromId: number, maxLy: number, missing: Set<number>): number[] {
  const from = getSystemById(fromId);
  if (!from) return [];

  const bucketMeters = (maxLy * LY_IN_METERS) / 2;
  ensureGridIndex(bucketMeters);

  const g = getGridCoordsForSystem(fromId);
  if (!g) return [];

  const candidates = getSystemsInGridRange(g.gx, g.gy, g.gz, 10);

  const out: number[] = [];

  for (const cand of candidates) {
    if (cand.id === fromId) continue;
    if (isWormholeName(cand.name)) continue;

    if (cand.secStatus === null) {
      missing.add(cand.id);
      continue;
    }

    if (!isValidJumpPoint(cand.secStatus)) continue;

    const dly = calcLightyears(from.x, from.y, from.z, cand.x, cand.y, cand.z);
    if (dly <= maxLy) out.push(cand.id);
  }

  return out;
}

function rebuildPath(parents: Map<number, number | null>, endId: number): number[] {
  const path: number[] = [];
  let cur: number | null = endId;

  while (cur !== null) {
    path.push(cur);
    cur = parents.get(cur) ?? null;
  }

  path.reverse();
  return path;
}

export function findMidpointsExact(fromId: number, toId: number, maxLy: number, maxDepth: number): { jumps: number; path: number[]; missingSec: number[] } | null {
  const to = getSystemById(toId);
  if (!to) return null;
  if (!isValidJumpPoint(to.secStatus)) return null;

  const missing = new Set<number>();

  const q: Array<{ id: number; depth: number }> = [{ id: fromId, depth: 0 }];
  const seen = new Set<number>([fromId]);
  const parents = new Map<number, number | null>();
  parents.set(fromId, null);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.depth >= maxDepth) continue;

    const neigh = getNeighborsWithinRange(cur.id, maxLy, missing);

    for (const nid of neigh) {
      if (seen.has(nid)) continue;

      parents.set(nid, cur.id);

      if (nid === toId) {
        const path = rebuildPath(parents, toId);
        return { jumps: path.length - 1, path, missingSec: [...missing] };
      }

      seen.add(nid);
      q.push({ id: nid, depth: cur.depth + 1 });
    }
  }

  return null;
}
